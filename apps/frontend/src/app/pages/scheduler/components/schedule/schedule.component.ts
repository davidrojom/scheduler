import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  TemplateRef,
  input,
  DestroyRef,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  NgZone,
} from '@angular/core';
import { Subject, distinctUntilChanged, filter, map } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import {
  CalendarEvent,
  CalendarEventTimesChangedEvent,
  CalendarEventTimesChangedEventType,
  CalendarView,
  CalendarDateFormatter,
} from 'angular-calendar';
import { SharedModule } from '../../../../shared/shared.module';
import { TaskModalComponent } from '../modals/task/task-modal.component';
import { v4 } from 'uuid';
import { TasksService } from '../../../../shared/services/tasks.service';
import { MobileDetectionService } from '../../../../shared/services/mobile-detection.service';
import { TASK_COLORS } from '../../../../shared/constants';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CustomDateFormatter } from '../../../../shared/utils/date-formatter';
import { ProjectService } from '../../../../shared/services/project.service';
import { Project } from '../../../../shared/models/project.model';

interface Task {
  id: string;
  columnId: string;
  title: string;
  start: Date;
  end: Date;
  participants: string[];
  draggable: boolean;
  resizable: {
    beforeStart: boolean;
    afterEnd: boolean;
  };
  color: {
    primary: string;
    secondary: string;
  };
}

@Component({
  selector: 'sch-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      h3 {
        margin: 0 0 10px;
      }

      pre {
        background-color: #f5f5f5;
        padding: 15px;
      }
    `,
  ],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
  providers: [
    {
      provide: CalendarDateFormatter,
      useClass: CustomDateFormatter,
    },
  ],
  standalone: true,
  imports: [SharedModule],
})
export class ScheduleComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  @ViewChild('modalContent', { static: true })
  modalContent!: TemplateRef<unknown>;

  hourSegments = 6;
  dayStartHour = 6;
  dayEndHour = 21;

  columnId = input.required<string>();

  readOnly = input<boolean>(false);

  view: CalendarView = CalendarView.Day;

  CalendarView = CalendarView;

  viewDate: Date = new Date();

  refresh = new Subject<void>();

  tasks: (CalendarEvent & Task)[] = [];

  activeDayIsOpen = true;

  get isMobile(): boolean {
    return this.mobileDetectionService.isMobile;
  }

  constructor(
    private modal: NgbModal,
    private readonly tasksService: TasksService,
    private readonly destroyRef: DestroyRef,
    private readonly mobileDetectionService: MobileDetectionService,
    private readonly projectService: ProjectService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly zone: NgZone
  ) {}

  ngOnInit(): void {
    // The grid's hour range/segment density follows the active board's config
    // reactively: a settings save re-emits currentProject$, so the calendar
    // re-renders in place without a full page reload.
    this.projectService.currentProject$
      .pipe(
        filter((project): project is Project => !!project),
        map((project) => project.config),
        distinctUntilChanged(
          (a, b) =>
            a.dayStartHour === b.dayStartHour &&
            a.dayEndHour === b.dayEndHour &&
            a.segmentsByHour === b.segmentsByHour
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((config) => {
        this.hourSegments = config.segmentsByHour;
        this.dayStartHour = config.dayStartHour;
        this.dayEndHour = config.dayEndHour;
        this.refresh.next();
        this.changeDetector.markForCheck();
      });

    this.tasksService.tasks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((allTasks) => {
        const columnTasks = allTasks.filter(
          (task) => task.columnId === this.columnId()
        );

        this.tasks = columnTasks.map((task) => {
          const color = this.getTaskColor(task, allTasks);

          return {
            id: task.id,
            title: task.title,
            start: task.start,
            end: task.end,
            color: {
              primary: color.primary,
              secondary: color.secondary,
            },
            // On mobile the calendar's own touch-drag is disabled so a finger
            // swipe always scrolls the board; dragging to reschedule is handled
            // by our custom long-press logic (see the touch handlers below).
            // On desktop the library's native mouse drag stays enabled.
            draggable:
              !this.readOnly() && task.draggable && !this.isMobile,
            resizable:
              this.readOnly() || this.isMobile
                ? { beforeStart: false, afterEnd: false }
                : task.resizable,
            participants: task.participants,
            columnId: task.columnId,
          };
        });

        this.refresh.next();
        // Remote task ops update this stream without an originating DOM event;
        // mark this OnPush view dirty so the calendar's [events] input repaints.
        this.changeDetector.markForCheck();
      });
  }

  // ───────────────────────── Mobile long-press drag ─────────────────────────
  // angular-calendar's own touch-drag is disabled on mobile (see the events
  // map above) so a normal finger swipe always scrolls the board. To move a
  // task the user long-presses it: after LONG_PRESS_MS holding still the event
  // "lifts" and a floating ghost follows the finger; on release we snap the
  // vertical delta to the grid and persist the new time.
  //
  // The ghost is a detached clone appended to <body>, NOT the calendar's own
  // element: repositioning the library's node while the touch is active makes
  // angular-calendar clone it on the next change-detection pass (leaving the
  // moved copy hidden behind stale duplicates). The real node is only touched
  // once on release. Plain touch events (no synthetic TouchEvent construction)
  // so it works on iOS Safari as well as Android.
  private readonly LONG_PRESS_MS = 350;
  private readonly MOVE_CANCEL_PX = 12;

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private dragArmed = false;
  private dragTaskId: string | null = null;
  private dragOrigStart: Date | null = null;
  private dragOrigEnd: Date | null = null;
  private pxPerMinute = 0;
  private minutesPerSegment = 0;
  private ghostEl: HTMLElement | null = null;
  // Set when a long-press lifts a task; swallows the synthetic click that a
  // touchend would otherwise fire so a drag/lift never also opens the modal.
  private suppressClick = false;

  ngAfterViewInit(): void {
    const host = this.elementRef.nativeElement;
    // Run outside Angular: these fire on every touchmove and must not schedule
    // change detection until a drag actually commits. The isMobile guard lives
    // inside the handlers so a viewport resize doesn't need a re-bind.
    this.zone.runOutsideAngular(() => {
      host.addEventListener('touchstart', this.onTouchStart, { passive: true });
      // passive:false so we can block scrolling, but only once a drag is armed.
      host.addEventListener('touchmove', this.onTouchMove, { passive: false });
      host.addEventListener('touchend', this.onTouchEnd, { passive: true });
      host.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
    });
  }

  ngOnDestroy(): void {
    const host = this.elementRef.nativeElement;
    host.removeEventListener('touchstart', this.onTouchStart);
    host.removeEventListener('touchmove', this.onTouchMove);
    host.removeEventListener('touchend', this.onTouchEnd);
    host.removeEventListener('touchcancel', this.onTouchEnd);
    this.clearLongPress();
    this.removeGhost();
  }

  private onTouchStart = (event: TouchEvent): void => {
    this.suppressClick = false;
    if (!this.isMobile || this.readOnly() || event.touches.length !== 1) {
      return;
    }
    const calEvent = (event.target as HTMLElement).closest(
      '.cal-event'
    ) as HTMLElement | null;
    const taskId = calEvent?.getAttribute('data-task-id') ?? null;
    if (!calEvent || !taskId) {
      // Empty grid area: leave the gesture untouched so the board scrolls.
      return;
    }
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.dragArmed = false;
    this.dragTaskId = taskId;
    this.clearLongPress();
    this.longPressTimer = setTimeout(() => this.armDrag(), this.LONG_PRESS_MS);
  };

  private onTouchMove = (event: TouchEvent): void => {
    if (!this.dragTaskId) {
      return;
    }
    const touch = event.touches[0];
    if (!this.dragArmed) {
      // Moved before the long-press fired → it's a scroll, not a drag.
      if (
        Math.abs(touch.clientX - this.touchStartX) > this.MOVE_CANCEL_PX ||
        Math.abs(touch.clientY - this.touchStartY) > this.MOVE_CANCEL_PX
      ) {
        this.resetDrag();
      }
      return;
    }
    // Armed: take over the gesture, stop the board scrolling, and move the
    // ghost with the finger (a plain inline transform on our own element).
    event.preventDefault();
    if (this.ghostEl) {
      const deltaY = touch.clientY - this.touchStartY;
      this.ghostEl.style.transform = `translateY(${deltaY}px)`;
    }
  };

  private onTouchEnd = (event: TouchEvent): void => {
    if (this.dragTaskId && this.dragArmed) {
      this.suppressClick = true;
      this.commitDrag(event.changedTouches[0].clientY - this.touchStartY);
    }
    this.resetDrag();
  };

  private armDrag(): void {
    const id = this.dragTaskId;
    const host = this.elementRef.nativeElement;
    const task = this.tasks.find((candidate) => candidate.id === id);
    const calEvent = id
      ? (host.querySelector(
          `.cal-event[data-task-id="${id}"]`
        ) as HTMLElement | null)
      : null;
    const container = calEvent?.closest(
      '.cal-event-container'
    ) as HTMLElement | null;
    const segment = host.querySelector(
      '.cal-hour-segment'
    ) as HTMLElement | null;
    const segmentHeight = segment?.getBoundingClientRect().height ?? 0;
    if (!task || !calEvent || !container || segmentHeight <= 0) {
      this.resetDrag();
      return;
    }
    this.minutesPerSegment = 60 / this.hourSegments;
    this.pxPerMinute = segmentHeight / this.minutesPerSegment;
    this.dragOrigStart = new Date(task.start);
    this.dragOrigEnd = new Date(task.end);
    this.dragArmed = true;

    // Floating ghost that follows the finger, cloned from the real event box
    // but owned by us (in <body>) so the calendar never touches it. Its visual
    // styles are copied from the live element's computed style because, sitting
    // outside the component, it would otherwise lose the calendar's scoped CSS.
    const rect = calEvent.getBoundingClientRect();
    const cs = getComputedStyle(calEvent);
    const ghost = calEvent.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('hidden');
    ghost.style.cssText =
      `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
      `width:${rect.width}px;height:${rect.height}px;margin:0;box-sizing:border-box;` +
      `background:${cs.backgroundColor};color:${cs.color};` +
      `border:${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor};` +
      `border-radius:${cs.borderRadius};padding:${cs.padding};` +
      `font:${cs.font};overflow:hidden;` +
      `z-index:9999;pointer-events:none;opacity:0.95;` +
      `box-shadow:0 8px 20px rgba(0,0,0,0.3);transition:none;`;
    host.ownerDocument.body.appendChild(ghost);
    this.ghostEl = ghost;

    // The real event is deliberately left untouched for the whole gesture:
    // any change to it (style, class or position) while the touch is active
    // makes angular-calendar clone the node on the next change-detection pass.

    // Haptic nudge so the user feels the task "pick up".
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  }

  private commitDrag(deltaY: number): void {
    const task = this.tasks.find(
      (candidate) => candidate.id === this.dragTaskId
    );
    if (!task || !this.dragOrigStart || !this.dragOrigEnd) {
      return;
    }
    const snappedMinutes = this.snapDeltaToMinutes(deltaY);
    if (snappedMinutes === 0) {
      // Lifted but not moved: nothing to persist (the ghost is removed by
      // resetDrag and the real event never moved).
      return;
    }
    const { start, end } = this.shiftWithinDay(
      this.dragOrigStart,
      this.dragOrigEnd,
      snappedMinutes
    );
    // The touch has ended, so repositioning the real event is now safe.
    this.zone.run(() => {
      this.eventTimesChanged({
        type: CalendarEventTimesChangedEventType.Drag,
        event: task,
        newStart: start,
        newEnd: end,
      });
    });
  }

  private snapDeltaToMinutes(deltaY: number): number {
    if (this.pxPerMinute <= 0) {
      return 0;
    }
    return (
      Math.round(deltaY / this.pxPerMinute / this.minutesPerSegment) *
      this.minutesPerSegment
    );
  }

  private shiftWithinDay(
    origStart: Date,
    origEnd: Date,
    minutes: number
  ): { start: Date; end: Date } {
    const durationMs = origEnd.getTime() - origStart.getTime();
    const dayStart = new Date(origStart);
    dayStart.setHours(this.dayStartHour, 0, 0, 0);
    const dayEnd = new Date(origStart);
    dayEnd.setHours(this.dayEndHour, 0, 0, 0);

    let start = new Date(origStart.getTime() + minutes * 60000);
    if (start < dayStart) {
      start = dayStart;
    }
    let end = new Date(start.getTime() + durationMs);
    if (end > dayEnd) {
      end = dayEnd;
      start = new Date(end.getTime() - durationMs);
    }
    return { start, end };
  }

  private removeGhost(): void {
    if (this.ghostEl) {
      this.ghostEl.remove();
      this.ghostEl = null;
    }
  }

  private resetDrag(): void {
    this.clearLongPress();
    this.removeGhost();
    this.dragArmed = false;
    this.dragTaskId = null;
    this.dragOrigStart = null;
    this.dragOrigEnd = null;
  }

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private timeRangesOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date
  ): boolean {
    return start1 < end2 && start2 < end1;
  }

  private hasParticipantConflict(task: Task, allTasks: Task[]): boolean {
    return allTasks.some((otherTask) => {
      if (task.id === otherTask.id) return false;

      if (
        !this.timeRangesOverlap(
          task.start,
          task.end,
          otherTask.start,
          otherTask.end
        )
      ) {
        return false;
      }

      return task.participants.some((participant) =>
        otherTask.participants.includes(participant)
      );
    });
  }

  private getTaskColor(
    task: Task,
    allTasks: Task[]
  ): typeof TASK_COLORS.blue | typeof TASK_COLORS.red {
    return this.hasParticipantConflict(task, allTasks)
      ? TASK_COLORS.red
      : TASK_COLORS.blue;
  }

  eventTimesChanged({
    event,
    newStart,
    newEnd,
  }: CalendarEventTimesChangedEvent): void {
    if (this.readOnly()) {
      return;
    }

    window.umami?.track('task-drag-resize');

    const updatedTasks: Task[] = this.tasks.map((iEvent) => {
      if (iEvent.id === event.id) {
        // TODO: Refactor
        return {
          ...event,
          start: newStart,
          end: newEnd as Date,
          title: iEvent.title,
          columnId: this.columnId(),
          participants: iEvent.participants,
          color: TASK_COLORS.blue,
          draggable: true,
          resizable: this.isMobile
            ? {
                afterEnd: false,
                beforeStart: false,
              }
            : {
                afterEnd: true,
                beforeStart: true,
              },
          id: event.id as string,
        };
      }
      return {
        id: iEvent.id as string,
        title: iEvent.title,
        start: iEvent.start,
        end: iEvent.end,
        columnId: this.columnId(),
        participants: iEvent.participants,
        color: TASK_COLORS.blue,
        draggable: true,
        resizable: this.isMobile
          ? {
              afterEnd: false,
              beforeStart: false,
            }
          : {
              afterEnd: true,
              beforeStart: true,
            },
      };
    });

    for (const updatedTask of updatedTasks) {
      this.tasksService.updateTask(updatedTask);
    }

    this.refresh.next();
  }

  handleEvent(action: 'task' | 'segment', task: CalendarEvent): void {
    if (action === 'segment') {
      if (this.readOnly()) {
        return;
      }

      // Track opening new task modal
      window.umami?.track('open-new-task-modal');

      const modalRef = this.modal.open(TaskModalComponent, {
        size: 'lg',
        backdrop: 'static',
        scrollable: true,
        keyboard: true,
      });

      modalRef.componentInstance.modalData = {
        type: 'add',
        task: {
          ...task,
          id: v4(),
          columnId: this.columnId(),
        },
        saveHandler: (task: Task) => this.addTask(task),
      };
    } else if (action === 'task') {
      // A long-press lift/drag ends with a synthetic click; ignore it so
      // rescheduling a task on mobile never also pops the edit modal.
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }

      // Track opening edit task modal
      window.umami?.track('open-edit-task-modal');

      const modalRef = this.modal.open(TaskModalComponent, {
        size: 'lg',
        backdrop: 'static',
        scrollable: true,
        keyboard: true,
      });

      modalRef.componentInstance.modalTitle = task.title;

      modalRef.componentInstance.modalData = {
        type: 'edit',
        readOnly: this.readOnly(),
        task: {
          ...task,
          columnId: this.columnId(),
        },
        saveHandler: (task: Task) => this.editEvent(task),
        deleteHandler: (taskId: string) => this.deleteTask(taskId),
      };
    }
  }

  addTask(task: Task): void {
    this.tasksService.addTask({
      id: task.id,
      title: task.title,
      columnId: task.columnId,
      end: task.end,
      start: task.start,
      participants: task.participants,
      color: TASK_COLORS.blue,
      draggable: true,
      resizable: this.isMobile
        ? {
            afterEnd: false,
            beforeStart: false,
          }
        : {
            afterEnd: true,
            beforeStart: true,
          },
    });

    this.refresh.next();
  }

  editEvent(task: Task): void {
    this.tasksService.updateTask({
      id: task.id,
      title: task.title,
      columnId: task.columnId,
      end: task.end,
      start: task.start,
      participants: task.participants,
      color: TASK_COLORS.blue,
      draggable: true,
      resizable: this.isMobile
        ? {
            afterEnd: false,
            beforeStart: false,
          }
        : {
            afterEnd: true,
            beforeStart: true,
          },
    });

    this.refresh.next();
  }

  deleteTask(taskId: string) {
    this.tasksService.deleteTask(taskId);

    this.refresh.next();
  }

  formatList(items: string[]): string {
    return new Intl.ListFormat().format(items);
  }
}

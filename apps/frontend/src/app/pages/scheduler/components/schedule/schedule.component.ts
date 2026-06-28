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
  // "lifts" and follows the finger, and on release we snap the vertical delta
  // to the grid and persist the new time. Done natively (no synthetic
  // TouchEvents) so it works on iOS Safari as well as Android.
  private readonly LONG_PRESS_MS = 350;
  private readonly MOVE_CANCEL_PX = 12;

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private dragArmed = false;
  private dragTaskId: string | null = null;
  private dragContainerEl: HTMLElement | null = null;
  private pxPerMinute = 0;
  private minutesPerSegment = 0;
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
    const container = calEvent?.closest(
      '.cal-event-container'
    ) as HTMLElement | null;
    if (!calEvent || !container || !taskId) {
      // Empty grid area: leave the gesture untouched so the board scrolls.
      return;
    }
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.dragArmed = false;
    this.dragTaskId = taskId;
    this.dragContainerEl = container;
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
    // lifted event with the finger.
    event.preventDefault();
    const deltaY = touch.clientY - this.touchStartY;
    if (this.dragContainerEl) {
      this.dragContainerEl.style.transform = `translateY(${deltaY}px)`;
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
    const container = this.dragContainerEl;
    if (!container) {
      return;
    }
    const segment = this.elementRef.nativeElement.querySelector(
      '.cal-hour-segment'
    ) as HTMLElement | null;
    const segmentHeight = segment?.getBoundingClientRect().height ?? 0;
    if (segmentHeight <= 0) {
      this.resetDrag();
      return;
    }
    this.minutesPerSegment = 60 / this.hourSegments;
    this.pxPerMinute = segmentHeight / this.minutesPerSegment;
    this.dragArmed = true;
    container.style.transition = 'none';
    container.style.zIndex = '1000';
    container.classList.add('sch-dragging');
    // Haptic nudge so the user feels the task "pick up".
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  }

  private commitDrag(deltaY: number): void {
    const taskId = this.dragTaskId;
    if (!taskId || this.pxPerMinute <= 0) {
      return;
    }
    const snappedMinutes =
      Math.round(deltaY / this.pxPerMinute / this.minutesPerSegment) *
      this.minutesPerSegment;
    if (snappedMinutes === 0) {
      return;
    }
    const task = this.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return;
    }
    const durationMs = task.end.getTime() - task.start.getTime();
    const dayStart = new Date(task.start);
    dayStart.setHours(this.dayStartHour, 0, 0, 0);
    const dayEnd = new Date(task.start);
    dayEnd.setHours(this.dayEndHour, 0, 0, 0);

    let newStart = new Date(task.start.getTime() + snappedMinutes * 60000);
    if (newStart < dayStart) {
      newStart = dayStart;
    }
    let newEnd = new Date(newStart.getTime() + durationMs);
    if (newEnd > dayEnd) {
      newEnd = dayEnd;
      newStart = new Date(newEnd.getTime() - durationMs);
    }

    this.zone.run(() => {
      this.eventTimesChanged({
        type: CalendarEventTimesChangedEventType.Drag,
        event: task,
        newStart,
        newEnd,
      });
    });
  }

  private resetDrag(): void {
    this.clearLongPress();
    if (this.dragContainerEl) {
      this.dragContainerEl.style.transform = '';
      this.dragContainerEl.style.transition = '';
      this.dragContainerEl.style.zIndex = '';
      this.dragContainerEl.classList.remove('sch-dragging');
    }
    this.dragArmed = false;
    this.dragTaskId = null;
    this.dragContainerEl = null;
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

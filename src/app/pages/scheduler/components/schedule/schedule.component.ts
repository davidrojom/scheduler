import {
  Component,
  ChangeDetectionStrategy,
  ViewChild,
  TemplateRef,
  input,
  DestroyRef,
  OnInit,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import {
  CalendarEvent,
  CalendarEventTimesChangedEvent,
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
export class ScheduleComponent implements OnInit, AfterViewInit {
  @ViewChild('modalContent', { static: true }) modalContent!: TemplateRef<any>;

  hourSegments: number = 6;
  dayStartHour: number = 6;
  dayEndHour: number = 21;

  columnId = input.required<string>();

  view: CalendarView = CalendarView.Day;

  CalendarView = CalendarView;

  viewDate: Date = new Date();

  refresh = new Subject<void>();

  tasks: (CalendarEvent & Task)[] = [];

  activeDayIsOpen: boolean = true;

  private longPressTimer: any;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private readonly LONG_PRESS_DELAY = 500; // 500ms
  private readonly MOVE_THRESHOLD = 10; // 10px
  private readonly TAP_MAX_DURATION = 500; // 500ms
  private currentTouchEventId: string | null = null;
  private currentTouchEvent: TouchEvent | null = null;
  private currentTouchElement: HTMLElement | null = null;
  private isDragEnabled = false;
  private isScrolling = false;

  get isMobile(): boolean {
    return this.mobileDetectionService.isMobile;
  }

  constructor(
    private modal: NgbModal,
    private readonly tasksService: TasksService,
    private readonly destroyRef: DestroyRef,
    private readonly mobileDetectionService: MobileDetectionService,
    private readonly elementRef: ElementRef,
    private readonly projectService: ProjectService
  ) {}

  ngOnInit(): void {
    const config = this.projectService.getProjectConfig();
    this.hourSegments = config.segmentsByHour;
    this.dayStartHour = config.dayStartHour;
    this.dayEndHour = config.dayEndHour;

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
            draggable: task.draggable,
            resizable: this.isMobile
              ? { beforeStart: false, afterEnd: false }
              : task.resizable,
            participants: task.participants,
            columnId: task.columnId,
          };
        });

        this.refresh.next();
      });
  }

  ngAfterViewInit(): void {
    this.setupLongPressDrag();
  }

  private setupLongPressDrag(): void {
    const element = this.elementRef.nativeElement;

    const boundOnTouchStart = this.onTouchStart.bind(this);
    const boundOnTouchMove = this.onTouchMove.bind(this);
    const boundOnTouchEnd = this.onTouchEnd.bind(this);
    const boundOnTouchCancel = this.onTouchCancel.bind(this);

    element.addEventListener('touchstart', boundOnTouchStart, {
      passive: false,
      capture: true,
    });
    element.addEventListener('touchmove', boundOnTouchMove, {
      passive: false,
      capture: true,
    });
    element.addEventListener('touchend', boundOnTouchEnd, {
      passive: false,
      capture: true,
    });
    element.addEventListener('touchcancel', boundOnTouchCancel, {
      passive: false,
      capture: true,
    });
  }

  private onTouchStart(event: TouchEvent): void {
    const target = event.target as HTMLElement;
    const calEvent = target.closest('.cal-event') as HTMLElement;

    if (!calEvent) {
      this.isDragEnabled = false;
      return;
    }

    if (
      this.isDragEnabled &&
      calEvent.getAttribute('data-drag-allowed') === 'true'
    ) {
      return;
    }

    event.stopImmediatePropagation();

    const eventId = this.getEventIdFromElement(calEvent);
    if (!eventId) {
      return;
    }

    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
    this.currentTouchEventId = eventId;
    this.currentTouchEvent = event;
    this.currentTouchElement = calEvent;

    calEvent.classList.add('long-press-waiting');

    this.longPressTimer = setTimeout(() => {
      calEvent.classList.remove('long-press-waiting');
      calEvent.classList.add('long-press-active', 'drag-enabled');

      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

      calEvent.setAttribute('data-drag-allowed', 'true');
      this.isDragEnabled = true;

      this.longPressTimer = null;
      this.triggerCalendarDrag(calEvent, event);
    }, this.LONG_PRESS_DELAY);
  }

  private onTouchMove(event: TouchEvent): void {
    const target = event.target as HTMLElement;
    const calEvent = target.closest('.cal-event') as HTMLElement;

    if (!calEvent) {
      return;
    }

    if (this.isScrolling) {
      return;
    }

    if (
      this.isDragEnabled &&
      calEvent.getAttribute('data-drag-allowed') === 'true'
    ) {
      return;
    }

    if (!event.touches.length) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - this.touchStartX);
    const deltaY = Math.abs(touch.clientY - this.touchStartY);

    if (deltaX > this.MOVE_THRESHOLD || deltaY > this.MOVE_THRESHOLD) {
      this.isScrolling = true;

      if (this.longPressTimer) {
        this.cancelLongPress();
        calEvent.classList.remove('long-press-waiting', 'long-press-active');
        this.currentTouchEventId = null;
        this.isDragEnabled = false;
      }
      return;
    }

    if (this.longPressTimer) {
      event.stopImmediatePropagation();
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    const timerExists = !!this.longPressTimer;
    const touchDuration = Date.now() - this.touchStartTime;

    if (this.longPressTimer && !this.isDragEnabled) {
      if (touchDuration < this.TAP_MAX_DURATION) {
        const lastTouch = event.changedTouches[0];
        const deltaX = Math.abs(lastTouch.clientX - this.touchStartX);
        const deltaY = Math.abs(lastTouch.clientY - this.touchStartY);

        if (deltaX < this.MOVE_THRESHOLD && deltaY < this.MOVE_THRESHOLD) {
          this.cancelLongPress();

          if (this.currentTouchEventId && this.currentTouchElement) {
            const task = this.tasks.find(
              (t) => t.id === this.currentTouchEventId
            );
            if (task) {
              this.handleEvent('task', task);
            }
          }

          this.cleanupTouchState();
          return;
        }
      }

      const allEvents =
        this.elementRef.nativeElement.querySelectorAll('.cal-event');
      allEvents.forEach((calEvent: HTMLElement) => {
        calEvent.classList.remove('long-press-waiting');
      });
      return;
    }

    this.cleanupTouchState();
  }

  private cleanupTouchState(): void {
    const allEvents =
      this.elementRef.nativeElement.querySelectorAll('.cal-event');
    allEvents.forEach((calEvent: HTMLElement) => {
      calEvent.classList.remove(
        'long-press-waiting',
        'long-press-active',
        'drag-enabled'
      );
      calEvent.removeAttribute('data-drag-allowed');
    });

    if (this.longPressTimer) {
      this.cancelLongPress();
    }

    this.currentTouchEventId = null;
    this.currentTouchEvent = null;
    this.currentTouchElement = null;
    this.isDragEnabled = false;
    this.isScrolling = false;
  }

  private onTouchCancel(event: TouchEvent): void {
    this.cleanupTouchState();
  }

  private triggerCalendarDrag(
    calEvent: HTMLElement,
    originalEvent: TouchEvent
  ): void {
    const touch = originalEvent.touches[0];

    const newTouch = new Touch({
      identifier: Date.now(),
      target: calEvent,
      clientX: touch.clientX,
      clientY: touch.clientY,
      screenX: touch.screenX,
      screenY: touch.screenY,
      pageX: touch.pageX,
      pageY: touch.pageY,
      radiusX: 2.5,
      radiusY: 2.5,
      rotationAngle: 0,
      force: 0.5,
    });

    const newTouchEvent = new TouchEvent('touchstart', {
      cancelable: true,
      bubbles: true,
      touches: [newTouch],
      targetTouches: [newTouch],
      changedTouches: [newTouch],
    });

    calEvent.dispatchEvent(newTouchEvent);

    setTimeout(() => {
      const moveTouch = new Touch({
        identifier: Date.now(),
        target: calEvent,
        clientX: touch.clientX + 1,
        clientY: touch.clientY + 1,
        screenX: touch.screenX + 1,
        screenY: touch.screenY + 1,
        pageX: touch.pageX + 1,
        pageY: touch.pageY + 1,
        radiusX: 2.5,
        radiusY: 2.5,
        rotationAngle: 0,
        force: 0.5,
      });

      const moveTouchEvent = new TouchEvent('touchmove', {
        cancelable: true,
        bubbles: true,
        touches: [moveTouch],
        targetTouches: [moveTouch],
        changedTouches: [moveTouch],
      });

      calEvent.dispatchEvent(moveTouchEvent);
    }, 10);
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private getEventIdFromElement(element: Element): string | null {
    const eventElement = element.closest('.cal-event');
    if (!eventElement) {
      return null;
    }

    const textContent = eventElement.textContent?.trim();

    if (textContent) {
      const matchingTask = this.tasks.find((t) =>
        textContent.startsWith(t.title)
      );

      if (matchingTask) {
        return matchingTask.id;
      }
    }

    return null;
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
    (window as any).umami?.track('task-drag-resize');

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
      // Track opening new task modal
      (window as any).umami?.track('open-new-task-modal');

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
      // Track opening edit task modal
      (window as any).umami?.track('open-edit-task-modal');

      const modalRef = this.modal.open(TaskModalComponent, {
        size: 'lg',
        backdrop: 'static',
        scrollable: true,
        keyboard: true,
      });

      modalRef.componentInstance.modalTitle = task.title;

      modalRef.componentInstance.modalData = {
        type: 'edit',
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

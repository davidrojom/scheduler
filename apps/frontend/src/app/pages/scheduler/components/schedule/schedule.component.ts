import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  TemplateRef,
  input,
  DestroyRef,
  OnInit,
} from '@angular/core';
import { Subject, distinctUntilChanged, filter, map } from 'rxjs';
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
export class ScheduleComponent implements OnInit {
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
    private readonly changeDetector: ChangeDetectorRef
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
            draggable: !this.readOnly() && task.draggable,
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

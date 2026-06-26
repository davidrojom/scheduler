import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ModalHeaderComponent } from '../../../../../shared/ui/components/modals/modal-header/modal-header.component';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { SharedModule } from '../../../../../shared/shared.module';
import { NgSelectModule } from '@ng-select/ng-select';
import {
  addMinutes,
  differenceInMinutes,
  getHours,
  getMinutes,
  isBefore,
} from 'date-fns';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ParticipantsService } from '../../../../../shared/services/participants.service';
import { TasksService } from '../../../../../shared/services/tasks.service';
import { SEGMENTS_BY_HOUR } from '../../../../../shared/constants/config';
export interface Task {
  id: string;
  columnId: string;
  title: string;
  start: Date;
  end: Date;
  participants: string[];
}

type ParticipantSelection = string | { name: string };

@Component({
  selector: 'sch-task-modal',
  templateUrl: './task-modal.component.html',
  styleUrl: './task-modal.component.scss',
  standalone: true,
  imports: [ModalHeaderComponent, SharedModule, NgSelectModule],
})
export class TaskModalComponent implements OnInit {
  @ViewChild('title', {
    static: true,
  })
  private readonly columnTitle!: ElementRef<HTMLInputElement>;

  modalTitle = 'Add Task';

  segmentsPerHour = SEGMENTS_BY_HOUR;

  readOnly = false;

  modalData!:
    | {
        type: 'add';
        task: { date: Date; id: string; columnId: string };
        saveHandler: (task: Task) => void;
      }
    | {
        type: 'edit';
        readOnly?: boolean;
        task: Task;
        saveHandler: (task: Task) => void;
        deleteHandler: (taskId: string) => void;
      };

  form = new FormGroup({
    title: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    start: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    end: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    participants: new FormControl<string[]>([], {
      nonNullable: true,
    }),
  });

  conflictedParticipants = new Set<string>();
  participantsWithConflictInfo: {
    name: string;
    isConflicted: boolean;
    displayName: string;
  }[] = [];

  constructor(
    private readonly activeModal: NgbActiveModal,
    private readonly destroyRef: DestroyRef,
    readonly participantsService: ParticipantsService,
    private readonly tasksService: TasksService
  ) {}
  ngOnInit(): void {
    this.form.controls.participants.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((participants) => {
        for (const participant of participants as ParticipantSelection[]) {
          const participantName =
            typeof participant === 'string' ? participant : participant.name;
          this.participantsService.createIfNotExists(participantName);
        }
        this.checkConflicts();
      });

    this.form.controls.start.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkConflicts();
      });

    this.form.controls.end.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkConflicts();
      });

    if (this.modalData.type === 'add') {
      const startDate = new Date(this.modalData.task.date);
      const endDate = addMinutes(
        new Date(this.modalData.task.date),
        60 / this.segmentsPerHour
      );

      const start = `${getHours(startDate)}:${getMinutes(startDate)}`;
      const end = `${getHours(endDate)}:${getMinutes(endDate)}`;

      this.form.patchValue({
        start,
        end,
      });
    } else if (this.modalData.type === 'edit') {
      const start = `${getHours(this.modalData.task.start)}:${getMinutes(
        this.modalData.task.start
      )}`;
      const end = `${getHours(this.modalData.task.end)}:${getMinutes(
        this.modalData.task.end
      )}`;

      this.form.patchValue({
        title: this.modalData.task.title,
        start,
        end,
        participants: this.modalData.task.participants,
      });
    }

    this.updateParticipantsWithConflictInfo();

    this.checkConflicts();

    if (this.modalData.type === 'edit' && this.modalData.readOnly) {
      this.readOnly = true;
      this.form.disable({ emitEvent: false });
      return;
    }

    this.columnTitle.nativeElement.focus();
  }
  closeModal() {
    this.activeModal.close();
  }

  deleteTask(taskId: string) {
    if (this.readOnly || this.modalData.type !== 'edit') {
      return;
    }

    this.modalData.deleteHandler(taskId);
    this.activeModal.close();
  }

  save() {
    if (this.readOnly || !this.form.valid) {
      return;
    }

    const value = this.form.getRawValue();

    const [startHour, startMinute] = value.start.split(':').map(Number);
    const [endHour, endMinute] = value.end.split(':').map(Number);

    const start = new Date();
    start.setHours(startHour, startMinute);

    const end = new Date();
    end.setHours(endHour, endMinute);

    if (isBefore(end, start)) {
      return;
    }

    if (Math.abs(differenceInMinutes(end, start)) < 60 / this.segmentsPerHour) {
      return;
    }

    this.modalData.saveHandler({
      id: this.modalData.task.id,
      title: value.title,
      columnId: this.modalData.task.columnId,
      start,
      end,
      participants: value.participants,
    });

    this.activeModal.close();
  }

  checkConflicts(): void {
    const startValue = this.form.controls.start.value;
    const endValue = this.form.controls.end.value;

    this.conflictedParticipants.clear();

    if (!startValue || !endValue) {
      return;
    }

    const [startHour, startMinute] = startValue.split(':').map(Number);
    const [endHour, endMinute] = endValue.split(':').map(Number);

    if (
      isNaN(startHour) ||
      isNaN(startMinute) ||
      isNaN(endHour) ||
      isNaN(endMinute)
    ) {
      return;
    }

    const start = new Date();
    start.setHours(startHour, startMinute, 0, 0);

    const end = new Date();
    end.setHours(endHour, endMinute, 0, 0);

    if (isBefore(end, start)) {
      return;
    }

    const currentTaskId = this.modalData.task.id;

    const allParticipants = this.participantsService.participants;

    for (const participant of allParticipants) {
      const participantName = participant.name;
      const hasConflict = this.tasksService.tasks.some((task) => {
        if (task.id === currentTaskId) {
          return false;
        }

        if (!task.participants.includes(participantName)) {
          return false;
        }

        const taskStartTime =
          task.start.getHours() * 60 + task.start.getMinutes();
        const taskEndTime = task.end.getHours() * 60 + task.end.getMinutes();
        const newStartTime = start.getHours() * 60 + start.getMinutes();
        const newEndTime = end.getHours() * 60 + end.getMinutes();

        const overlaps =
          taskStartTime < newEndTime && newStartTime < taskEndTime;

        return overlaps;
      });

      if (hasConflict) {
        this.conflictedParticipants.add(participantName);
      }
    }

    this.updateParticipantsWithConflictInfo();
  }

  updateParticipantsWithConflictInfo(): void {
    const participants = this.participantsService.participants;
    this.participantsWithConflictInfo = participants
      .map((p) => ({
        name: p.name,
        isConflicted: this.conflictedParticipants.has(p.name),
        displayName: this.conflictedParticipants.has(p.name)
          ? `⚠️ ${p.name}`
          : p.name,
      }))
      .sort((a, b) => {
        if (a.isConflicted === b.isConflicted) return 0;
        return a.isConflicted ? 1 : -1;
      });
  }

  isParticipantConflicted(participant: string): boolean {
    return this.conflictedParticipants.has(participant);
  }

  getParticipantName(item: ParticipantSelection): string {
    return typeof item === 'string' ? item : item.name;
  }
}

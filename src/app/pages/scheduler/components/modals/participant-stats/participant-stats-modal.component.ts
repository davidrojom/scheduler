import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ModalHeaderComponent } from '../../../../../shared/ui/components/modals/modal-header/modal-header.component';
import { SharedModule } from '../../../../../shared/shared.module';
import { TasksService } from '../../../../../shared/services/tasks.service';
import { ParticipantsService } from '../../../../../shared/services/participants.service';
import { ColumnsService } from '../../../../../shared/services/columns.service';
import { ProjectService } from '../../../../../shared/services/project.service';
import { combineLatest, take } from 'rxjs';
import {
  ParticipantItemComponent,
  ParticipantStats,
} from './components/participant-item/participant-item.component';
import { Task } from './components/task-list-item/task-list-item.component';

@Component({
  selector: 'sch-participant-stats-modal',
  templateUrl: './participant-stats-modal.component.html',
  styleUrl: './participant-stats-modal.component.scss',
  standalone: true,
  imports: [ModalHeaderComponent, SharedModule, ParticipantItemComponent],
})
export class ParticipantStatsModalComponent implements OnInit {
  participantStats: ParticipantStats[] = [];
  private scrollToParticipant: string | null = null;
  newParticipantName = '';

  get modalTitle(): string {
    const count = this.participantStats.length;
    return `Participant Statistics (${count})`;
  }

  get canEdit(): boolean {
    return this.projectService.isCurrentBoardEditable;
  }

  constructor(
    public activeModal: NgbActiveModal,
    private tasksService: TasksService,
    private participantsService: ParticipantsService,
    private columnsService: ColumnsService,
    private projectService: ProjectService,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.participantsService.participants$,
      this.tasksService.tasks$,
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([participants, tasks]) => {
        const columns = this.columnsService.columns;
        const participantMap = new Map<
          string,
          { totalMinutes: number; tasks: Task[] }
        >();

        const expandedStates = new Map<string, boolean>();
        this.participantStats.forEach((stat) => {
          expandedStates.set(stat.name, stat.isExpanded);
        });

        participants.forEach((participant) => {
          participantMap.set(participant.name, {
            totalMinutes: 0,
            tasks: [],
          });
        });

        tasks.forEach((task) => {
          const durationMs = task.end.getTime() - task.start.getTime();
          const durationMinutes = Math.round(durationMs / (1000 * 60));
          const column = columns.find((col) => col.id === task.columnId);

          task.participants.forEach((participant) => {
            if (!participantMap.has(participant)) {
              participantMap.set(participant, { totalMinutes: 0, tasks: [] });
            }

            const participantData = participantMap.get(participant)!;
            participantData.totalMinutes += durationMinutes;
            participantData.tasks.push({
              id: task.id,
              columnId: task.columnId,
              title: task.title,
              start: task.start,
              end: task.end,
              columnTitle: column?.title || 'Unknown',
              durationMinutes: durationMinutes,
            });
          });
        });

        this.participantStats = Array.from(participantMap.entries())
          .map(([name, data]) => ({
            name,
            totalMinutes: data.totalMinutes,
            tasks: data.tasks.sort(
              (a, b) => a.start.getTime() - b.start.getTime()
            ),
            isExpanded: expandedStates.get(name) || false,
          }))
          .sort((a, b) => b.totalMinutes - a.totalMinutes);

        if (this.scrollToParticipant) {
          setTimeout(() => {
            const element = document.getElementById(
              `participant-${this.scrollToParticipant}`
            );
            if (element) {
              element.scrollIntoView({ behavior: 'instant', block: 'nearest' });
            }
            this.scrollToParticipant = null;
          }, 0);
        }
      });
  }

  deleteParticipant(participantName: string): void {
    if (!this.canEdit) {
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete "${participantName}"?\n\nThis will remove them from all tasks and cannot be undone.`
    );

    if (confirmed) {
      this.participantsService.deleteParticipant(participantName);

      this.tasksService.tasks$.pipe(take(1)).subscribe((tasks) => {
        tasks.forEach((task) => {
          if (task.participants.includes(participantName)) {
            const updatedTask = {
              ...task,
              participants: task.participants.filter(
                (p) => p !== participantName
              ),
            };
            this.tasksService.updateTask(updatedTask);
          }
        });
      });
    }
  }

  onRemoveParticipantFromTask(event: {
    participantName: string;
    taskId: string;
  }): void {
    if (!this.canEdit) {
      return;
    }

    this.scrollToParticipant = event.participantName;
    this.tasksService.tasks$.pipe(take(1)).subscribe((tasks) => {
      const task = tasks.find((t) => t.id === event.taskId);
      if (!task) {
        return;
      }

      const updatedTask = {
        ...task,
        participants: task.participants.filter(
          (p) => p !== event.participantName
        ),
      };
      this.tasksService.updateTask(updatedTask);
    });
  }

  onToggleParticipant(participant: ParticipantStats): void {
    participant.isExpanded = !participant.isExpanded;
  }

  addParticipant(): void {
    if (!this.canEdit) {
      return;
    }

    const trimmedName = this.newParticipantName.trim();
    if (!trimmedName) {
      return;
    }

    if (this.participantsService.hasParticipant(trimmedName)) {
      alert(`The participant "${trimmedName}" already exists.`);
      return;
    }

    this.participantsService.addParticipant(trimmedName);
    this.newParticipantName = '';
  }

  close(): void {
    this.activeModal.dismiss();
  }
}

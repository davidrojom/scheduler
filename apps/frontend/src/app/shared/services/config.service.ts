import { Injectable } from '@angular/core';
import { Task } from '../../pages/scheduler/components/modals/task/task-modal.component';
import { PersistenceFacade } from '../persistence/persistence-facade.service';
import {
  BoardColumn,
  BoardContent,
  BoardContentInput,
} from '../persistence/board-persistence';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  constructor(private readonly persistence: PersistenceFacade) {}

  setColumns(columns: BoardColumn[]) {
    this.persistence.setColumns(columns);
  }

  setParticipants(participants: string[]) {
    this.persistence.setParticipants(participants);
  }

  setTasks(tasks: Task[]) {
    this.persistence.setTasks(tasks);
  }

  setConfig(config: BoardContentInput) {
    this.persistence.setConfig(config);
  }

  getConfig(): BoardContent {
    return this.persistence.getConfig();
  }
}

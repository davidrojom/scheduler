import { Injectable } from '@angular/core';

const CURRENT_PROJECT_KEY = 'scheduler_current_project_id';

interface StoredTask {
  id: string;
  title: string;
  startHour: string;
  endHour: string;
  columnId: string;
  participants: string[];
}

interface StoredColumn {
  id: string;
  title: string;
}

type SetConfig =
  | {
      scope: 'columns';
      value: StoredColumn[];
    }
  | {
      scope: 'tasks';
      value: StoredTask[];
    }
  | {
      scope: 'participants';
      value: string[];
    };

@Injectable({
  providedIn: 'root',
})
export class LocalstorageService {
  private getProjectKey(scope: string): string {
    const projectId =
      localStorage.getItem(CURRENT_PROJECT_KEY) || 'default';
    return `${projectId}_${scope}`;
  }
  setAll(config: {
    columns: StoredColumn[];
    tasks: StoredTask[];
    participants: string[];
  }) {
    this.setColumns(config.columns);
    this.setTasks(config.tasks);
    this.setParticipants(config.participants);
  }

  set(config: SetConfig) {
    switch (config.scope) {
      case 'columns':
        this.setColumns(config.value);
        break;
      case 'tasks':
        this.setTasks(config.value);
        break;
      case 'participants':
        this.setParticipants(config.value);
        break;
    }
  }

  private setTasks(tasks: StoredTask[]) {
    localStorage.setItem(this.getProjectKey('tasks'), JSON.stringify(tasks));
  }

  private setParticipants(participants: string[]) {
    localStorage.setItem(
      this.getProjectKey('participants'),
      JSON.stringify(participants)
    );
  }

  private setColumns(columns: StoredColumn[]) {
    localStorage.setItem(
      this.getProjectKey('columns'),
      JSON.stringify(columns)
    );
  }

  findAll(): {
    columns: StoredColumn[];
    tasks: StoredTask[];
    participants: string[];
  } {
    try {
      const columnsKey = this.getProjectKey('columns');
      const tasksKey = this.getProjectKey('tasks');
      const participantsKey = this.getProjectKey('participants');

      const storedColumns = localStorage.getItem(columnsKey);
      const storedTasks = localStorage.getItem(tasksKey);
      const storedParticipants = localStorage.getItem(participantsKey);

      if (!storedColumns) {
        localStorage.setItem(columnsKey, JSON.stringify([]));
      }

      if (!storedTasks) {
        localStorage.setItem(tasksKey, JSON.stringify([]));
      }

      if (!storedParticipants) {
        localStorage.setItem(participantsKey, JSON.stringify([]));
      }

      // TODO(David): add schema validations
      return {
        columns: JSON.parse(
          localStorage.getItem(columnsKey) || '[]'
        ) as StoredColumn[],
        tasks: JSON.parse(
          localStorage.getItem(tasksKey) || '[]'
        ) as StoredTask[],
        participants: JSON.parse(localStorage.getItem(participantsKey) || '[]'),
      };
    } catch (error) {
      console.error('Error parsing data from localstorage', error);
      return {
        columns: [],
        tasks: [],
        participants: [],
      };
    }
  }
}

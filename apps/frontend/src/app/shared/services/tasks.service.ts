import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ConfigService } from './config.service';
import { TASK_COLORS } from '../constants/task.colors';

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

@Injectable({
  providedIn: 'root',
})
export class TasksService {
  private _tasks: Task[] = [];

  private _tasks$ = new BehaviorSubject<Task[]>([]);

  get tasks$() {
    return this._tasks$.asObservable();
  }

  get tasks(): Task[] {
    return this._tasks;
  }

  constructor(private readonly configService: ConfigService) {
    this.setTasks();
  }

  addTask(task: Task): void {
    this._tasks.push(task);

    this._tasks$.next(this._tasks);

    this.configService.setTasks(this._tasks);
  }

  deleteTask(id: string): void {
    this._tasks = this._tasks.filter((task) => task.id !== id);

    this._tasks$.next(this._tasks);

    this.configService.setTasks(this._tasks);
  }

  wipeTasks(): void {
    this._tasks = [];

    this._tasks$.next(this._tasks);

    this.configService.setTasks(this._tasks);
  }

  updateTask(task: Task): void {
    this._tasks = this._tasks.map((storedTask) =>
      storedTask.id === task.id ? task : storedTask
    );

    this._tasks$.next(this._tasks);

    this.configService.setTasks(this._tasks);
  }

  removeTasksByColumnId(columnId: string) {
    this._tasks = this._tasks.filter((task) => task.columnId !== columnId);

    this._tasks$.next(this._tasks);

    this.configService.setTasks(this._tasks);
  }

  setTasks(): void {
    const config = this.configService.getConfig();

    this._tasks = config.tasks.map((task) => {
      return {
        id: task.id,
        title: task.title,
        start: task.start,
        end: task.end,
        columnId: task.columnId,
        participants: task.participants,
        draggable: true,
        resizable: {
          beforeStart: true,
          afterEnd: true,
        },
        color: TASK_COLORS.red,
      };
    });

    this._tasks$.next(this._tasks);
  }
}

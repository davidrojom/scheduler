import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  catchError,
  forkJoin,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';
import { v4 } from 'uuid';

import {
  BoardColumn,
  BoardContent,
  BoardContentInput,
  BoardPersistence,
  ProjectUpdate,
} from './board-persistence';
import { environment } from '../../../environments/environment';
import {
  BoardRole,
  DEFAULT_PROJECT_CONFIG,
  Project,
  ProjectConfig,
} from '../models/project.model';
import { Task } from '../../pages/scheduler/components/modals/task/task-modal.component';

interface BoardSummaryDto {
  id: string;
  name: string;
  myRole: string;
  config: Partial<ProjectConfig>;
  updatedAt: string;
}

interface BoardDto {
  id: string;
  name: string;
  ownerId: string;
  config: Partial<ProjectConfig>;
  createdAt: string;
  updatedAt: string;
}

interface BoardColumnDto {
  id: string;
  title: string;
  position: number;
}

interface BoardTaskDto {
  id: string;
  columnId: string;
  title: string;
  startHour: string;
  endHour: string;
  participants: string[];
  position: number;
}

interface BoardDetailDto {
  board: BoardDto;
  myRole: string;
  members: unknown[];
  columns: BoardColumnDto[];
  tasks: BoardTaskDto[];
  participants: string[];
}

const EMPTY_CONTENT: BoardContent = {
  columns: [],
  tasks: [],
  participants: [],
  logo: null,
};

@Injectable({
  providedIn: 'root',
})
export class ApiBoardPersistence implements BoardPersistence {
  private _projects: Project[] = [];
  private _currentProject: Project | null = null;
  private _content: BoardContent = { ...EMPTY_CONTENT };
  private readonly _pendingCreates = new Map<string, Observable<BoardDto>>();
  private _applyingSnapshot = false;

  private get baseUrl(): string {
    return `${environment.apiBaseUrl}/boards`;
  }

  constructor(private readonly http: HttpClient) {}

  loadProjects(): Project[] {
    return this._projects;
  }

  getProjects(): Project[] {
    return this._projects;
  }

  getCurrentProject(): Project | null {
    return this._currentProject;
  }

  getProjectConfig(projectId?: string): ProjectConfig {
    const project = projectId
      ? this._projects.find((p) => p.id === projectId)
      : this._currentProject;
    return project?.config || DEFAULT_PROJECT_CONFIG;
  }

  refreshBoards(): Observable<Project[]> {
    return this.http.get<BoardSummaryDto[]>(this.baseUrl).pipe(
      map((boards) =>
        boards.map((board) => this.toProject(board, board.myRole))
      ),
      tap((projects) => {
        this._projects = projects;
        const currentId = this._currentProject?.id;
        const stillMember =
          !!currentId && projects.some((p) => p.id === currentId);
        if (!stillMember) {
          this._currentProject = projects[0] ?? null;
        }
      })
    );
  }

  createProject(name: string, config?: Partial<ProjectConfig>): Project {
    const now = new Date();
    const project: Project = {
      id: v4(),
      name,
      config: { ...DEFAULT_PROJECT_CONFIG, ...config },
      createdAt: now,
      updatedAt: now,
      myRole: 'owner',
    };

    this._projects = [...this._projects, project];

    const create$ = this.http
      .post<BoardDto>(this.baseUrl, {
        id: project.id,
        name: project.name,
        config: project.config,
      })
      .pipe(shareReplay(1));

    this._pendingCreates.set(project.id, create$);
    create$.subscribe({
      next: () => this._pendingCreates.delete(project.id),
      error: () => this._pendingCreates.delete(project.id),
    });

    return project;
  }

  updateProject(
    id: string,
    updates: ProjectUpdate
  ): Observable<Project | null> {
    const index = this._projects.findIndex((p) => p.id === id);
    if (index === -1) {
      return of(null);
    }

    this._projects[index] = {
      ...this._projects[index],
      ...updates,
      updatedAt: new Date(),
    };

    if (this._currentProject?.id === id) {
      this._currentProject = this._projects[index];
      if (updates.config !== undefined) {
        this._content = {
          ...this._content,
          logo: updates.config.logo ?? null,
        };
      }
    }

    const body: { name?: string; config?: ProjectConfig } = {};
    if (updates.name !== undefined) {
      body.name = updates.name;
    }
    if (updates.config !== undefined) {
      body.config = updates.config;
    }

    return this.http.patch<BoardDto>(`${this.baseUrl}/${id}`, body).pipe(
      map(() => this._projects[index]),
      catchError(() => of(this._projects[index]))
    );
  }

  deleteProject(id: string): void {
    this._projects = this._projects.filter((p) => p.id !== id);
    if (this._currentProject?.id === id) {
      this._currentProject = this._projects[0] ?? null;
    }

    this.http
      .delete(`${this.baseUrl}/${id}`)
      .subscribe({ error: () => undefined });
  }

  switchProject(id: string): Observable<void> {
    const pending$ = this._pendingCreates.get(id);
    const ready$ = pending$ ? pending$.pipe(catchError(() => of(null))) : of(null);

    return ready$.pipe(
      switchMap(() => this.http.get<BoardDetailDto>(`${this.baseUrl}/${id}`)),
      tap((detail) => {
        this._currentProject = this.toProject(detail.board, detail.myRole);
        this._content = this.toContent(detail);
        const index = this._projects.findIndex((p) => p.id === id);
        if (index !== -1) {
          this._projects[index] = this._currentProject;
        }
        this.beginSnapshot();
      }),
      map(() => undefined),
      catchError(() => {
        const optimistic = this._projects.find((p) => p.id === id);
        if (optimistic) {
          this._currentProject = optimistic;
          this._content = { ...EMPTY_CONTENT };
        }
        this.beginSnapshot();
        return of(undefined);
      })
    );
  }

  getConfig(): BoardContent {
    return this._content;
  }

  setColumns(columns: BoardColumn[]): void {
    const previous = this._content.columns;
    this._content = { ...this._content, columns };

    const boardId = this._currentProject?.id;
    if (this._applyingSnapshot || !boardId) {
      return;
    }
    this.applyColumns(boardId, previous, columns);
  }

  setParticipants(participants: string[]): void {
    const previous = this._content.participants;
    this._content = { ...this._content, participants };

    const boardId = this._currentProject?.id;
    if (this._applyingSnapshot || !boardId) {
      return;
    }
    this.applyParticipants(boardId, previous, participants);
  }

  setTasks(tasks: Task[]): void {
    const previous = this._content.tasks;
    this._content = { ...this._content, tasks };

    const boardId = this._currentProject?.id;
    if (this._applyingSnapshot || !boardId) {
      return;
    }
    this.applyTasks(boardId, previous, tasks);
  }

  setConfig(config: BoardContentInput): void {
    const previous = this._content;
    const logo = config.logo ?? null;
    this._content = {
      columns: config.columns,
      tasks: config.tasks,
      participants: config.participants,
      logo,
    };

    const boardId = this._currentProject?.id;
    if (this._applyingSnapshot || !boardId) {
      return;
    }

    const columnCreates = this.applyColumns(
      boardId,
      previous.columns,
      config.columns
    );
    this.applyParticipants(boardId, previous.participants, config.participants);
    this.applyLogo(boardId, previous.logo, logo);

    // Tasks reference columns by FK, so any brand-new columns must be created
    // before tasks that point at them (relevant to a full board import).
    const syncTasks = () =>
      this.applyTasks(boardId, previous.tasks, config.tasks);
    if (columnCreates.length > 0) {
      forkJoin(columnCreates)
        .pipe(catchError(() => of(null)))
        .subscribe({ next: syncTasks, error: syncTasks });
    } else {
      syncTasks();
    }
  }

  /**
   * Suppresses content writes for the synchronous rehydration that follows a
   * board load: re-emitting columns rebuilds the scheduler form, whose
   * valueChanges echo back through setColumns. Those echoes would otherwise be
   * misread as user deletes/creates against the freshly loaded snapshot.
   */
  private beginSnapshot(): void {
    this._applyingSnapshot = true;
    queueMicrotask(() => {
      this._applyingSnapshot = false;
    });
  }

  private applyColumns(
    boardId: string,
    previous: BoardColumn[],
    next: BoardColumn[]
  ): Observable<unknown>[] {
    const previousById = new Map(previous.map((c) => [c.id, c]));
    const nextIds = new Set(next.map((c) => c.id));
    const creates: Observable<unknown>[] = [];

    for (const column of next) {
      const existing = previousById.get(column.id);
      if (!existing) {
        const create$ = this.http
          .post(`${this.baseUrl}/${boardId}/columns`, {
            id: column.id,
            title: column.title,
          })
          .pipe(shareReplay(1));
        creates.push(create$);
        this.fire(create$);
      } else if (existing.title !== column.title) {
        this.fire(
          this.http.patch(`${this.baseUrl}/${boardId}/columns/${column.id}`, {
            title: column.title,
          })
        );
      }
    }

    for (const column of previous) {
      if (!nextIds.has(column.id)) {
        this.fire(
          this.http.delete(`${this.baseUrl}/${boardId}/columns/${column.id}`)
        );
      }
    }

    const onlyReordered =
      creates.length === 0 &&
      previous.length === next.length &&
      next.every((c) => previousById.has(c.id)) &&
      next.some((c, i) => previous[i]?.id !== c.id);
    if (onlyReordered) {
      this.fire(
        this.http.patch(`${this.baseUrl}/${boardId}/columns/reorder`, {
          orderedIds: next.map((c) => c.id),
        })
      );
    }

    return creates;
  }

  private applyTasks(boardId: string, previous: Task[], next: Task[]): void {
    const previousById = new Map(previous.map((t) => [t.id, t]));
    const nextIds = new Set(next.map((t) => t.id));

    for (const task of next) {
      const existing = previousById.get(task.id);
      const payload = this.toTaskPayload(task);
      if (!existing) {
        this.fire(
          this.http.post(`${this.baseUrl}/${boardId}/tasks`, {
            id: task.id,
            ...payload,
          })
        );
      } else if (this.taskChanged(existing, task)) {
        this.fire(
          this.http.patch(`${this.baseUrl}/${boardId}/tasks/${task.id}`, payload)
        );
      }
    }

    for (const task of previous) {
      if (!nextIds.has(task.id)) {
        this.fire(
          this.http.delete(`${this.baseUrl}/${boardId}/tasks/${task.id}`)
        );
      }
    }
  }

  private applyParticipants(
    boardId: string,
    previous: string[],
    next: string[]
  ): void {
    const previousSet = new Set(previous);
    const nextSet = new Set(next);

    for (const name of next) {
      if (!previousSet.has(name)) {
        this.fire(
          this.http.post(`${this.baseUrl}/${boardId}/participants`, { name })
        );
      }
    }

    for (const name of previous) {
      if (!nextSet.has(name)) {
        this.fire(
          this.http.delete(`${this.baseUrl}/${boardId}/participants`, {
            body: { name },
          })
        );
      }
    }
  }

  private applyLogo(
    boardId: string,
    previousLogo: string | null,
    nextLogo: string | null
  ): void {
    if (previousLogo === nextLogo) {
      return;
    }

    const config: ProjectConfig = {
      ...(this._currentProject?.config ?? DEFAULT_PROJECT_CONFIG),
      logo: nextLogo ?? undefined,
    };

    if (this._currentProject) {
      this._currentProject = { ...this._currentProject, config };
    }

    this.fire(this.http.patch(`${this.baseUrl}/${boardId}`, { config }));
  }

  private toTaskPayload(task: Task): {
    columnId: string;
    title: string;
    startHour: string;
    endHour: string;
    participants: string[];
  } {
    return {
      columnId: task.columnId,
      title: task.title,
      startHour: this.toHourMinute(task.start),
      endHour: this.toHourMinute(task.end),
      participants: task.participants ?? [],
    };
  }

  private taskChanged(previous: Task, next: Task): boolean {
    return (
      previous.columnId !== next.columnId ||
      previous.title !== next.title ||
      this.toHourMinute(previous.start) !== this.toHourMinute(next.start) ||
      this.toHourMinute(previous.end) !== this.toHourMinute(next.end) ||
      JSON.stringify(previous.participants ?? []) !==
        JSON.stringify(next.participants ?? [])
    );
  }

  private toHourMinute(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getHours()}:${date.getMinutes()}`;
  }

  private fire(request$: Observable<unknown>): void {
    request$.subscribe({ error: () => undefined });
  }

  private toProject(
    board: BoardSummaryDto | BoardDto,
    role?: string
  ): Project {
    const updatedAt = new Date(board.updatedAt);
    const createdAt =
      'createdAt' in board && board.createdAt
        ? new Date(board.createdAt)
        : updatedAt;

    return {
      id: board.id,
      name: board.name,
      config: { ...DEFAULT_PROJECT_CONFIG, ...board.config },
      createdAt,
      updatedAt,
      myRole: role as BoardRole | undefined,
    };
  }

  private toContent(detail: BoardDetailDto): BoardContent {
    const columns = [...detail.columns]
      .sort((a, b) => a.position - b.position)
      .map((column) => ({ id: column.id, title: column.title }));

    const tasks: Task[] = detail.tasks.map((task) => {
      const start = new Date();
      const end = new Date();

      const [startHour, startMinute] = task.startHour.split(':').map(Number);
      const [endHour, endMinute] = task.endHour.split(':').map(Number);

      start.setHours(startHour, startMinute);
      end.setHours(endHour, endMinute);

      return {
        id: task.id,
        columnId: task.columnId,
        title: task.title,
        start,
        end,
        participants: task.participants,
      };
    });

    return {
      columns,
      tasks,
      participants: detail.participants,
      logo: detail.board.config.logo ?? null,
    };
  }
}

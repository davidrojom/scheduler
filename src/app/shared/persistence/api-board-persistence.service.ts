import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
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

  fetchBoards(): Observable<Project[]> {
    return this.http.get<BoardSummaryDto[]>(this.baseUrl).pipe(
      map((boards) => boards.map((board) => this.toProject(board))),
      tap((projects) => {
        this._projects = projects;
        if (!this._currentProject && projects.length > 0) {
          this._currentProject = projects[0];
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
    };

    this._projects = [...this._projects, project];

    this.http
      .post<BoardDto>(this.baseUrl, {
        id: project.id,
        name: project.name,
        config: project.config,
      })
      .subscribe({ error: () => undefined });

    return project;
  }

  updateProject(id: string, updates: ProjectUpdate): Project | null {
    const index = this._projects.findIndex((p) => p.id === id);
    if (index === -1) {
      return null;
    }

    this._projects[index] = {
      ...this._projects[index],
      ...updates,
      updatedAt: new Date(),
    };

    if (this._currentProject?.id === id) {
      this._currentProject = this._projects[index];
    }

    const body: { name?: string; config?: ProjectConfig } = {};
    if (updates.name !== undefined) {
      body.name = updates.name;
    }
    if (updates.config !== undefined) {
      body.config = updates.config;
    }

    this.http
      .patch<BoardDto>(`${this.baseUrl}/${id}`, body)
      .subscribe({ error: () => undefined });

    return this._projects[index];
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
    return this.http.get<BoardDetailDto>(`${this.baseUrl}/${id}`).pipe(
      tap((detail) => {
        this._currentProject = this.toProject(detail.board);
        this._content = this.toContent(detail);
      }),
      map(() => undefined)
    );
  }

  getConfig(): BoardContent {
    return this._content;
  }

  setColumns(columns: BoardColumn[]): void {
    this._content = { ...this._content, columns };
  }

  setParticipants(participants: string[]): void {
    this._content = { ...this._content, participants };
  }

  setTasks(tasks: Task[]): void {
    this._content = { ...this._content, tasks };
  }

  setConfig(config: BoardContentInput): void {
    this._content = {
      columns: config.columns,
      tasks: config.tasks,
      participants: config.participants,
      logo: config.logo ?? null,
    };
  }

  private toProject(board: BoardSummaryDto | BoardDto): Project {
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

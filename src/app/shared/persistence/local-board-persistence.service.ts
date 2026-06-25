import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { v4 } from 'uuid';

import {
  BoardColumn,
  BoardContent,
  BoardContentInput,
  BoardPersistence,
  ProjectUpdate,
} from './board-persistence';
import { LocalstorageService } from '../services/localstorage.service';
import { LogoService } from '../services/logo.service';
import {
  DEFAULT_PROJECT_CONFIG,
  Project,
  ProjectConfig,
} from '../models/project.model';
import { Task } from '../../pages/scheduler/components/modals/task/task-modal.component';

const PROJECTS_STORAGE_KEY = 'scheduler_projects';
const CURRENT_PROJECT_KEY = 'scheduler_current_project_id';
const MIGRATION_VERSION_KEY = 'scheduler_migration_version';
const CURRENT_MIGRATION_VERSION = 1;

@Injectable({
  providedIn: 'root',
})
export class LocalBoardPersistence implements BoardPersistence {
  private _projects: Project[] = [];
  private _currentProject: Project | null = null;
  private _loaded = false;

  constructor(
    private readonly localstorageService: LocalstorageService,
    private readonly logoService: LogoService
  ) {}

  loadProjects(): Project[] {
    this.ensureLoaded();
    return this._projects;
  }

  getProjects(): Project[] {
    this.ensureLoaded();
    return this._projects;
  }

  getCurrentProject(): Project | null {
    this.ensureLoaded();
    return this._currentProject;
  }

  getProjectConfig(projectId?: string): ProjectConfig {
    this.ensureLoaded();
    const project = projectId
      ? this._projects.find((p) => p.id === projectId)
      : this._currentProject;
    return project?.config || DEFAULT_PROJECT_CONFIG;
  }

  refreshBoards(): Observable<Project[]> {
    this.ensureLoaded();
    return of(this._projects);
  }

  createProject(name: string, config?: Partial<ProjectConfig>): Project {
    this.ensureLoaded();
    return this.createProjectInternal(name, config);
  }

  updateProject(id: string, updates: ProjectUpdate): Observable<Project | null> {
    this.ensureLoaded();
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
    }

    this.saveProjects();
    return of(this._projects[index]);
  }

  deleteProject(id: string): void {
    this.ensureLoaded();

    this._projects = this._projects.filter((p) => p.id !== id);
    this.saveProjects();

    if (this._currentProject?.id === id) {
      this._currentProject = this._projects[0] ?? null;
      this.saveCurrentProjectId();
    }

    localStorage.removeItem(`${id}_columns`);
    localStorage.removeItem(`${id}_tasks`);
    localStorage.removeItem(`${id}_participants`);
  }

  switchProject(id: string): Observable<void> {
    this.ensureLoaded();
    const project = this._projects.find((p) => p.id === id);
    if (project) {
      this._currentProject = project;
      this.saveCurrentProjectId();
    }
    return of(undefined);
  }

  getConfig(): BoardContent {
    this.ensureLoaded();
    const config = this.localstorageService.findAll();

    return {
      columns: config.columns,
      participants: config.participants,
      tasks: config.tasks.map((task) => {
        const start = new Date();
        const end = new Date();

        // Workaround due to scheduler not supporting fixed days
        const [startHour, startMinute] = task.startHour.split(':').map(Number);
        const [endHour, endMinute] = task.endHour.split(':').map(Number);

        start.setHours(startHour, startMinute);
        end.setHours(endHour, endMinute);

        return {
          columnId: task.columnId,
          id: task.id,
          title: task.title,
          start,
          end,
          participants: task.participants,
        };
      }),
      logo: this.logoService.getLogo(),
    };
  }

  setColumns(columns: BoardColumn[]): void {
    this.ensureLoaded();
    this.localstorageService.set({
      scope: 'columns',
      value: columns,
    });
  }

  setParticipants(participants: string[]): void {
    this.ensureLoaded();
    this.localstorageService.set({
      scope: 'participants',
      value: participants,
    });
  }

  setTasks(tasks: Task[]): void {
    this.ensureLoaded();
    this.localstorageService.set({
      scope: 'tasks',
      value: tasks.map((task) => {
        const startHour = `${task.start.getHours()}:${task.start.getMinutes()}`;
        const endHour = `${task.end.getHours()}:${task.end.getMinutes()}`;

        return {
          id: task.id,
          title: task.title,
          columnId: task.columnId,
          startHour,
          endHour,
          participants: task.participants,
        };
      }),
    });
  }

  setConfig(config: BoardContentInput): void {
    this.ensureLoaded();

    this.localstorageService.set({
      scope: 'columns',
      value: config.columns,
    });

    this.localstorageService.set({
      scope: 'participants',
      value: config.participants,
    });

    this.localstorageService.set({
      scope: 'tasks',
      value: config.tasks.map((task) => {
        const start = new Date(task.start);
        const end = new Date(task.end);

        const startHour = `${start.getHours()}:${start.getMinutes()}`;
        const endHour = `${end.getHours()}:${end.getMinutes()}`;

        return {
          id: task.id,
          title: task.title,
          columnId: task.columnId,
          startHour,
          endHour,
          participants: task.participants,
        };
      }),
    });

    if (config.logo) {
      this.logoService.setLogo(config.logo);
    } else {
      this.logoService.removeLogo();
    }
  }

  private ensureLoaded(): void {
    if (this._loaded) {
      return;
    }
    this._loaded = true;
    this.doLoadProjects();
  }

  private doLoadProjects(): void {
    const projectsJson = localStorage.getItem(PROJECTS_STORAGE_KEY);
    const currentProjectId = localStorage.getItem(CURRENT_PROJECT_KEY);
    const migrationVersion = parseInt(
      localStorage.getItem(MIGRATION_VERSION_KEY) || '0'
    );

    if (projectsJson) {
      this._projects = JSON.parse(projectsJson).map((p: Project) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      }));
    }

    const needsMigration = migrationVersion < CURRENT_MIGRATION_VERSION;
    const hasOldData = this.hasOldDataFormat();

    if (this._projects.length === 0) {
      const defaultProject = this.createProjectInternal('Default Project');
      this._currentProject = defaultProject;
      if (hasOldData) {
        this.migrateOldData(defaultProject.id);
      }
    } else {
      this._currentProject =
        this._projects.find((p) => p.id === currentProjectId) ||
        this._projects[0];

      if (needsMigration && hasOldData) {
        this.migrateOldData(this._currentProject.id);
      }
    }

    if (needsMigration) {
      localStorage.setItem(
        MIGRATION_VERSION_KEY,
        CURRENT_MIGRATION_VERSION.toString()
      );
    }

    this.saveCurrentProjectId();
  }

  private createProjectInternal(
    name: string,
    config?: Partial<ProjectConfig>
  ): Project {
    const now = new Date();
    const project: Project = {
      id: v4(),
      name,
      config: { ...DEFAULT_PROJECT_CONFIG, ...config },
      createdAt: now,
      updatedAt: now,
    };

    this._projects.push(project);
    this.saveProjects();
    return project;
  }

  private hasOldDataFormat(): boolean {
    return !!(
      localStorage.getItem('columns') ||
      localStorage.getItem('tasks') ||
      localStorage.getItem('participants')
    );
  }

  private migrateOldData(projectId: string): void {
    const oldColumns = localStorage.getItem('columns');
    const oldTasks = localStorage.getItem('tasks');
    const oldParticipants = localStorage.getItem('participants');

    let migratedCount = 0;

    if (oldColumns) {
      localStorage.setItem(`${projectId}_columns`, oldColumns);
      localStorage.removeItem('columns');
      migratedCount++;
    }
    if (oldTasks) {
      localStorage.setItem(`${projectId}_tasks`, oldTasks);
      localStorage.removeItem('tasks');
      migratedCount++;
    }
    if (oldParticipants) {
      localStorage.setItem(`${projectId}_participants`, oldParticipants);
      localStorage.removeItem('participants');
      migratedCount++;
    }

    if (migratedCount > 0) {
      console.log(
        `✅ Data migration complete: ${migratedCount} data types migrated to project ${projectId}`
      );
    }
  }

  private saveProjects(): void {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(this._projects));
  }

  private saveCurrentProjectId(): void {
    if (this._currentProject) {
      localStorage.setItem(CURRENT_PROJECT_KEY, this._currentProject.id);
    }
  }
}

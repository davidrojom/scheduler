import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  BoardColumn,
  BoardContent,
  BoardContentInput,
  BoardPersistence,
  ProjectUpdate,
} from './board-persistence';
import { LocalBoardPersistence } from './local-board-persistence.service';
import { ApiBoardPersistence } from './api-board-persistence.service';
import { AuthService } from '../services/auth.service';
import { Project, ProjectConfig } from '../models/project.model';
import { Task } from '../../pages/scheduler/components/modals/task/task-modal.component';
import { BoardSyncScope } from '../collaboration/collab-content.reducer';

@Injectable({
  providedIn: 'root',
})
export class PersistenceFacade implements BoardPersistence {
  constructor(
    private readonly authService: AuthService,
    private readonly local: LocalBoardPersistence,
    private readonly api: ApiBoardPersistence
  ) {}

  get active(): BoardPersistence {
    return this.authService.isAuthenticated ? this.api : this.local;
  }

  /**
   * Rehydrate signals from the realtime/REST strategy (remote ops, reconnect
   * re-sync). Anonymous localStorage never emits, so this is always the API
   * strategy's stream regardless of the current active strategy.
   */
  get contentSync$(): Observable<BoardSyncScope[]> {
    return this.api.contentSync$;
  }

  loadProjects(): Project[] {
    return this.active.loadProjects();
  }

  getProjects(): Project[] {
    return this.active.getProjects();
  }

  getCurrentProject(): Project | null {
    return this.active.getCurrentProject();
  }

  getProjectConfig(projectId?: string): ProjectConfig {
    return this.active.getProjectConfig(projectId);
  }

  refreshBoards(): Observable<Project[]> {
    return this.active.refreshBoards();
  }

  createProject(name: string, config?: Partial<ProjectConfig>): Project {
    return this.active.createProject(name, config);
  }

  updateProject(
    id: string,
    updates: ProjectUpdate
  ): Observable<Project | null> {
    return this.active.updateProject(id, updates);
  }

  deleteProject(id: string): void {
    this.active.deleteProject(id);
  }

  /**
   * Drops a board from local state without a server DELETE, for when the server
   * already revoked access (the owner removed the user). Only DB boards gain
   * collaborators, so this delegates straight to the API strategy.
   */
  removeBoardLocally(id: string): void {
    this.api.removeBoardLocally(id);
  }

  switchProject(id: string): Observable<void> {
    return this.active.switchProject(id);
  }

  getConfig(): BoardContent {
    return this.active.getConfig();
  }

  setColumns(columns: BoardColumn[]): void {
    this.active.setColumns(columns);
  }

  setTasks(tasks: Task[]): void {
    this.active.setTasks(tasks);
  }

  setParticipants(participants: string[]): void {
    this.active.setParticipants(participants);
  }

  setConfig(config: BoardContentInput): void {
    this.active.setConfig(config);
  }
}

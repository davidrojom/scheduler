import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Project, ProjectConfig } from '../models/project.model';
import { PersistenceFacade } from '../persistence/persistence-facade.service';
import { ProjectUpdate } from '../persistence/board-persistence';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private _projects$ = new BehaviorSubject<Project[]>([]);
  private _currentProject$ = new BehaviorSubject<Project | null>(null);

  get projects$(): Observable<Project[]> {
    return this._projects$.asObservable();
  }

  get currentProject$(): Observable<Project | null> {
    return this._currentProject$.asObservable();
  }

  get currentProject(): Project | null {
    return this.persistence.getCurrentProject();
  }

  get projects(): Project[] {
    return this.persistence.getProjects();
  }

  constructor(private readonly persistence: PersistenceFacade) {
    const projects = this.persistence.loadProjects();
    this._projects$.next(projects);
    this._currentProject$.next(this.persistence.getCurrentProject());
  }

  createProject(name: string, config?: Partial<ProjectConfig>): Project {
    const project = this.persistence.createProject(name, config);
    this._projects$.next(this.persistence.getProjects());
    return project;
  }

  updateProject(id: string, updates: ProjectUpdate): void {
    this.persistence.updateProject(id, updates);
    this._projects$.next(this.persistence.getProjects());

    if (this.persistence.getCurrentProject()?.id === id) {
      this._currentProject$.next(this.persistence.getCurrentProject());
    }
  }

  deleteProject(id: string): void {
    if (this.persistence.getProjects().length <= 1) {
      alert('Cannot delete the last project');
      return;
    }

    const wasCurrent = this.persistence.getCurrentProject()?.id === id;

    this.persistence.deleteProject(id);
    this._projects$.next(this.persistence.getProjects());

    if (wasCurrent) {
      this._currentProject$.next(this.persistence.getCurrentProject());
    }
  }

  switchProject(id: string): void {
    this.persistence.switchProject(id).subscribe({
      next: () => {
        this._currentProject$.next(this.persistence.getCurrentProject());
      },
    });
  }

  getProjectConfig(projectId?: string): ProjectConfig {
    return this.persistence.getProjectConfig(projectId);
  }
}

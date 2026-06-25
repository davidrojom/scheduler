import { Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BehaviorSubject,
  Observable,
  filter,
  map,
  of,
  switchMap,
  take,
} from 'rxjs';
import { Project, ProjectConfig } from '../models/project.model';
import { User } from '../models/user.model';
import { PersistenceFacade } from '../persistence/persistence-facade.service';
import { ProjectUpdate } from '../persistence/board-persistence';
import { BoardMigrationService } from '../persistence/board-migration.service';
import { AuthService } from './auth.service';

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

  constructor(
    private readonly persistence: PersistenceFacade,
    private readonly authService: AuthService,
    private readonly migration: BoardMigrationService
  ) {
    // Auth state drives which board set is shown: anonymous loads localStorage
    // synchronously; authenticated runs the first-login local→DB migration
    // (once the user id is known) BEFORE (re)fetching DB boards so migrated
    // boards are already in the listing. switchMap cancels a pending migration
    // if the user logs out before /auth/me resolves. The initial false value is
    // emitted synchronously, so the anonymous initial load stays synchronous.
    this.authService.authState$
      .pipe(
        switchMap((authenticated) =>
          authenticated ? this.migrateOnLogin$() : of(undefined)
        ),
        takeUntilDestroyed()
      )
      .subscribe(() => this.reloadFromPersistence());
  }

  private migrateOnLogin$(): Observable<void> {
    return this.authService.currentUser$.pipe(
      filter((user): user is User => !!user),
      take(1),
      switchMap((user) => this.migration.migrateLocalBoards(user.id))
    );
  }

  createProject(name: string, config?: Partial<ProjectConfig>): Project {
    const project = this.persistence.createProject(name, config);
    this._projects$.next(this.persistence.getProjects());
    return project;
  }

  updateProject(id: string, updates: ProjectUpdate): Observable<void> {
    const result$ = this.persistence.updateProject(id, updates);

    this._projects$.next(this.persistence.getProjects());
    if (this.persistence.getCurrentProject()?.id === id) {
      this._currentProject$.next(this.persistence.getCurrentProject());
    }

    return result$.pipe(map(() => undefined));
  }

  deleteProject(id: string): void {
    // The last localStorage project is protected (anonymous always keeps a
    // board); DB users may delete every board (owner-only, enforced server-side).
    if (
      !this.authService.isAuthenticated &&
      this.persistence.getProjects().length <= 1
    ) {
      alert('Cannot delete the last project');
      return;
    }

    const wasCurrent = this.persistence.getCurrentProject()?.id === id;

    this.persistence.deleteProject(id);
    this._projects$.next(this.persistence.getProjects());

    if (wasCurrent) {
      const newCurrent = this.persistence.getCurrentProject();
      if (newCurrent) {
        this.persistence.switchProject(newCurrent.id).subscribe({
          next: () =>
            this._currentProject$.next(this.persistence.getCurrentProject()),
          error: () =>
            this._currentProject$.next(this.persistence.getCurrentProject()),
        });
      } else {
        this._currentProject$.next(null);
      }
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

  private reloadFromPersistence(): void {
    this.persistence.refreshBoards().subscribe({
      next: (projects) => {
        this._projects$.next(projects);

        const current = this.persistence.getCurrentProject();
        if (current) {
          this.persistence.switchProject(current.id).subscribe({
            next: () =>
              this._currentProject$.next(this.persistence.getCurrentProject()),
            error: () =>
              this._currentProject$.next(this.persistence.getCurrentProject()),
          });
        } else {
          this._currentProject$.next(null);
        }
      },
      error: () => {
        this._projects$.next(this.persistence.getProjects());
        this._currentProject$.next(this.persistence.getCurrentProject());
      },
    });
  }
}

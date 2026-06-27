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
  tap,
} from 'rxjs';
import { Project, ProjectConfig } from '../models/project.model';
import { User } from '../models/user.model';
import { PersistenceFacade } from '../persistence/persistence-facade.service';
import { ProjectUpdate } from '../persistence/board-persistence';
import { BoardMigrationService } from '../persistence/board-migration.service';
import { BoardSyncScope } from '../collaboration/collab-content.reducer';
import { CollaborationService } from '../collaboration/collaboration.service';
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

  /**
   * Whether the active board accepts content mutations for the current user.
   * Anonymous localStorage boards (no role) and owner/editor DB boards are
   * editable; only an authenticated `viewer` is read-only. Mirrors the
   * server-side role enforcement so the UI never offers a control the API rejects.
   */
  get canEditCurrentBoard$(): Observable<boolean> {
    return this.currentProject$.pipe(
      map((project) => project?.myRole !== 'viewer')
    );
  }

  get isCurrentBoardEditable(): boolean {
    return this.currentProject?.myRole !== 'viewer';
  }

  /**
   * Streams the rehydrate scopes emitted when the active board's content was
   * replaced by a remote collaborator op or a reconnect re-sync. The scheduler
   * page subscribes to re-read columns/tasks/participants reactively.
   */
  get boardContentSync$(): Observable<BoardSyncScope[]> {
    return this.persistence.contentSync$;
  }

  constructor(
    private readonly persistence: PersistenceFacade,
    private readonly authService: AuthService,
    private readonly migration: BoardMigrationService,
    private readonly collab: CollaborationService
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

    // A remote board:update (rename/config) replaces the active project in the
    // persistence layer; re-emit so the switcher label and board config follow
    // live without a reload.
    this.persistence.contentSync$
      .pipe(takeUntilDestroyed())
      .subscribe((scopes) => {
        if (scopes.includes('project')) {
          this._projects$.next(this.persistence.getProjects());
          this._currentProject$.next(this.persistence.getCurrentProject());
        }
      });

    // The owner removed me from a board: drop it locally and switch away. Other
    // members' removals are handled by the collaborators modal, not here.
    this.collab.memberRemoved$
      .pipe(takeUntilDestroyed())
      .subscribe(({ boardId, userId }) => {
        if (this.authService.currentUser?.id === userId) {
          this.handleRemovedFromBoard(boardId);
        }
      });
  }

  /**
   * Removes a board the server revoked access to from local state and, if it was
   * active, opens whatever board remains (or clears the view when none is left).
   * Mirrors {@link deleteProject} but issues no DELETE.
   */
  private handleRemovedFromBoard(id: string): void {
    if (!this.persistence.getProjects().some((p) => p.id === id)) {
      return;
    }
    const wasCurrent = this.persistence.getCurrentProject()?.id === id;

    this.persistence.removeBoardLocally(id);
    this._projects$.next(this.persistence.getProjects());

    if (!wasCurrent) {
      return;
    }
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

  /**
   * Refreshes the board list (so a board the user just gained access to via an
   * accepted invite appears in the switcher) and opens it, re-emitting both the
   * switcher list and the current board so the reactive scheduler rehydrates.
   */
  openBoard(id: string): Observable<void> {
    return this.persistence.refreshBoards().pipe(
      tap((projects) => this._projects$.next(projects)),
      switchMap(() => this.persistence.switchProject(id)),
      tap(() =>
        this._currentProject$.next(this.persistence.getCurrentProject())
      ),
      map(() => undefined)
    );
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

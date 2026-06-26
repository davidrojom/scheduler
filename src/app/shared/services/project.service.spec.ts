import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { BehaviorSubject, Observable, distinctUntilChanged } from 'rxjs';

import { ProjectService } from './project.service';
import { AuthService } from './auth.service';
import { LocalBoardPersistence } from '../persistence/local-board-persistence.service';
import { Project } from '../models/project.model';
import { User } from '../models/user.model';
import { environment } from '../../../environments/environment';

const ISO = '2024-01-01T00:00:00.000Z';
const TEST_USER: User = {
  id: 'u1',
  email: 'alice@example.com',
  name: 'Alice',
  avatarUrl: null,
};

class FakeAuthService {
  private readonly _authState$ = new BehaviorSubject<boolean>(false);
  readonly authState$: Observable<boolean> = this._authState$.pipe(
    distinctUntilChanged()
  );
  private readonly _currentUser$ = new BehaviorSubject<User | null>(null);
  readonly currentUser$: Observable<User | null> =
    this._currentUser$.asObservable();
  private _authenticated = false;

  get isAuthenticated(): boolean {
    return this._authenticated;
  }

  get currentUser(): User | null {
    return this._currentUser$.value;
  }

  setAuthenticated(value: boolean, user: User = TEST_USER): void {
    this._authenticated = value;
    // Set the user before flipping auth state so the migration step can read
    // the user id as soon as the persistence reload reacts to authState$.
    this._currentUser$.next(value ? user : null);
    this._authState$.next(value);
  }
}

function detailDto(id: string, name: string) {
  return {
    board: {
      id,
      name,
      ownerId: 'u1',
      config: {},
      createdAt: ISO,
      updatedAt: ISO,
    },
    myRole: 'owner',
    members: [],
    columns: [],
    tasks: [],
    participants: [],
  };
}

describe('ProjectService (DB boards)', () => {
  let auth: FakeAuthService;
  let httpMock: HttpTestingController;
  const boardsUrl = `${environment.apiBaseUrl}/boards`;

  beforeEach(() => {
    localStorage.clear();
    auth = new FakeAuthService();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: AuthService, useValue: auth }],
    });
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function createService(): ProjectService {
    const service = TestBed.inject(ProjectService);
    httpMock = TestBed.inject(HttpTestingController);
    return service;
  }

  it('loads localStorage boards with no backend calls while anonymous', () => {
    const service = createService();

    let projects: Project[] = [];
    service.projects$.subscribe((p) => (projects = p));

    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe('Default Project');
    httpMock.expectNone(() => true);
  });

  it('populates the switcher from GET /api/boards after authentication', () => {
    const service = createService();

    localStorage.setItem(`scheduler_migrated_${TEST_USER.id}`, 'true');
    auth.setAuthenticated(true);

    const listReq = httpMock.expectOne(boardsUrl);
    expect(listReq.request.method).toBe('GET');
    listReq.flush([
      { id: 'b1', name: 'DB Board', myRole: 'owner', config: {}, updatedAt: ISO },
    ]);

    const detailReq = httpMock.expectOne(`${boardsUrl}/b1`);
    expect(detailReq.request.method).toBe('GET');
    detailReq.flush(detailDto('b1', 'DB Board'));

    let projects: Project[] = [];
    service.projects$.subscribe((p) => (projects = p));
    expect(projects.map((p) => p.name)).toEqual(['DB Board']);
    expect(projects[0].myRole).toBe('owner');

    let current: Project | null = null;
    service.currentProject$.subscribe((p) => (current = p));
    expect(current!.id).toBe('b1');
  });

  it('reverts to localStorage boards (no DB) on logout', () => {
    const service = createService();

    localStorage.setItem(`scheduler_migrated_${TEST_USER.id}`, 'true');
    auth.setAuthenticated(true);
    httpMock
      .expectOne(boardsUrl)
      .flush([{ id: 'b1', name: 'DB Board', myRole: 'owner', config: {}, updatedAt: ISO }]);
    httpMock.expectOne(`${boardsUrl}/b1`).flush(detailDto('b1', 'DB Board'));

    auth.setAuthenticated(false);

    let projects: Project[] = [];
    service.projects$.subscribe((p) => (projects = p));
    expect(projects.some((p) => p.name === 'DB Board')).toBeFalse();
    expect(projects.length).toBe(1);
  });

  it('allows deleting the last board when authenticated (issues DELETE)', () => {
    const service = createService();

    localStorage.setItem(`scheduler_migrated_${TEST_USER.id}`, 'true');
    auth.setAuthenticated(true);
    httpMock
      .expectOne(boardsUrl)
      .flush([{ id: 'b1', name: 'Only', myRole: 'owner', config: {}, updatedAt: ISO }]);
    httpMock.expectOne(`${boardsUrl}/b1`).flush(detailDto('b1', 'Only'));

    service.deleteProject('b1');

    const delReq = httpMock.expectOne(`${boardsUrl}/b1`);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ success: true });

    let projects: Project[] = [];
    service.projects$.subscribe((p) => (projects = p));
    expect(projects.length).toBe(0);
  });

  it('blocks deleting the last localStorage board when anonymous', () => {
    const service = createService();
    spyOn(window, 'alert');

    const only = service.projects[0];
    service.deleteProject(only.id);

    expect(window.alert).toHaveBeenCalled();
    expect(service.projects.length).toBe(1);
    httpMock.expectNone(() => true);
  });

  it('openBoard refreshes the list and opens a newly accessible board', () => {
    const service = createService();

    localStorage.setItem(`scheduler_migrated_${TEST_USER.id}`, 'true');
    auth.setAuthenticated(true);
    httpMock
      .expectOne(boardsUrl)
      .flush([
        { id: 'b1', name: 'Mine', myRole: 'owner', config: {}, updatedAt: ISO },
      ]);
    httpMock.expectOne(`${boardsUrl}/b1`).flush(detailDto('b1', 'Mine'));

    let projects: Project[] = [];
    let current: Project | null = null;
    service.projects$.subscribe((p) => (projects = p));
    service.currentProject$.subscribe((p) => (current = p));

    let done = false;
    service.openBoard('shared-1').subscribe(() => (done = true));

    // openBoard re-lists boards (the accepted board now appears) ...
    const listReq = httpMock.expectOne(boardsUrl);
    expect(listReq.request.method).toBe('GET');
    listReq.flush([
      { id: 'b1', name: 'Mine', myRole: 'owner', config: {}, updatedAt: ISO },
      {
        id: 'shared-1',
        name: 'Shared Board',
        myRole: 'viewer',
        config: {},
        updatedAt: ISO,
      },
    ]);

    // ... then opens it via GET /api/boards/:id.
    const detailReq = httpMock.expectOne(`${boardsUrl}/shared-1`);
    expect(detailReq.request.method).toBe('GET');
    detailReq.flush({
      ...detailDto('shared-1', 'Shared Board'),
      myRole: 'viewer',
    });

    expect(done).toBeTrue();
    expect(projects.map((p) => p.id)).toContain('shared-1');
    expect(current!.id).toBe('shared-1');
    expect(current!.myRole).toBe('viewer');
  });

  it('imports local boards on first login, then loads DB boards (no duplicates on relogin)', () => {
    const service = createService();
    const local = TestBed.inject(LocalBoardPersistence);
    const localBoardId = local.getCurrentProject()!.id;
    local.setColumns([{ id: 'col-x', title: 'CROSS-MIGRATE' }]);

    auth.setAuthenticated(true);

    const importReq = httpMock.expectOne(`${boardsUrl}/import`);
    expect(importReq.request.method).toBe('POST');
    expect(JSON.stringify(importReq.request.body)).toContain(localBoardId);
    expect(JSON.stringify(importReq.request.body)).toContain('CROSS-MIGRATE');
    importReq.flush({ boards: [{ id: localBoardId }] });

    httpMock.expectOne(boardsUrl).flush([
      {
        id: localBoardId,
        name: 'Default Project',
        myRole: 'owner',
        config: {},
        updatedAt: ISO,
      },
    ]);
    httpMock
      .expectOne(`${boardsUrl}/${localBoardId}`)
      .flush(detailDto(localBoardId, 'Default Project'));

    let projects: Project[] = [];
    service.projects$.subscribe((p) => (projects = p));
    expect(projects.map((p) => p.id)).toEqual([localBoardId]);

    // Logout returns to the intact local boards with no backend calls.
    auth.setAuthenticated(false);
    httpMock.expectNone(() => true);
    expect(service.projects.some((p) => p.id === localBoardId)).toBeTrue();

    // Re-authenticating as the same user must NOT import again (idempotent).
    auth.setAuthenticated(true);
    httpMock.expectNone(`${boardsUrl}/import`);
    httpMock.expectOne(boardsUrl).flush([
      {
        id: localBoardId,
        name: 'Default Project',
        myRole: 'owner',
        config: {},
        updatedAt: ISO,
      },
    ]);
    httpMock
      .expectOne(`${boardsUrl}/${localBoardId}`)
      .flush(detailDto(localBoardId, 'Default Project'));
  });
});

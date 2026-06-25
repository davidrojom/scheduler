import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { BehaviorSubject, Observable, distinctUntilChanged } from 'rxjs';

import { ProjectService } from './project.service';
import { AuthService } from './auth.service';
import { Project } from '../models/project.model';
import { environment } from '../../../environments/environment';

const ISO = '2024-01-01T00:00:00.000Z';

class FakeAuthService {
  private readonly _authState$ = new BehaviorSubject<boolean>(false);
  readonly authState$: Observable<boolean> = this._authState$.pipe(
    distinctUntilChanged()
  );
  private _authenticated = false;

  get isAuthenticated(): boolean {
    return this._authenticated;
  }

  setAuthenticated(value: boolean): void {
    this._authenticated = value;
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
});

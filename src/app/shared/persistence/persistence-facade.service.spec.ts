import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { PersistenceFacade } from './persistence-facade.service';
import { LocalBoardPersistence } from './local-board-persistence.service';
import { ApiBoardPersistence } from './api-board-persistence.service';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

class FakeAuthService {
  authenticated = false;

  get isAuthenticated(): boolean {
    return this.authenticated;
  }
}

describe('PersistenceFacade', () => {
  let facade: PersistenceFacade;
  let auth: FakeAuthService;
  let httpMock: HttpTestingController;
  let local: LocalBoardPersistence;
  let api: ApiBoardPersistence;

  beforeEach(() => {
    localStorage.clear();
    auth = new FakeAuthService();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: AuthService, useValue: auth }],
    });

    facade = TestBed.inject(PersistenceFacade);
    local = TestBed.inject(LocalBoardPersistence);
    api = TestBed.inject(ApiBoardPersistence);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('selects LocalBoardPersistence when anonymous', () => {
    auth.authenticated = false;
    expect(facade.active).toBe(local);
  });

  it('selects ApiBoardPersistence when authenticated', () => {
    auth.authenticated = true;
    expect(facade.active).toBe(api);
  });

  it('re-evaluates the strategy on every access as auth state changes', () => {
    auth.authenticated = false;
    expect(facade.active).toBe(local);

    auth.authenticated = true;
    expect(facade.active).toBe(api);

    auth.authenticated = false;
    expect(facade.active).toBe(local);
  });

  it('routes anonymous reads/writes to localStorage with NO backend calls', () => {
    auth.authenticated = false;

    const project = facade.createProject('Anon Board');
    facade.switchProject(project.id).subscribe();
    facade.setColumns([{ id: 'c1', title: 'Stage' }]);

    expect(facade.getConfig().columns).toEqual([{ id: 'c1', title: 'Stage' }]);
    expect(localStorage.getItem('scheduler_projects')).toContain('Anon Board');
    expect(localStorage.getItem(`${project.id}_columns`)).toContain('Stage');

    httpMock.expectNone(() => true);
  });

  it('routes authenticated board creation to POST /api/boards', () => {
    auth.authenticated = true;

    const project = facade.createProject('DB Board');

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/boards`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(
      jasmine.objectContaining({ id: project.id, name: 'DB Board' })
    );
    req.flush({
      id: project.id,
      name: 'DB Board',
      ownerId: 'u1',
      config: {},
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('fetches board content over REST when switching authenticated boards', () => {
    auth.authenticated = true;

    let resolved = false;
    facade.switchProject('board-1').subscribe(() => (resolved = true));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/boards/board-1`);
    expect(req.request.method).toBe('GET');
    req.flush({
      board: {
        id: 'board-1',
        name: 'B',
        ownerId: 'u1',
        config: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      myRole: 'owner',
      members: [],
      columns: [{ id: 'c1', title: 'Stage', position: 0 }],
      tasks: [],
      participants: ['Alice'],
    });

    expect(resolved).toBeTrue();
    expect(facade.getConfig().columns).toEqual([{ id: 'c1', title: 'Stage' }]);
    expect(facade.getConfig().participants).toEqual(['Alice']);
  });
});

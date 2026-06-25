import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { ApiBoardPersistence } from './api-board-persistence.service';
import { environment } from '../../../environments/environment';

const ISO = '2024-01-01T00:00:00.000Z';

function boardDto(id: string, name: string) {
  return {
    id,
    name,
    ownerId: 'u1',
    config: {},
    createdAt: ISO,
    updatedAt: ISO,
  };
}

function detailDto(id: string, name: string) {
  return {
    board: boardDto(id, name),
    myRole: 'owner',
    members: [],
    columns: [],
    tasks: [],
    participants: [],
  };
}

describe('ApiBoardPersistence', () => {
  let service: ApiBoardPersistence;
  let httpMock: HttpTestingController;
  const boardsUrl = `${environment.apiBaseUrl}/boards`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(ApiBoardPersistence);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists DB boards with myRole from GET /api/boards', () => {
    let result: { id: string; role?: string }[] = [];
    service
      .refreshBoards()
      .subscribe((p) => (result = p.map((b) => ({ id: b.id, role: b.myRole }))));

    const req = httpMock.expectOne(boardsUrl);
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 'b1', name: 'Owned', myRole: 'owner', config: {}, updatedAt: ISO },
      { id: 'b2', name: 'Shared', myRole: 'viewer', config: {}, updatedAt: ISO },
    ]);

    expect(result).toEqual([
      { id: 'b1', role: 'owner' },
      { id: 'b2', role: 'viewer' },
    ]);
    expect(service.getCurrentProject()?.id).toBe('b1');
  });

  it('waits for the create POST before fetching board detail on switch', () => {
    const project = service.createProject('New Board');

    const postReq = httpMock.expectOne(boardsUrl);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual(
      jasmine.objectContaining({ id: project.id, name: 'New Board' })
    );

    let resolved = false;
    service.switchProject(project.id).subscribe(() => (resolved = true));

    // The GET must not be issued until the create POST completes.
    httpMock.expectNone(`${boardsUrl}/${project.id}`);

    postReq.flush(boardDto(project.id, 'New Board'));

    const getReq = httpMock.expectOne(`${boardsUrl}/${project.id}`);
    expect(getReq.request.method).toBe('GET');
    getReq.flush(detailDto(project.id, 'New Board'));

    expect(resolved).toBeTrue();
    expect(service.getCurrentProject()?.id).toBe(project.id);
  });

  it('PATCHes name/config on update and resolves after the response', () => {
    service.refreshBoards().subscribe();
    httpMock
      .expectOne(boardsUrl)
      .flush([{ id: 'b1', name: 'Old', myRole: 'owner', config: {}, updatedAt: ISO }]);

    let done = false;
    service.updateProject('b1', { name: 'Renamed' }).subscribe(() => (done = true));

    // Optimistic in-memory update is applied synchronously.
    expect(service.getProjects().find((p) => p.id === 'b1')?.name).toBe(
      'Renamed'
    );

    const req = httpMock.expectOne(`${boardsUrl}/b1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Renamed' });
    req.flush(boardDto('b1', 'Renamed'));

    expect(done).toBeTrue();
  });

  it('falls back to empty content when board detail is unavailable', () => {
    const project = service.createProject('Pending');
    const postReq = httpMock.expectOne(boardsUrl);

    let resolved = false;
    service.switchProject(project.id).subscribe(() => (resolved = true));

    postReq.flush(boardDto(project.id, 'Pending'));
    httpMock
      .expectOne(`${boardsUrl}/${project.id}`)
      .flush('not found', { status: 404, statusText: 'Not Found' });

    expect(resolved).toBeTrue();
    expect(service.getCurrentProject()?.id).toBe(project.id);
    expect(service.getConfig().columns).toEqual([]);
  });
});

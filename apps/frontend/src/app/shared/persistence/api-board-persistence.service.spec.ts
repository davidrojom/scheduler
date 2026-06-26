import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { EMPTY, Observable } from 'rxjs';

import { ApiBoardPersistence } from './api-board-persistence.service';
import { environment } from '../../../environments/environment';
import { Task } from '../../pages/scheduler/components/modals/task/task-modal.component';
import { CollaborationService } from '../collaboration/collaboration.service';

interface CollabStub {
  remoteEvents$: Observable<unknown>;
  resync$: Observable<unknown>;
  isLive: jasmine.Spy;
  emitOp: jasmine.Spy;
  setActiveBoard: jasmine.Spy;
}

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

function detailDto(id: string, name: string, content: Partial<{
  columns: { id: string; title: string; position: number }[];
  tasks: {
    id: string;
    columnId: string;
    title: string;
    startHour: string;
    endHour: string;
    participants: string[];
    position: number;
  }[];
  participants: string[];
}> = {}) {
  return {
    board: boardDto(id, name),
    myRole: 'owner',
    members: [],
    columns: content.columns ?? [],
    tasks: content.tasks ?? [],
    participants: content.participants ?? [],
  };
}

function task(
  id: string,
  columnId: string,
  title: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  participants: string[] = []
): Task {
  const start = new Date();
  const end = new Date();
  start.setHours(startHour, startMinute);
  end.setHours(endHour, endMinute);
  return { id, columnId, title, start, end, participants };
}

describe('ApiBoardPersistence', () => {
  let service: ApiBoardPersistence;
  let httpMock: HttpTestingController;
  let collab: CollabStub;
  const boardsUrl = `${environment.apiBaseUrl}/boards`;

  beforeEach(() => {
    collab = {
      remoteEvents$: EMPTY,
      resync$: EMPTY,
      isLive: jasmine.createSpy('isLive').and.returnValue(false),
      emitOp: jasmine.createSpy('emitOp').and.returnValue(false),
      setActiveBoard: jasmine.createSpy('setActiveBoard'),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: CollaborationService, useValue: collab }],
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

  it('clears cached content after deleting the last board', fakeAsync(() => {
    service.refreshBoards().subscribe();
    httpMock
      .expectOne(boardsUrl)
      .flush([
        { id: 'b1', name: 'Board', myRole: 'owner', config: {}, updatedAt: ISO },
      ]);
    service.switchProject('b1').subscribe();
    httpMock.expectOne(`${boardsUrl}/b1`).flush(
      detailDto('b1', 'Board', {
        columns: [{ id: 'c1', title: 'Stage', position: 0 }],
        tasks: [
          {
            id: 't1',
            columnId: 'c1',
            title: 'Show',
            startHour: '9:0',
            endHour: '10:0',
            participants: ['Ana'],
            position: 0,
          },
        ],
        participants: ['Ana'],
      })
    );
    flushMicrotasks();

    expect(service.getConfig().columns.length).toBe(1);

    service.deleteProject('b1');

    const del = httpMock.expectOne(`${boardsUrl}/b1`);
    expect(del.request.method).toBe('DELETE');
    del.flush({ success: true });

    expect(service.getCurrentProject()).toBeNull();
    expect(service.getConfig().columns).toEqual([]);
    expect(service.getConfig().tasks).toEqual([]);
    expect(service.getConfig().participants).toEqual([]);
    expect(service.getConfig().logo).toBeNull();
  }));

  it('switches to a remaining board when a non-last board is deleted', () => {
    service.refreshBoards().subscribe();
    httpMock.expectOne(boardsUrl).flush([
      { id: 'b1', name: 'B1', myRole: 'owner', config: {}, updatedAt: ISO },
      { id: 'b2', name: 'B2', myRole: 'owner', config: {}, updatedAt: ISO },
    ]);
    expect(service.getCurrentProject()?.id).toBe('b1');

    service.deleteProject('b1');

    const del = httpMock.expectOne(`${boardsUrl}/b1`);
    expect(del.request.method).toBe('DELETE');
    del.flush({ success: true });

    expect(service.getProjects().map((p) => p.id)).toEqual(['b2']);
    expect(service.getCurrentProject()?.id).toBe('b2');
  });

  describe('content sync', () => {
    function loadBoard(detail: ReturnType<typeof detailDto>) {
      service.refreshBoards().subscribe();
      httpMock
        .expectOne(boardsUrl)
        .flush([
          { id: 'b1', name: 'Board', myRole: 'owner', config: {}, updatedAt: ISO },
        ]);
      service.switchProject('b1').subscribe();
      httpMock.expectOne(`${boardsUrl}/b1`).flush(detail);
      // Drain the post-load snapshot guard so subsequent writes are user edits.
      flushMicrotasks();
    }

    it('does not write content while applying the loaded snapshot', fakeAsync(() => {
      service.refreshBoards().subscribe();
      httpMock
        .expectOne(boardsUrl)
        .flush([
          { id: 'b1', name: 'Board', myRole: 'owner', config: {}, updatedAt: ISO },
        ]);
      service.switchProject('b1').subscribe();
      httpMock.expectOne(`${boardsUrl}/b1`).flush(
        detailDto('b1', 'Board', {
          columns: [{ id: 'c1', title: 'Stage', position: 0 }],
        })
      );

      // The scheduler form rebuild echoes columns back synchronously before the
      // guard releases; those echoes must NOT hit the content endpoints.
      service.setColumns([]);
      service.setColumns([{ id: 'c1', title: 'Stage' }]);
      expect(httpMock.match(() => true).length).toBe(0);

      flushMicrotasks();
    }));

    it('POSTs a new column', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          columns: [{ id: 'c1', title: 'Stage', position: 0 }],
        })
      );

      service.setColumns([
        { id: 'c1', title: 'Stage' },
        { id: 'c2', title: 'Room' },
      ]);

      const req = httpMock.expectOne(`${boardsUrl}/b1/columns`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ id: 'c2', title: 'Room' });
      req.flush({ id: 'c2', title: 'Room', position: 1 });
    }));

    it('PATCHes a renamed column', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          columns: [{ id: 'c1', title: 'Stage', position: 0 }],
        })
      );

      service.setColumns([{ id: 'c1', title: 'Main Stage' }]);

      const req = httpMock.expectOne(`${boardsUrl}/b1/columns/c1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ title: 'Main Stage' });
      req.flush({ id: 'c1', title: 'Main Stage', position: 0 });
    }));

    it('DELETEs a removed column', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          columns: [
            { id: 'c1', title: 'Stage', position: 0 },
            { id: 'c2', title: 'Room', position: 1 },
          ],
        })
      );

      service.setColumns([{ id: 'c1', title: 'Stage' }]);

      const req = httpMock.expectOne(`${boardsUrl}/b1/columns/c2`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    }));

    it('PATCHes columns/reorder when only the order changes', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          columns: [
            { id: 'c1', title: 'A', position: 0 },
            { id: 'c2', title: 'B', position: 1 },
            { id: 'c3', title: 'C', position: 2 },
          ],
        })
      );

      service.setColumns([
        { id: 'c3', title: 'C' },
        { id: 'c1', title: 'A' },
        { id: 'c2', title: 'B' },
      ]);

      const req = httpMock.expectOne(`${boardsUrl}/b1/columns/reorder`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ orderedIds: ['c3', 'c1', 'c2'] });
      req.flush([]);
    }));

    it('POSTs a new task with non-zero-padded "H:M" times', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          columns: [{ id: 'c1', title: 'Stage', position: 0 }],
        })
      );

      service.setTasks([task('t1', 'c1', 'Soundcheck', 9, 5, 10, 30, ['Ana'])]);

      const req = httpMock.expectOne(`${boardsUrl}/b1/tasks`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        id: 't1',
        columnId: 'c1',
        title: 'Soundcheck',
        startHour: '9:5',
        endHour: '10:30',
        participants: ['Ana'],
      });
      req.flush({
        id: 't1',
        columnId: 'c1',
        title: 'Soundcheck',
        startHour: '9:5',
        endHour: '10:30',
        participants: ['Ana'],
        position: 0,
      });
    }));

    it('PATCHes an edited task and DELETEs a removed task', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          columns: [{ id: 'c1', title: 'Stage', position: 0 }],
          tasks: [
            {
              id: 't1',
              columnId: 'c1',
              title: 'Soundcheck',
              startHour: '9:0',
              endHour: '10:0',
              participants: [],
              position: 0,
            },
            {
              id: 't2',
              columnId: 'c1',
              title: 'Show',
              startHour: '11:0',
              endHour: '12:0',
              participants: [],
              position: 1,
            },
          ],
        })
      );

      // Edit t1 (title + time), drop t2.
      service.setTasks([task('t1', 'c1', 'Rehearsal', 9, 15, 10, 45, ['Ana'])]);

      const patch = httpMock.expectOne(`${boardsUrl}/b1/tasks/t1`);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({
        columnId: 'c1',
        title: 'Rehearsal',
        startHour: '9:15',
        endHour: '10:45',
        participants: ['Ana'],
      });
      patch.flush({
        id: 't1',
        columnId: 'c1',
        title: 'Rehearsal',
        startHour: '9:15',
        endHour: '10:45',
        participants: ['Ana'],
        position: 0,
      });

      const del = httpMock.expectOne(`${boardsUrl}/b1/tasks/t2`);
      expect(del.request.method).toBe('DELETE');
      del.flush({ success: true });
    }));

    it('POSTs and DELETEs participants', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          participants: ['Ana', 'Beto'],
        })
      );

      service.setParticipants(['Ana', 'Carla']);

      const matches = httpMock.match(`${boardsUrl}/b1/participants`);
      expect(matches.length).toBe(2);

      const post = matches.find((r) => r.request.method === 'POST')!;
      expect(post.request.body).toEqual({ name: 'Carla' });
      post.flush({ name: 'Carla' });

      const del = matches.find((r) => r.request.method === 'DELETE')!;
      expect(del.request.body).toEqual({ name: 'Beto' });
      del.flush({ success: true });
    }));
  });

  describe('board:update realtime dispatch', () => {
    function loadBoard(detail: ReturnType<typeof detailDto>) {
      service.refreshBoards().subscribe();
      httpMock
        .expectOne(boardsUrl)
        .flush([
          { id: 'b1', name: 'Board', myRole: 'owner', config: {}, updatedAt: ISO },
        ]);
      service.switchProject('b1').subscribe();
      httpMock.expectOne(`${boardsUrl}/b1`).flush(detail);
      flushMicrotasks();
    }

    it('emits board:update over the socket when live (no REST PATCH)', () => {
      service.refreshBoards().subscribe();
      httpMock
        .expectOne(boardsUrl)
        .flush([
          { id: 'b1', name: 'Old', myRole: 'owner', config: {}, updatedAt: ISO },
        ]);

      collab.isLive.and.returnValue(true);
      collab.emitOp.and.returnValue(true);

      let done = false;
      service
        .updateProject('b1', { name: 'Renamed' })
        .subscribe(() => (done = true));

      expect(collab.emitOp).toHaveBeenCalledWith('board:update', {
        boardId: 'b1',
        changes: { name: 'Renamed' },
      });
      // While live the op travels over the socket — never as a REST PATCH.
      httpMock.expectNone(`${boardsUrl}/b1`);
      expect(done).toBeTrue();
      expect(service.getProjects().find((p) => p.id === 'b1')?.name).toBe(
        'Renamed'
      );
    });

    it('falls back to the REST PATCH when realtime is unavailable', () => {
      service.refreshBoards().subscribe();
      httpMock
        .expectOne(boardsUrl)
        .flush([
          { id: 'b1', name: 'Board', myRole: 'owner', config: {}, updatedAt: ISO },
        ]);

      const config = { dayStartHour: 8, dayEndHour: 20, segmentsByHour: 4 };
      let done = false;
      service.updateProject('b1', { config }).subscribe(() => (done = true));

      expect(collab.emitOp).not.toHaveBeenCalled();
      const req = httpMock.expectOne(`${boardsUrl}/b1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ config });
      req.flush(boardDto('b1', 'Board'));
      expect(done).toBeTrue();
    });

    it('emits board:update carrying the logo over the socket when live', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          columns: [{ id: 'c1', title: 'Stage', position: 0 }],
        })
      );

      collab.isLive.and.returnValue(true);
      collab.emitOp.and.returnValue(true);

      service.setConfig({
        columns: [{ id: 'c1', title: 'Stage' }],
        tasks: [],
        participants: [],
        logo: '<svg>logo</svg>',
      });

      expect(collab.emitOp).toHaveBeenCalledWith(
        'board:update',
        jasmine.objectContaining({
          boardId: 'b1',
          changes: jasmine.objectContaining({
            config: jasmine.objectContaining({ logo: '<svg>logo</svg>' }),
          }),
        })
      );
      // No REST PATCH to the board root while live.
      httpMock.expectNone(`${boardsUrl}/b1`);
    }));

    it('falls back to the REST PATCH for a logo change when not live', fakeAsync(() => {
      loadBoard(
        detailDto('b1', 'Board', {
          columns: [{ id: 'c1', title: 'Stage', position: 0 }],
        })
      );

      service.setConfig({
        columns: [{ id: 'c1', title: 'Stage' }],
        tasks: [],
        participants: [],
        logo: '<svg>logo</svg>',
      });

      expect(collab.emitOp).not.toHaveBeenCalled();
      const req = httpMock.expectOne(`${boardsUrl}/b1`);
      expect(req.request.method).toBe('PATCH');
      expect(
        (req.request.body as { config: { logo?: string } }).config.logo
      ).toBe('<svg>logo</svg>');
      req.flush(boardDto('b1', 'Board'));
    }));
  });
});

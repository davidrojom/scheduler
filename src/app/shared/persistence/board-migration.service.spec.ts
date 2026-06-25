import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { BoardMigrationService } from './board-migration.service';
import { LocalBoardPersistence } from './local-board-persistence.service';
import { environment } from '../../../environments/environment';

const IMPORT_URL = `${environment.apiBaseUrl}/boards/import`;
const USER_ID = 'user-123';
const FLAG_KEY = `scheduler_migrated_${USER_ID}`;

describe('BoardMigrationService', () => {
  let service: BoardMigrationService;
  let local: LocalBoardPersistence;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(BoardMigrationService);
    local = TestBed.inject(LocalBoardPersistence);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function seedLocalBoard(): { boardId: string; columnId: string } {
    const board = local.getCurrentProject()!;
    local.setColumns([{ id: 'col-1', title: 'CROSS-MIGRATE' }]);
    const start = new Date();
    start.setHours(9, 5, 0, 0);
    const end = new Date();
    end.setHours(10, 0, 0, 0);
    local.setTasks([
      {
        id: 'task-1',
        columnId: 'col-1',
        title: 'Talk',
        start,
        end,
        participants: ['Alice'],
      },
    ]);
    local.setParticipants(['Alice']);
    return { boardId: board.id, columnId: 'col-1' };
  }

  it('imports local boards + content and marks the user migrated on success', () => {
    const { boardId } = seedLocalBoard();

    let completed = false;
    service.migrateLocalBoards(USER_ID).subscribe(() => (completed = true));

    const req = httpMock.expectOne(IMPORT_URL);
    expect(req.request.method).toBe('POST');

    const body = req.request.body as {
      boards: {
        board: { id: string; name: string };
        columns: { id: string; title: string }[];
        tasks: { id: string; startHour: string; endHour: string }[];
        participants: string[];
      }[];
    };
    const entry = body.boards.find((b) => b.board.id === boardId)!;
    expect(entry).toBeTruthy();
    expect(entry.columns).toEqual([{ id: 'col-1', title: 'CROSS-MIGRATE' }]);
    // Times keep the non-zero-padded "H:M" format for backend round-trip.
    expect(entry.tasks[0].startHour).toBe('9:5');
    expect(entry.tasks[0].endHour).toBe('10:0');
    expect(entry.participants).toEqual(['Alice']);

    req.flush({ boards: [{ id: boardId }] });

    expect(completed).toBeTrue();
    expect(service.hasMigrated(USER_ID)).toBeTrue();
    expect(localStorage.getItem(FLAG_KEY)).toBe('true');
  });

  it('does not delete the local board after migrating', () => {
    const { boardId } = seedLocalBoard();

    service.migrateLocalBoards(USER_ID).subscribe();
    httpMock.expectOne(IMPORT_URL).flush({ boards: [{ id: boardId }] });

    expect(localStorage.getItem('scheduler_projects')).toContain(boardId);
    expect(localStorage.getItem(`${boardId}_columns`)).toContain(
      'CROSS-MIGRATE'
    );
  });

  it('skips the import when the user has already migrated (idempotent)', () => {
    seedLocalBoard();
    localStorage.setItem(FLAG_KEY, 'true');

    let completed = false;
    service.migrateLocalBoards(USER_ID).subscribe(() => (completed = true));

    expect(completed).toBeTrue();
    httpMock.expectNone(IMPORT_URL);
  });

  it('marks migrated without an import when there are no local boards', () => {
    let completed = false;
    service.migrateLocalBoards(USER_ID).subscribe(() => (completed = true));

    expect(completed).toBeTrue();
    expect(service.hasMigrated(USER_ID)).toBeTrue();
    httpMock.expectNone(IMPORT_URL);
  });

  it('does NOT mark migrated when the import fails (so a later login retries)', () => {
    const { boardId } = seedLocalBoard();

    let completed = false;
    service.migrateLocalBoards(USER_ID).subscribe(() => (completed = true));

    httpMock
      .expectOne(IMPORT_URL)
      .flush(
        { message: 'boom' },
        { status: 500, statusText: 'Server Error' }
      );

    expect(completed).toBeTrue();
    expect(service.hasMigrated(USER_ID)).toBeFalse();
    expect(localStorage.getItem('scheduler_projects')).toContain(boardId);
  });

  it('migrates per user — a different user still triggers an import', () => {
    seedLocalBoard();
    localStorage.setItem(FLAG_KEY, 'true');

    service.migrateLocalBoards('other-user').subscribe();

    const req = httpMock.expectOne(IMPORT_URL);
    expect(req.request.method).toBe('POST');
    req.flush({ boards: [] });
    expect(service.hasMigrated('other-user')).toBeTrue();
  });
});

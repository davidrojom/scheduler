import { randomUUID } from 'crypto';
import { Database } from '../database/database.module';
import {
  createTestDatabase,
  migrateTestDatabase,
  truncateAll,
} from '../database/testing/test-database';
import { UsersService } from '../users/users.service';
import { BoardsService } from './boards.service';

describe('BoardsService (against scheduler_test)', () => {
  let db: Database;
  let boards: BoardsService;
  let users: UsersService;
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    db = createTestDatabase();
    await migrateTestDatabase(db);
  }, 30000);

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await truncateAll(db);
    boards = new BoardsService(db);
    users = new UsersService(db);
    aliceId = (
      await users.upsertByEmail({ email: 'alice@example.com', name: 'Alice' })
    ).id;
    bobId = (
      await users.upsertByEmail({ email: 'bob@example.com', name: 'Bob' })
    ).id;
  });

  describe('create', () => {
    it('creates the board and an owner membership atomically, preserving the client id', async () => {
      const id = randomUUID();
      const created = await boards.create(aliceId, {
        id,
        name: 'My Board',
        config: { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 },
      });

      expect(created.id).toBe(id);
      expect(created.ownerId).toBe(aliceId);
      expect(created.myRole).toBe('owner');
      expect(created.config).toEqual({
        dayStartHour: 6,
        dayEndHour: 21,
        segmentsByHour: 6,
      });

      const member = await db
        .selectFrom('board_members')
        .selectAll()
        .where('board_id', '=', id)
        .where('user_id', '=', aliceId)
        .executeTakeFirst();
      expect(member?.role).toBe('owner');
    });

    it('generates a server id when none is provided', async () => {
      const created = await boards.create(aliceId, { name: 'No Id Board' });
      expect(created.id).toBeTruthy();
      expect(created.config).toEqual({});
    });
  });

  describe('listForUser', () => {
    it('returns only the requesting user boards, each with myRole', async () => {
      const aliceBoard = await boards.create(aliceId, { name: 'Alice Board' });
      const bobBoard = await boards.create(bobId, { name: 'Bob Board' });

      const aliceList = await boards.listForUser(aliceId);
      const aliceIds = aliceList.map((b) => b.id);
      expect(aliceIds).toContain(aliceBoard.id);
      expect(aliceIds).not.toContain(bobBoard.id);
      expect(aliceList[0].myRole).toBe('owner');

      const bobList = await boards.listForUser(bobId);
      expect(bobList.map((b) => b.id)).toEqual([bobBoard.id]);
    });
  });

  describe('getMemberRole', () => {
    it('resolves the caller role and returns null for non-members or bad ids', async () => {
      const board = await boards.create(aliceId, { name: 'Roles' });
      expect(await boards.getMemberRole(board.id, aliceId)).toBe('owner');
      expect(await boards.getMemberRole(board.id, bobId)).toBeNull();
      expect(await boards.getMemberRole('not-a-uuid', aliceId)).toBeNull();
    });
  });

  describe('getDetail', () => {
    it('returns the full camelCase payload with members', async () => {
      const board = await boards.create(aliceId, {
        name: 'Detail',
        config: { dayStartHour: 7, dayEndHour: 20, segmentsByHour: 4 },
      });

      const detail = await boards.getDetail(board.id, 'owner');
      expect(detail.board.id).toBe(board.id);
      expect(detail.board.ownerId).toBe(aliceId);
      expect(detail.board.config).toEqual({
        dayStartHour: 7,
        dayEndHour: 20,
        segmentsByHour: 4,
      });
      expect(detail.myRole).toBe('owner');
      expect(detail.members).toHaveLength(1);
      expect(detail.members[0]).toMatchObject({
        userId: aliceId,
        email: 'alice@example.com',
        role: 'owner',
      });
      expect(detail.columns).toEqual([]);
      expect(detail.tasks).toEqual([]);
      expect(detail.participants).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates name and config durably', async () => {
      const board = await boards.create(aliceId, {
        name: 'Before',
        config: { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 },
      });

      await boards.update(board.id, {
        name: 'After',
        config: { dayStartHour: 8, dayEndHour: 18, segmentsByHour: 2 },
      });

      const detail = await boards.getDetail(board.id, 'owner');
      expect(detail.board.name).toBe('After');
      expect(detail.board.config).toEqual({
        dayStartHour: 8,
        dayEndHour: 18,
        segmentsByHour: 2,
      });
    });
  });

  describe('remove', () => {
    it('deletes the board and cascades its content', async () => {
      const boardId = randomUUID();
      const columnId = randomUUID();
      const taskId = randomUUID();
      await boards.importForUser(aliceId, {
        boards: [
          {
            board: { id: boardId, name: 'Cascade', config: {} },
            columns: [{ id: columnId, title: 'Room', position: 0 }],
            tasks: [
              {
                id: taskId,
                columnId,
                title: 'Slot',
                startHour: '9:5',
                endHour: '10:0',
                participants: ['Ann'],
                position: 0,
              },
            ],
            participants: ['Ann'],
          },
        ],
      });

      await boards.remove(boardId);

      expect(
        await db
          .selectFrom('boards')
          .selectAll()
          .where('id', '=', boardId)
          .executeTakeFirst(),
      ).toBeUndefined();
      const tasks = await db
        .selectFrom('tasks')
        .selectAll()
        .where('board_id', '=', boardId)
        .execute();
      expect(tasks).toHaveLength(0);
      const cols = await db
        .selectFrom('columns')
        .selectAll()
        .where('board_id', '=', boardId)
        .execute();
      expect(cols).toHaveLength(0);
    });
  });

  describe('importForUser', () => {
    it('imports boards with content preserving client uuids', async () => {
      const boardId = randomUUID();
      const columnId = randomUUID();
      const taskId = randomUUID();

      const created = await boards.importForUser(aliceId, {
        boards: [
          {
            board: {
              id: boardId,
              name: 'Imported',
              config: { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 },
            },
            columns: [{ id: columnId, title: 'Stage', position: 0 }],
            tasks: [
              {
                id: taskId,
                columnId,
                title: 'Talk',
                startHour: '9:5',
                endHour: '9:35',
                participants: ['Ann', 'Bob'],
                position: 0,
              },
            ],
            participants: ['Ann', 'Bob'],
          },
        ],
      });

      expect(created).toHaveLength(1);
      expect(created[0].id).toBe(boardId);

      const detail = await boards.getDetail(boardId, 'owner');
      expect(detail.columns).toEqual([
        { id: columnId, title: 'Stage', position: 0 },
      ]);
      expect(detail.tasks[0]).toMatchObject({
        id: taskId,
        columnId,
        startHour: '9:5',
        endHour: '9:35',
        participants: ['Ann', 'Bob'],
      });
      expect(detail.participants.sort()).toEqual(['Ann', 'Bob']);
    });

    it('is idempotent: re-importing the same ids creates nothing new', async () => {
      const boardId = randomUUID();
      const payload = {
        boards: [{ board: { id: boardId, name: 'Once', config: {} } }],
      };

      const first = await boards.importForUser(aliceId, payload);
      expect(first).toHaveLength(1);

      const second = await boards.importForUser(aliceId, payload);
      expect(second).toHaveLength(0);

      const rows = await db
        .selectFrom('boards')
        .selectAll()
        .where('id', '=', boardId)
        .execute();
      expect(rows).toHaveLength(1);
    });
  });
});

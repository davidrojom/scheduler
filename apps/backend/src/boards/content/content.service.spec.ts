import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { Database } from '../../database/database.module';
import {
  createTestDatabase,
  migrateTestDatabase,
  truncateAll,
} from '../../database/testing/test-database';
import { UsersService } from '../../users/users.service';
import { BoardsService } from '../boards.service';
import { ColumnsService } from './columns.service';
import { ParticipantsService } from './participants.service';
import { TasksService } from './tasks.service';

describe('Board content services (against scheduler_test)', () => {
  let db: Database;
  let boards: BoardsService;
  let users: UsersService;
  let columns: ColumnsService;
  let tasks: TasksService;
  let participants: ParticipantsService;
  let aliceId: string;
  let boardId: string;

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
    columns = new ColumnsService(db);
    tasks = new TasksService(db);
    participants = new ParticipantsService(db);
    aliceId = (
      await users.upsertByEmail({ email: 'alice@example.com', name: 'Alice' })
    ).id;
    boardId = (await boards.create(aliceId, { name: 'Content Board' })).id;
  });

  describe('ColumnsService', () => {
    it('creates a column preserving the client uuid and assigns an appended position', async () => {
      const id = randomUUID();
      const first = await columns.create(boardId, { id, title: 'Stage' });
      expect(first).toEqual({ id, title: 'Stage', position: 0 });

      const second = await columns.create(boardId, { title: 'Side' });
      expect(second.position).toBe(1);
    });

    it('updates a column title and rejects unknown ids', async () => {
      const col = await columns.create(boardId, { title: 'Old' });
      const updated = await columns.update(boardId, col.id, { title: 'New' });
      expect(updated).toEqual({ id: col.id, title: 'New', position: 0 });

      await expect(
        columns.update(boardId, randomUUID(), { title: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reorders columns and persists their new positions', async () => {
      const a = await columns.create(boardId, { title: 'A' });
      const b = await columns.create(boardId, { title: 'B' });
      const c = await columns.create(boardId, { title: 'C' });

      const reordered = await columns.reorder(boardId, [c.id, a.id, b.id]);
      expect(reordered.map((col) => col.id)).toEqual([c.id, a.id, b.id]);
      expect(reordered.map((col) => col.position)).toEqual([0, 1, 2]);
    });

    it('deletes a column and cascades to its tasks (no orphans)', async () => {
      const col = await columns.create(boardId, { title: 'Doomed' });
      const keep = await columns.create(boardId, { title: 'Keep' });
      const task = await tasks.create(boardId, {
        columnId: col.id,
        title: 'Inside',
        startHour: '9:5',
        endHour: '10:0',
      });
      const survivor = await tasks.create(boardId, {
        columnId: keep.id,
        title: 'Survivor',
        startHour: '11:0',
        endHour: '12:0',
      });

      await columns.remove(boardId, col.id);

      const remainingColumns = await columns.list(boardId);
      expect(remainingColumns.map((x) => x.id)).toEqual([keep.id]);

      const remainingTasks = await db
        .selectFrom('tasks')
        .selectAll()
        .where('board_id', '=', boardId)
        .execute();
      expect(remainingTasks.map((t) => t.id)).toEqual([survivor.id]);
      expect(remainingTasks.find((t) => t.id === task.id)).toBeUndefined();
    });
  });

  describe('TasksService', () => {
    it('round-trips startHour/endHour as non-zero-padded strings and participants as text[]', async () => {
      const col = await columns.create(boardId, { title: 'Room' });
      const id = randomUUID();
      const created = await tasks.create(boardId, {
        id,
        columnId: col.id,
        title: 'Talk',
        startHour: '9:5',
        endHour: '13:0',
        participants: ['Ann', 'Bob'],
      });
      expect(created).toEqual({
        id,
        columnId: col.id,
        title: 'Talk',
        startHour: '9:5',
        endHour: '13:0',
        participants: ['Ann', 'Bob'],
        position: 0,
      });

      const updated = await tasks.update(boardId, id, {
        startHour: '8:0',
        endHour: '9:30',
        participants: ['Carol'],
      });
      expect(updated.startHour).toBe('8:0');
      expect(updated.endHour).toBe('9:30');
      expect(updated.participants).toEqual(['Carol']);
    });

    it('rejects a task whose column is not in the board', async () => {
      await expect(
        tasks.create(boardId, {
          columnId: randomUUID(),
          title: 'Orphan',
          startHour: '9:0',
          endHour: '10:0',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes a task and rejects unknown ids', async () => {
      const col = await columns.create(boardId, { title: 'Room' });
      const task = await tasks.create(boardId, {
        columnId: col.id,
        title: 'Gone',
        startHour: '9:0',
        endHour: '10:0',
      });
      await tasks.remove(boardId, task.id);
      const rows = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', task.id)
        .execute();
      expect(rows).toHaveLength(0);

      await expect(tasks.remove(boardId, randomUUID())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('ParticipantsService', () => {
    it('adds participants idempotently and removes by name', async () => {
      await participants.add(boardId, 'Ann');
      await participants.add(boardId, 'Ann');
      await participants.add(boardId, 'Bob');
      expect((await participants.list(boardId)).sort()).toEqual(['Ann', 'Bob']);

      await participants.remove(boardId, 'Ann');
      expect(await participants.list(boardId)).toEqual(['Bob']);
    });
  });
});

import { Kysely } from 'kysely';
import { DB } from './database.types';
import {
  createTestDatabase,
  migrateTestDatabase,
  truncateAll,
} from './testing/test-database';

describe('Database (integration against scheduler_test)', () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDatabase();
    await migrateTestDatabase(db);
  }, 30000);

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  it('round-trips a jsonb config and a text[] participants column (snake_case)', async () => {
    const user = await db
      .insertInto('users')
      .values({ email: 'integration@test.dev', name: 'Integration' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const board = await db
      .insertInto('boards')
      .values({
        owner_id: user.id,
        name: 'Integration Board',
        config: JSON.stringify({
          dayStartHour: 6,
          dayEndHour: 21,
          segmentsByHour: 6,
        }),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    expect(board.config).toEqual({
      dayStartHour: 6,
      dayEndHour: 21,
      segmentsByHour: 6,
    });

    const column = await db
      .insertInto('columns')
      .values({ board_id: board.id, title: 'Main Stage', position: 0 })
      .returningAll()
      .executeTakeFirstOrThrow();

    const task = await db
      .insertInto('tasks')
      .values({
        board_id: board.id,
        column_id: column.id,
        title: 'Soundcheck',
        start_hour: '9:5',
        end_hour: '10:0',
        participants: ['Alice', 'Bob'],
        position: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    expect(task.participants).toEqual(['Alice', 'Bob']);
    expect(task.start_hour).toBe('9:5');
    expect(task.end_hour).toBe('10:0');

    const readBack = await db
      .selectFrom('tasks')
      .selectAll()
      .where('id', '=', task.id)
      .executeTakeFirstOrThrow();

    expect(readBack.participants).toEqual(['Alice', 'Bob']);
    expect(readBack.column_id).toBe(column.id);
    expect(readBack.board_id).toBe(board.id);
  });

  it('cascades task deletion when a column is removed', async () => {
    const user = await db
      .insertInto('users')
      .values({ email: 'cascade@test.dev' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const board = await db
      .insertInto('boards')
      .values({
        owner_id: user.id,
        name: 'Cascade Board',
        config: JSON.stringify({
          dayStartHour: 6,
          dayEndHour: 21,
          segmentsByHour: 6,
        }),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const column = await db
      .insertInto('columns')
      .values({ board_id: board.id, title: 'Stage' })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db
      .insertInto('tasks')
      .values({
        board_id: board.id,
        column_id: column.id,
        title: 'Set',
        start_hour: '9:0',
        end_hour: '10:0',
      })
      .execute();

    await db.deleteFrom('columns').where('id', '=', column.id).execute();

    const orphaned = await db
      .selectFrom('tasks')
      .selectAll()
      .where('column_id', '=', column.id)
      .execute();

    expect(orphaned).toHaveLength(0);
  });

  it('enforces the board_members role check constraint', async () => {
    const user = await db
      .insertInto('users')
      .values({ email: 'role@test.dev' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const board = await db
      .insertInto('boards')
      .values({
        owner_id: user.id,
        name: 'Role Board',
        config: JSON.stringify({
          dayStartHour: 6,
          dayEndHour: 21,
          segmentsByHour: 6,
        }),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await expect(
      db
        .insertInto('board_members')
        .values({
          board_id: board.id,
          user_id: user.id,
          role: 'superuser' as never,
        })
        .execute(),
    ).rejects.toThrow();
  });
});

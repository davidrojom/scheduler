import 'dotenv/config';
import { Kysely, sql } from 'kysely';
import { DB } from '../database.types';
import { createKysely, createMigrator } from '../migrator';

export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) {
    return explicit;
  }

  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/[^/]*$/, '/scheduler_test');
  }

  throw new Error(
    'Set DATABASE_URL or TEST_DATABASE_URL to run database tests against scheduler_test',
  );
}

export function createTestDatabase(): Kysely<DB> {
  return createKysely(resolveTestDatabaseUrl());
}

export async function migrateTestDatabase(db: Kysely<DB>): Promise<void> {
  const migrator = createMigrator(db);
  const { error } = await migrator.migrateToLatest();
  if (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to migrate the test database');
  }
}

export async function truncateAll(db: Kysely<DB>): Promise<void> {
  await sql`truncate table participants, tasks, columns, board_invites, board_members, boards, users restart identity cascade`.execute(
    db,
  );
}

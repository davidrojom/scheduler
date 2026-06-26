import { promises as fs } from 'fs';
import * as path from 'path';
import {
  FileMigrationProvider,
  Kysely,
  Migrator,
  PostgresDialect,
} from 'kysely';
import { Pool } from 'pg';
import { DB } from './database.types';

export const MIGRATIONS_FOLDER = path.join(__dirname, 'migrations');

export function createKysely(
  connectionString: string | undefined = process.env.DATABASE_URL,
): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString, max: 10 }),
    }),
  });
}

export function createMigrator(db: Kysely<DB>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: MIGRATIONS_FOLDER,
    }),
  });
}

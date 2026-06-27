// Production migration runner. Lives under src/ (unlike scripts/migrate.ts,
// which uses tsx) so `nest build` compiles it to dist/database/migrate.js and it
// can run in the runtime image with `node dist/database/migrate.js` — no tsx or
// TypeScript sources needed. Reads DATABASE_URL from the environment (provided by
// the container/Coolify). Idempotent: safe to run on every container start.
import { createKysely, createMigrator } from './migrator';

async function migrateToLatest(): Promise<void> {
  const db = createKysely();
  const migrator = createMigrator(db);

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      console.log(`migration "${result.migrationName}" executed successfully`);
    } else if (result.status === 'Error') {
      console.error(`failed to execute migration "${result.migrationName}"`);
    }
  }

  await db.destroy();

  if (error) {
    console.error('migration failed');
    console.error(error);
    process.exit(1);
  }
}

void migrateToLatest();

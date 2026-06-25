import 'dotenv/config';
import { createKysely, createMigrator } from '../src/database/migrator';

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

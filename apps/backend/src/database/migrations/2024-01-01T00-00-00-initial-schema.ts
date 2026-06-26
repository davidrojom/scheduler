import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`create extension if not exists pgcrypto`.execute(db);

  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('google_id', 'text', (c) => c.unique())
    .addColumn('email', 'text', (c) => c.notNull().unique())
    .addColumn('name', 'text')
    .addColumn('avatar_url', 'text')
    .addColumn('created_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('boards')
    .addColumn('id', 'uuid', (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('owner_id', 'uuid', (c) =>
      c.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('config', 'jsonb', (c) =>
      c.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('created_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('board_members')
    .addColumn('board_id', 'uuid', (c) =>
      c.notNull().references('boards.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (c) =>
      c.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('role', 'text', (c) =>
      c.notNull().check(sql`role in ('owner', 'editor', 'viewer')`),
    )
    .addColumn('created_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('board_members_pkey', ['board_id', 'user_id'])
    .execute();

  await db.schema
    .createTable('board_invites')
    .addColumn('id', 'uuid', (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('board_id', 'uuid', (c) =>
      c.notNull().references('boards.id').onDelete('cascade'),
    )
    .addColumn('token', 'text', (c) => c.notNull().unique())
    .addColumn('role', 'text', (c) =>
      c.notNull().check(sql`role in ('editor', 'viewer')`),
    )
    .addColumn('created_by', 'uuid', (c) =>
      c.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn('expires_at', 'timestamptz')
    .addColumn('revoked', 'boolean', (c) => c.notNull().defaultTo(false))
    .execute();

  await db.schema
    .createTable('columns')
    .addColumn('id', 'uuid', (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('board_id', 'uuid', (c) =>
      c.notNull().references('boards.id').onDelete('cascade'),
    )
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('position', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('tasks')
    .addColumn('id', 'uuid', (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('board_id', 'uuid', (c) =>
      c.notNull().references('boards.id').onDelete('cascade'),
    )
    .addColumn('column_id', 'uuid', (c) =>
      c.notNull().references('columns.id').onDelete('cascade'),
    )
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('start_hour', 'text', (c) => c.notNull())
    .addColumn('end_hour', 'text', (c) => c.notNull())
    .addColumn('participants', sql`text[]`, (c) =>
      c.notNull().defaultTo(sql`'{}'::text[]`),
    )
    .addColumn('position', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('participants')
    .addColumn('id', 'uuid', (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('board_id', 'uuid', (c) =>
      c.notNull().references('boards.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('participants_board_id_name_key', ['board_id', 'name'])
    .execute();

  await db.schema
    .createIndex('board_members_user_id_idx')
    .on('board_members')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('columns_board_id_idx')
    .on('columns')
    .column('board_id')
    .execute();

  await db.schema
    .createIndex('tasks_board_id_idx')
    .on('tasks')
    .column('board_id')
    .execute();

  await db.schema
    .createIndex('tasks_column_id_idx')
    .on('tasks')
    .column('column_id')
    .execute();

  await db.schema
    .createIndex('board_invites_token_idx')
    .on('board_invites')
    .column('token')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('participants').ifExists().execute();
  await db.schema.dropTable('tasks').ifExists().execute();
  await db.schema.dropTable('columns').ifExists().execute();
  await db.schema.dropTable('board_invites').ifExists().execute();
  await db.schema.dropTable('board_members').ifExists().execute();
  await db.schema.dropTable('boards').ifExists().execute();
  await db.schema.dropTable('users').ifExists().execute();
}

import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Database, KYSELY } from '../database/database.module';
import { User } from '../database/database.types';
import {
  UpsertByEmailInput,
  UpsertByGoogleInput,
  UserDto,
} from './users.types';

@Injectable()
export class UsersService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async upsertByGoogle(input: UpsertByGoogleInput): Promise<UserDto> {
    const row = await this.db.transaction().execute(async (trx) => {
      const matches = await trx
        .selectFrom('users')
        .selectAll()
        .where((eb) =>
          eb.or([
            eb('google_id', '=', input.googleId),
            eb('email', '=', input.email),
          ]),
        )
        .execute();

      const existing =
        matches.find((u) => u.google_id === input.googleId) ?? matches[0];

      if (existing) {
        return trx
          .updateTable('users')
          .set({
            google_id: input.googleId,
            email: input.email,
            name: input.name ?? existing.name,
            avatar_url: input.avatarUrl ?? existing.avatar_url,
            updated_at: new Date(),
          })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      return trx
        .insertInto('users')
        .values({
          google_id: input.googleId,
          email: input.email,
          name: input.name ?? null,
          avatar_url: input.avatarUrl ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    return mapUser(row);
  }

  async upsertByEmail(input: UpsertByEmailInput): Promise<UserDto> {
    const row = await this.db
      .insertInto('users')
      .values({ email: input.email, name: input.name ?? null })
      .onConflict((oc) =>
        oc.column('email').doUpdateSet({
          name: sql<string | null>`coalesce(excluded.name, users.name)`,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapUser(row);
  }

  async findById(id: string): Promise<UserDto | null> {
    const row = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? mapUser(row) : null;
  }
}

function mapUser(row: User): UserDto {
  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

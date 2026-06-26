import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { Database } from '../database/database.module';
import { BoardRole } from '../database/database.types';
import {
  createTestDatabase,
  migrateTestDatabase,
  truncateAll,
} from '../database/testing/test-database';
import { BoardsService } from '../boards/boards.service';
import { UsersService } from '../users/users.service';
import { InvitesService } from './invites.service';

describe('InvitesService (against scheduler_test)', () => {
  let db: Database;
  let invites: InvitesService;
  let boards: BoardsService;
  let users: UsersService;
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let outsiderId: string;
  let boardId: string;

  const config = { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 };

  const memberRole = async (userId: string): Promise<BoardRole | null> => {
    const row = await db
      .selectFrom('board_members')
      .select('role')
      .where('board_id', '=', boardId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.role ?? null;
  };

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
    invites = new InvitesService(
      db,
      new ConfigService({ FRONTEND_URL: 'http://localhost:4200' }),
    );

    ownerId = (await users.upsertByEmail({ email: 'owner@test.dev' })).id;
    editorId = (await users.upsertByEmail({ email: 'editor@test.dev' })).id;
    viewerId = (await users.upsertByEmail({ email: 'viewer@test.dev' })).id;
    outsiderId = (await users.upsertByEmail({ email: 'out@test.dev' })).id;

    boardId = randomUUID();
    await boards.create(ownerId, { id: boardId, name: 'Board', config });
    await db
      .insertInto('board_members')
      .values([
        { board_id: boardId, user_id: editorId, role: 'editor' },
        { board_id: boardId, user_id: viewerId, role: 'viewer' },
      ])
      .execute();
  });

  describe('create', () => {
    it('mints a token and a join url for the configured frontend', async () => {
      const invite = await invites.create(boardId, ownerId, 'viewer');
      expect(invite.token).toBeTruthy();
      expect(invite.role).toBe('viewer');
      expect(invite.url).toBe(`http://localhost:4200/join/${invite.token}`);
    });
  });

  describe('getInfo', () => {
    it('reports valid:true with board info for a live token', async () => {
      const invite = await invites.create(boardId, ownerId, 'editor');
      const info = await invites.getInfo(invite.token);
      expect(info).toEqual({
        boardId,
        boardName: 'Board',
        role: 'editor',
        valid: true,
      });
    });

    it('reports valid:false for a nonexistent token', async () => {
      const info = await invites.getInfo('nope');
      expect(info.valid).toBe(false);
      expect(info.boardId).toBeNull();
    });

    it('reports valid:false for a revoked token', async () => {
      const invite = await invites.create(boardId, ownerId, 'viewer');
      await invites.revoke(boardId, invite.id);
      expect((await invites.getInfo(invite.token)).valid).toBe(false);
    });

    it('reports valid:false for an expired token', async () => {
      const invite = await invites.create(boardId, ownerId, 'viewer');
      await db
        .updateTable('board_invites')
        .set({ expires_at: new Date(Date.now() - 1000) })
        .where('id', '=', invite.id)
        .execute();
      expect((await invites.getInfo(invite.token)).valid).toBe(false);
    });
  });

  describe('accept', () => {
    it('adds a brand-new member with the invite role', async () => {
      const invite = await invites.create(boardId, ownerId, 'viewer');
      const res = await invites.accept(invite.token, outsiderId);
      expect(res.boardId).toBe(boardId);
      expect(await memberRole(outsiderId)).toBe('viewer');
    });

    it('does not downgrade an existing editor accepting a viewer invite', async () => {
      const invite = await invites.create(boardId, ownerId, 'viewer');
      await invites.accept(invite.token, editorId);
      expect(await memberRole(editorId)).toBe('editor');
    });

    it('does not alter the owner accepting a viewer invite', async () => {
      const invite = await invites.create(boardId, ownerId, 'viewer');
      await invites.accept(invite.token, ownerId);
      expect(await memberRole(ownerId)).toBe('owner');
    });

    it('upgrades an existing viewer accepting an editor invite', async () => {
      const invite = await invites.create(boardId, ownerId, 'editor');
      await invites.accept(invite.token, viewerId);
      expect(await memberRole(viewerId)).toBe('editor');
    });

    it('rejects a revoked invite and creates no membership', async () => {
      const invite = await invites.create(boardId, ownerId, 'viewer');
      await invites.revoke(boardId, invite.id);
      await expect(invites.accept(invite.token, outsiderId)).rejects.toThrow(
        NotFoundException,
      );
      expect(await memberRole(outsiderId)).toBeNull();
    });
  });

  describe('revoke', () => {
    it('throws NotFound for an unknown invite id', async () => {
      await expect(invites.revoke(boardId, randomUUID())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFound for a non-uuid invite id without hitting the db', async () => {
      await expect(invites.revoke(boardId, 'not-a-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { Database, KYSELY } from '../src/database/database.module';
import {
  createTestDatabase,
  migrateTestDatabase,
  truncateAll,
} from '../src/database/testing/test-database';
import { UsersService } from '../src/users/users.service';

describe('Boards (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let httpServer: Server;
  let users: UsersService;
  let auth: AuthService;

  let aliceToken: string;
  let bobToken: string;
  let aliceId: string;
  let bobId: string;

  const config = { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 };

  beforeAll(async () => {
    db = createTestDatabase();
    await migrateTestDatabase(db);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KYSELY)
      .useValue(db)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    httpServer = app.getHttpServer() as Server;
    users = app.get(UsersService);
    auth = app.get(AuthService);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
    const alice = await users.upsertByEmail({
      email: 'alice@example.com',
      name: 'Alice',
    });
    const bob = await users.upsertByEmail({
      email: 'bob@example.com',
      name: 'Bob',
    });
    aliceId = alice.id;
    bobId = bob.id;
    aliceToken = await auth.login(alice);
    bobToken = await auth.login(bob);
  });

  const bearer = (token: string) => `Bearer ${token}`;

  // VAL-BOARDS-018
  describe('create / read / update round-trip', () => {
    it('POST creates a board (201) with the client uuid and owner membership', async () => {
      const id = randomUUID();
      const res = await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .send({ id, name: 'Round Trip', config })
        .expect(201);

      const body = res.body as { id: string; ownerId: string; myRole: string };
      expect(body.id).toBe(id);
      expect(body.ownerId).toBe(aliceId);
      expect(body.myRole).toBe('owner');
    });

    it('GET /api/boards/:id returns the full payload with myRole=owner', async () => {
      const id = randomUUID();
      await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .send({ id, name: 'Full Payload', config })
        .expect(201);

      const res = await request(httpServer)
        .get(`/api/boards/${id}`)
        .set('Authorization', bearer(aliceToken))
        .expect(200);

      const body = res.body as {
        board: { id: string; ownerId: string; config: typeof config };
        myRole: string;
        members: { userId: string; email: string; role: string }[];
        columns: unknown[];
        tasks: unknown[];
        participants: unknown[];
      };
      expect(body.board.id).toBe(id);
      expect(body.board.ownerId).toBe(aliceId);
      expect(body.board.config).toEqual(config);
      expect(body.myRole).toBe('owner');
      expect(body.members).toEqual([
        expect.objectContaining({
          userId: aliceId,
          email: 'alice@example.com',
          role: 'owner',
        }),
      ]);
      expect(body.columns).toEqual([]);
      expect(body.tasks).toEqual([]);
      expect(body.participants).toEqual([]);
    });

    it('PATCH updates name/config (200) and is reflected on re-read', async () => {
      const id = randomUUID();
      await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .send({ id, name: 'Before', config })
        .expect(201);

      await request(httpServer)
        .patch(`/api/boards/${id}`)
        .set('Authorization', bearer(aliceToken))
        .send({
          name: 'After',
          config: { dayStartHour: 8, dayEndHour: 18, segmentsByHour: 2 },
        })
        .expect(200);

      const res = await request(httpServer)
        .get(`/api/boards/${id}`)
        .set('Authorization', bearer(aliceToken))
        .expect(200);
      const body = res.body as {
        board: { name: string; config: { dayStartHour: number } };
      };
      expect(body.board.name).toBe('After');
      expect(body.board.config).toEqual({
        dayStartHour: 8,
        dayEndHour: 18,
        segmentsByHour: 2,
      });
    });
  });

  // VAL-BOARDS-017
  describe('GET /api/boards lists only the requesting user boards', () => {
    it('does not leak another user boards', async () => {
      const aliceBoardId = randomUUID();
      const bobBoardId = randomUUID();
      await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .send({ id: aliceBoardId, name: 'Alice Only', config })
        .expect(201);
      await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(bobToken))
        .send({ id: bobBoardId, name: 'Bob Only', config })
        .expect(201);

      const aliceRes = await request(httpServer)
        .get('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .expect(200);
      const aliceList = aliceRes.body as { id: string; myRole: string }[];
      const aliceIds = aliceList.map((b) => b.id);
      expect(aliceIds).toContain(aliceBoardId);
      expect(aliceIds).not.toContain(bobBoardId);
      expect(aliceList.every((b) => b.myRole === 'owner')).toBe(true);

      const bobRes = await request(httpServer)
        .get('/api/boards')
        .set('Authorization', bearer(bobToken))
        .expect(200);
      const bobIds = (bobRes.body as { id: string }[]).map((b) => b.id);
      expect(bobIds).toContain(bobBoardId);
      expect(bobIds).not.toContain(aliceBoardId);
    });
  });

  // VAL-BOARDS-019
  describe('non-member access control', () => {
    let aliceBoardId: string;

    beforeEach(async () => {
      aliceBoardId = randomUUID();
      await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .send({ id: aliceBoardId, name: 'Private', config })
        .expect(201);
    });

    it('returns 403/404 for a non-member and leaks no payload', async () => {
      const res = await request(httpServer)
        .get(`/api/boards/${aliceBoardId}`)
        .set('Authorization', bearer(bobToken));
      expect([403, 404]).toContain(res.status);
      expect((res.body as { board?: unknown }).board).toBeUndefined();
    });

    it('returns 401 when unauthenticated', async () => {
      await request(httpServer).get(`/api/boards/${aliceBoardId}`).expect(401);
    });

    it('enforces roles for a viewer member (read ok, write/delete forbidden)', async () => {
      await db
        .insertInto('board_members')
        .values({ board_id: aliceBoardId, user_id: bobId, role: 'viewer' })
        .execute();

      const read = await request(httpServer)
        .get(`/api/boards/${aliceBoardId}`)
        .set('Authorization', bearer(bobToken))
        .expect(200);
      expect((read.body as { myRole: string }).myRole).toBe('viewer');

      await request(httpServer)
        .patch(`/api/boards/${aliceBoardId}`)
        .set('Authorization', bearer(bobToken))
        .send({ name: 'Hacked' })
        .expect(403);

      await request(httpServer)
        .delete(`/api/boards/${aliceBoardId}`)
        .set('Authorization', bearer(bobToken))
        .expect(403);
    });
  });

  describe('DELETE /api/boards/:id (owner only)', () => {
    it('removes the board and a subsequent GET returns 404', async () => {
      const id = randomUUID();
      await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .send({ id, name: 'Doomed', config })
        .expect(201);

      const del = await request(httpServer)
        .delete(`/api/boards/${id}`)
        .set('Authorization', bearer(aliceToken));
      expect([200, 204]).toContain(del.status);

      await request(httpServer)
        .get(`/api/boards/${id}`)
        .set('Authorization', bearer(aliceToken))
        .expect(404);
    });
  });

  describe('board members endpoints', () => {
    let boardId: string;

    beforeEach(async () => {
      boardId = randomUUID();
      await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .send({ id: boardId, name: 'Team', config })
        .expect(201);
      await db
        .insertInto('board_members')
        .values({ board_id: boardId, user_id: bobId, role: 'editor' })
        .execute();
    });

    it('GET /:id/members lists collaborators for any member', async () => {
      const res = await request(httpServer)
        .get(`/api/boards/${boardId}/members`)
        .set('Authorization', bearer(bobToken))
        .expect(200);

      const members = res.body as { userId: string; role: string }[];
      expect(members).toHaveLength(2);
      expect(members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: aliceId, role: 'owner' }),
          expect.objectContaining({ userId: bobId, role: 'editor' }),
        ]),
      );
    });

    it('GET /:id/members is forbidden to a non-member (no leak)', async () => {
      const charlie = await users.upsertByEmail({ email: 'charlie@x.com' });
      const charlieToken = await auth.login(charlie);
      const res = await request(httpServer)
        .get(`/api/boards/${boardId}/members`)
        .set('Authorization', bearer(charlieToken));
      expect([403, 404]).toContain(res.status);
    });

    it('lets the owner remove a collaborator (200), dropping their access', async () => {
      const del = await request(httpServer)
        .delete(`/api/boards/${boardId}/members/${bobId}`)
        .set('Authorization', bearer(aliceToken));
      expect([200, 204]).toContain(del.status);

      const members = await request(httpServer)
        .get(`/api/boards/${boardId}/members`)
        .set('Authorization', bearer(aliceToken))
        .expect(200);
      expect((members.body as { userId: string }[]).map((m) => m.userId)).toEqual(
        [aliceId],
      );

      // The removed user can no longer read the board.
      await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(bobToken))
        .expect(404);
    });

    it('forbids a non-owner from removing members', async () => {
      await request(httpServer)
        .delete(`/api/boards/${boardId}/members/${aliceId}`)
        .set('Authorization', bearer(bobToken))
        .expect(403);
    });

    it('refuses to remove the owner (403) and keeps the membership', async () => {
      await request(httpServer)
        .delete(`/api/boards/${boardId}/members/${aliceId}`)
        .set('Authorization', bearer(aliceToken))
        .expect(403);
      expect(await boardsHasMember(boardId, aliceId)).toBe(true);
    });

    it('returns 404 when removing a user who is not a member', async () => {
      const charlie = await users.upsertByEmail({ email: 'charlie2@x.com' });
      await request(httpServer)
        .delete(`/api/boards/${boardId}/members/${charlie.id}`)
        .set('Authorization', bearer(aliceToken))
        .expect(404);
    });
  });

  async function boardsHasMember(
    board: string,
    userId: string,
  ): Promise<boolean> {
    const row = await db
      .selectFrom('board_members')
      .select('user_id')
      .where('board_id', '=', board)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return !!row;
  }

  // VAL-AUTH-018 (boards portion): a board created with one token for a user is
  // visible via a second token minted for the same email.
  describe('persistent identity across impersonations', () => {
    it('a board created with token A is listed for a fresh token minted for the same email', async () => {
      const reAlice = await users.upsertByEmail({ email: 'alice@example.com' });
      const secondToken = await auth.login(reAlice);
      expect(reAlice.id).toBe(aliceId);

      const id = randomUUID();
      await request(httpServer)
        .post('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .send({ id, name: 'Durable', config })
        .expect(201);

      const res = await request(httpServer)
        .get('/api/boards')
        .set('Authorization', bearer(secondToken))
        .expect(200);
      expect((res.body as { id: string }[]).map((b) => b.id)).toContain(id);
    });
  });

  // VAL-BOARDS-007 / VAL-BOARDS-008
  describe('POST /api/boards/import', () => {
    it('creates boards preserving client ids and is idempotent on re-import', async () => {
      const boardId = randomUUID();
      const columnId = randomUUID();
      const taskId = randomUUID();
      const payload = {
        boards: [
          {
            board: { id: boardId, name: 'Imported', config },
            columns: [{ id: columnId, title: 'Stage', position: 0 }],
            tasks: [
              {
                id: taskId,
                columnId,
                title: 'Set',
                startHour: '9:5',
                endHour: '9:35',
                participants: ['Ann'],
                position: 0,
              },
            ],
            participants: ['Ann'],
          },
        ],
      };

      const first = await request(httpServer)
        .post('/api/boards/import')
        .set('Authorization', bearer(aliceToken))
        .send(payload);
      expect([200, 201]).toContain(first.status);
      expect((first.body as { boards: { id: string }[] }).boards).toHaveLength(
        1,
      );

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(aliceToken))
        .expect(200);
      const body = detail.body as {
        columns: { id: string }[];
        tasks: { id: string; startHour: string }[];
        participants: string[];
      };
      expect(body.columns[0].id).toBe(columnId);
      expect(body.tasks[0].id).toBe(taskId);
      expect(body.tasks[0].startHour).toBe('9:5');
      expect(body.participants).toEqual(['Ann']);

      const second = await request(httpServer)
        .post('/api/boards/import')
        .set('Authorization', bearer(aliceToken))
        .send(payload);
      expect([200, 201]).toContain(second.status);
      expect((second.body as { boards: unknown[] }).boards).toHaveLength(0);

      const list = await request(httpServer)
        .get('/api/boards')
        .set('Authorization', bearer(aliceToken))
        .expect(200);
      expect(
        (list.body as { id: string }[]).filter((b) => b.id === boardId),
      ).toHaveLength(1);
    });
  });
});

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

describe('Invites & roles (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let httpServer: Server;
  let users: UsersService;
  let auth: AuthService;

  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let strangerToken: string;
  let editorId: string;
  let viewerId: string;
  let strangerId: string;

  let boardId: string;

  const config = { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 };
  const bearer = (token: string) => `Bearer ${token}`;

  const createInvite = async (
    token: string,
    role: 'editor' | 'viewer',
  ): Promise<{ id: string; token: string; role: string; url: string }> => {
    const res = await request(httpServer)
      .post(`/api/boards/${boardId}/invites`)
      .set('Authorization', bearer(token))
      .send({ role })
      .expect(201);
    return res.body as {
      id: string;
      token: string;
      role: string;
      url: string;
    };
  };

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

    const owner = await users.upsertByEmail({
      email: 'owner@example.com',
      name: 'Owner',
    });
    const editor = await users.upsertByEmail({
      email: 'editor@example.com',
      name: 'Editor',
    });
    const viewer = await users.upsertByEmail({
      email: 'viewer@example.com',
      name: 'Viewer',
    });
    const stranger = await users.upsertByEmail({
      email: 'stranger@example.com',
      name: 'Stranger',
    });
    editorId = editor.id;
    viewerId = viewer.id;
    strangerId = stranger.id;
    ownerToken = await auth.login(owner);
    editorToken = await auth.login(editor);
    viewerToken = await auth.login(viewer);
    strangerToken = await auth.login(stranger);

    boardId = randomUUID();
    await request(httpServer)
      .post('/api/boards')
      .set('Authorization', bearer(ownerToken))
      .send({ id: boardId, name: 'Contract Board', config })
      .expect(201);

    await db
      .insertInto('board_members')
      .values([
        { board_id: boardId, user_id: editorId, role: 'editor' },
        { board_id: boardId, user_id: viewerId, role: 'viewer' },
      ])
      .execute();
  });

  // VAL-INVITE-015
  describe('POST /api/boards/:id/invites is role-gated', () => {
    it('lets owner mint a viewer invite with token+role+url', async () => {
      const res = await request(httpServer)
        .post(`/api/boards/${boardId}/invites`)
        .set('Authorization', bearer(ownerToken))
        .send({ role: 'viewer' })
        .expect(201);
      const body = res.body as { token: string; role: string; url: string };
      expect(typeof body.token).toBe('string');
      expect(body.token.length).toBeGreaterThan(0);
      expect(body.role).toBe('viewer');
      expect(body.url).toBe(`http://localhost:4200/join/${body.token}`);
    });

    it('lets an editor mint an invite', async () => {
      await request(httpServer)
        .post(`/api/boards/${boardId}/invites`)
        .set('Authorization', bearer(editorToken))
        .send({ role: 'editor' })
        .expect(201);
    });

    it('rejects a viewer (403), a non-member (404) and an unauthenticated caller (401)', async () => {
      await request(httpServer)
        .post(`/api/boards/${boardId}/invites`)
        .set('Authorization', bearer(viewerToken))
        .send({ role: 'viewer' })
        .expect(403);
      await request(httpServer)
        .post(`/api/boards/${boardId}/invites`)
        .set('Authorization', bearer(strangerToken))
        .send({ role: 'viewer' })
        .expect(404);
      await request(httpServer)
        .post(`/api/boards/${boardId}/invites`)
        .send({ role: 'viewer' })
        .expect(401);
    });

    it('rejects an invalid invite role with 400', async () => {
      await request(httpServer)
        .post(`/api/boards/${boardId}/invites`)
        .set('Authorization', bearer(ownerToken))
        .send({ role: 'owner' })
        .expect(400);
    });
  });

  // VAL-INVITE-016 + VAL-INVITE-022
  describe('GET /api/invites/:token reports validity without leaking content', () => {
    it('returns board info with valid:true for a live token and leaks no board content (no auth required)', async () => {
      const invite = await createInvite(ownerToken, 'viewer');

      const res = await request(httpServer)
        .get(`/api/invites/${invite.token}`)
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toEqual({
        boardId,
        boardName: 'Contract Board',
        role: 'viewer',
        valid: true,
      });
      expect(body).not.toHaveProperty('columns');
      expect(body).not.toHaveProperty('tasks');
      expect(body).not.toHaveProperty('members');
      expect(body).not.toHaveProperty('participants');
    });

    it('returns valid:false for a nonexistent token (HTTP 200, no leak)', async () => {
      const res = await request(httpServer)
        .get('/api/invites/this-token-does-not-exist')
        .expect(200);
      expect((res.body as { valid: boolean }).valid).toBe(false);
      expect(res.body as Record<string, unknown>).not.toHaveProperty('columns');
    });

    it('returns valid:false for a revoked token', async () => {
      const invite = await createInvite(ownerToken, 'viewer');
      await request(httpServer)
        .delete(`/api/boards/${boardId}/invites/${invite.id}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);

      const res = await request(httpServer)
        .get(`/api/invites/${invite.token}`)
        .expect(200);
      expect((res.body as { valid: boolean }).valid).toBe(false);
    });
  });

  // VAL-INVITE-017
  describe('POST /api/invites/:token/accept creates membership and unlocks the board', () => {
    it('adds the stranger as a member with the invite role and exposes them in members[]', async () => {
      const invite = await createInvite(ownerToken, 'viewer');

      const accept = await request(httpServer)
        .post(`/api/invites/${invite.token}/accept`)
        .set('Authorization', bearer(strangerToken))
        .expect(201);
      expect((accept.body as { boardId: string }).boardId).toBe(boardId);

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(strangerToken))
        .expect(200);
      const body = detail.body as {
        myRole: string;
        members: { userId: string; role: string }[];
      };
      expect(body.myRole).toBe('viewer');
      const me = body.members.find((m) => m.userId === strangerId);
      expect(me?.role).toBe('viewer');
    });

    it('rejects accepting an unauthenticated request with 401', async () => {
      const invite = await createInvite(ownerToken, 'viewer');
      await request(httpServer)
        .post(`/api/invites/${invite.token}/accept`)
        .expect(401);
    });
  });

  // VAL-INVITE-018
  describe('accepting a lower-role invite never downgrades a higher existing role', () => {
    it('keeps an existing editor at editor when they accept a viewer invite', async () => {
      const invite = await createInvite(ownerToken, 'viewer');
      await request(httpServer)
        .post(`/api/invites/${invite.token}/accept`)
        .set('Authorization', bearer(editorToken))
        .expect(201);

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(editorToken))
        .expect(200);
      const body = detail.body as {
        myRole: string;
        members: { userId: string; role: string }[];
      };
      expect(body.myRole).toBe('editor');
      expect(body.members.find((m) => m.userId === editorId)?.role).toBe(
        'editor',
      );
    });

    it('keeps the owner at owner when they accept a viewer invite', async () => {
      const invite = await createInvite(ownerToken, 'viewer');
      await request(httpServer)
        .post(`/api/invites/${invite.token}/accept`)
        .set('Authorization', bearer(ownerToken))
        .expect(201);

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
      expect((detail.body as { myRole: string }).myRole).toBe('owner');
    });

    it('upgrades an existing viewer to editor when they accept an editor invite', async () => {
      const invite = await createInvite(ownerToken, 'editor');
      await request(httpServer)
        .post(`/api/invites/${invite.token}/accept`)
        .set('Authorization', bearer(viewerToken))
        .expect(201);

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(viewerToken))
        .expect(200);
      expect((detail.body as { myRole: string }).myRole).toBe('editor');
    });
  });

  // VAL-INVITE-016 / VAL-INVITE-008 (API): a revoked invite cannot be accepted
  describe('revoked invites', () => {
    it('lets the owner revoke but rejects an editor revoke (403)', async () => {
      const invite = await createInvite(ownerToken, 'viewer');
      await request(httpServer)
        .delete(`/api/boards/${boardId}/invites/${invite.id}`)
        .set('Authorization', bearer(editorToken))
        .expect(403);
      await request(httpServer)
        .delete(`/api/boards/${boardId}/invites/${invite.id}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
    });

    it('cannot be accepted after revocation', async () => {
      const invite = await createInvite(ownerToken, 'viewer');
      await request(httpServer)
        .delete(`/api/boards/${boardId}/invites/${invite.id}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);

      const accept = await request(httpServer)
        .post(`/api/invites/${invite.token}/accept`)
        .set('Authorization', bearer(strangerToken));
      expect([403, 404, 410]).toContain(accept.status);

      // stranger never became a member
      await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(strangerToken))
        .expect(404);
    });
  });

  // VAL-INVITE-020 — viewer content writes rejected server-side with a real (invite-accepted) viewer
  describe('viewer (via accepted invite) cannot write content', () => {
    it('rejects task/column/participant creation and board rename with 403', async () => {
      const invite = await createInvite(ownerToken, 'viewer');
      await request(httpServer)
        .post(`/api/invites/${invite.token}/accept`)
        .set('Authorization', bearer(strangerToken))
        .expect(201);

      await request(httpServer)
        .post(`/api/boards/${boardId}/tasks`)
        .set('Authorization', bearer(strangerToken))
        .send({
          columnId: randomUUID(),
          title: 'Nope',
          startHour: '9:0',
          endHour: '10:0',
        })
        .expect(403);
      await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(strangerToken))
        .send({ title: 'Nope' })
        .expect(403);
      await request(httpServer)
        .post(`/api/boards/${boardId}/participants`)
        .set('Authorization', bearer(strangerToken))
        .send({ name: 'Nope' })
        .expect(403);
      await request(httpServer)
        .patch(`/api/boards/${boardId}`)
        .set('Authorization', bearer(strangerToken))
        .send({ name: 'Renamed by viewer' })
        .expect(403);
    });
  });

  // VAL-INVITE-021 — editor cannot delete the board, owner can; members[] reflects roles
  describe('board delete role enforcement and members[]', () => {
    it('reports owner/editor/viewer roles in members[]', async () => {
      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
      const members = (
        detail.body as { members: { userId: string; role: string }[] }
      ).members;
      const byId = new Map(members.map((m) => [m.userId, m.role]));
      expect(byId.get(editorId)).toBe('editor');
      expect(byId.get(viewerId)).toBe('viewer');
      expect([...byId.values()]).toContain('owner');
    });

    it('forbids an editor deleting the board (403) but allows the owner (200/204)', async () => {
      await request(httpServer)
        .delete(`/api/boards/${boardId}`)
        .set('Authorization', bearer(editorToken))
        .expect(403);

      // board still exists for the editor
      await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(editorToken))
        .expect(200);

      const del = await request(httpServer)
        .delete(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken));
      expect([200, 204]).toContain(del.status);

      await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(404);
    });
  });
});

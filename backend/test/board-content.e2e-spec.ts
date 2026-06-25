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

describe('Board content (e2e)', () => {
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

  let boardId: string;

  const config = { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 };
  const bearer = (token: string) => `Bearer ${token}`;

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
    ownerToken = await auth.login(owner);
    editorToken = await auth.login(editor);
    viewerToken = await auth.login(viewer);
    strangerToken = await auth.login(stranger);

    boardId = randomUUID();
    await request(httpServer)
      .post('/api/boards')
      .set('Authorization', bearer(ownerToken))
      .send({ id: boardId, name: 'Content Board', config })
      .expect(201);

    await db
      .insertInto('board_members')
      .values([
        { board_id: boardId, user_id: editorId, role: 'editor' },
        { board_id: boardId, user_id: viewerId, role: 'viewer' },
      ])
      .execute();
  });

  describe('columns CRUD + reorder', () => {
    it('creates, updates and reorders columns (camelCase entities)', async () => {
      const colId = randomUUID();
      const created = await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(ownerToken))
        .send({ id: colId, title: 'Stage' })
        .expect(201);
      expect(created.body).toEqual({ id: colId, title: 'Stage', position: 0 });

      const second = await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(editorToken))
        .send({ title: 'Side' })
        .expect(201);
      const sideId = (second.body as { id: string }).id;
      expect((second.body as { position: number }).position).toBe(1);

      const renamed = await request(httpServer)
        .patch(`/api/boards/${boardId}/columns/${colId}`)
        .set('Authorization', bearer(ownerToken))
        .send({ title: 'Main Stage' })
        .expect(200);
      expect(renamed.body).toEqual({
        id: colId,
        title: 'Main Stage',
        position: 0,
      });

      const reordered = await request(httpServer)
        .patch(`/api/boards/${boardId}/columns/reorder`)
        .set('Authorization', bearer(ownerToken))
        .send({ orderedIds: [sideId, colId] })
        .expect(200);
      const orderedBody = reordered.body as { id: string; position: number }[];
      expect(orderedBody.map((c) => c.id)).toEqual([sideId, colId]);
      expect(orderedBody.map((c) => c.position)).toEqual([0, 1]);

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
      const cols = (detail.body as { columns: { id: string }[] }).columns;
      expect(cols.map((c) => c.id)).toEqual([sideId, colId]);
    });
  });

  describe('tasks CRUD with H:M time format', () => {
    it('round-trips startHour/endHour as non-zero-padded strings and participants as string[]', async () => {
      const colId = randomUUID();
      await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(ownerToken))
        .send({ id: colId, title: 'Room' })
        .expect(201);

      const taskId = randomUUID();
      const created = await request(httpServer)
        .post(`/api/boards/${boardId}/tasks`)
        .set('Authorization', bearer(editorToken))
        .send({
          id: taskId,
          columnId: colId,
          title: 'Talk',
          startHour: '9:5',
          endHour: '13:0',
          participants: ['Ann', 'Bob'],
        })
        .expect(201);
      expect(created.body).toEqual({
        id: taskId,
        columnId: colId,
        title: 'Talk',
        startHour: '9:5',
        endHour: '13:0',
        participants: ['Ann', 'Bob'],
        position: 0,
      });

      await request(httpServer)
        .patch(`/api/boards/${boardId}/tasks/${taskId}`)
        .set('Authorization', bearer(ownerToken))
        .send({ startHour: '8:0', endHour: '9:30', participants: ['Carol'] })
        .expect(200);

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
      const task = (detail.body as { tasks: Record<string, unknown>[] })
        .tasks[0];
      expect(task).toMatchObject({
        id: taskId,
        startHour: '8:0',
        endHour: '9:30',
        participants: ['Carol'],
      });

      await request(httpServer)
        .delete(`/api/boards/${boardId}/tasks/${taskId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);

      const after = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
      expect((after.body as { tasks: unknown[] }).tasks).toHaveLength(0);
    });
  });

  describe('participants add/remove', () => {
    it('adds and removes participants by name', async () => {
      await request(httpServer)
        .post(`/api/boards/${boardId}/participants`)
        .set('Authorization', bearer(ownerToken))
        .send({ name: 'Ann' })
        .expect(201);
      await request(httpServer)
        .post(`/api/boards/${boardId}/participants`)
        .set('Authorization', bearer(editorToken))
        .send({ name: 'Bob' })
        .expect(201);

      let detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
      expect(
        (detail.body as { participants: string[] }).participants.sort(),
      ).toEqual(['Ann', 'Bob']);

      await request(httpServer)
        .delete(`/api/boards/${boardId}/participants`)
        .set('Authorization', bearer(ownerToken))
        .send({ name: 'Ann' })
        .expect(200);

      detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
      expect((detail.body as { participants: string[] }).participants).toEqual([
        'Bob',
      ]);
    });
  });

  // VAL-BOARDS-020
  describe('deleting a column cascades to its tasks', () => {
    it('removes the column AND its tasks while leaving others intact', async () => {
      const doomedCol = randomUUID();
      const keepCol = randomUUID();
      await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(ownerToken))
        .send({ id: doomedCol, title: 'Doomed' })
        .expect(201);
      await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(ownerToken))
        .send({ id: keepCol, title: 'Keep' })
        .expect(201);

      const doomedTask = randomUUID();
      const survivorTask = randomUUID();
      await request(httpServer)
        .post(`/api/boards/${boardId}/tasks`)
        .set('Authorization', bearer(ownerToken))
        .send({
          id: doomedTask,
          columnId: doomedCol,
          title: 'Inside Doomed',
          startHour: '9:0',
          endHour: '10:0',
        })
        .expect(201);
      await request(httpServer)
        .post(`/api/boards/${boardId}/tasks`)
        .set('Authorization', bearer(ownerToken))
        .send({
          id: survivorTask,
          columnId: keepCol,
          title: 'Inside Keep',
          startHour: '11:0',
          endHour: '12:0',
        })
        .expect(201);

      const del = await request(httpServer)
        .delete(`/api/boards/${boardId}/columns/${doomedCol}`)
        .set('Authorization', bearer(ownerToken));
      expect([200, 204]).toContain(del.status);

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(ownerToken))
        .expect(200);
      const body = detail.body as {
        columns: { id: string }[];
        tasks: { id: string; columnId: string }[];
      };
      expect(body.columns.map((c) => c.id)).toEqual([keepCol]);
      expect(body.tasks.map((t) => t.id)).toEqual([survivorTask]);
      expect(body.tasks.some((t) => t.columnId === doomedCol)).toBe(false);
    });
  });

  // VAL-INVITE-020 (content portion): viewer content writes rejected 403
  describe('role enforcement', () => {
    let colId: string;

    beforeEach(async () => {
      colId = randomUUID();
      await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(ownerToken))
        .send({ id: colId, title: 'Seed' })
        .expect(201);
    });

    it('rejects every content write from a viewer with 403 and mutates nothing', async () => {
      await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(viewerToken))
        .send({ title: 'Nope' })
        .expect(403);
      await request(httpServer)
        .patch(`/api/boards/${boardId}/columns/${colId}`)
        .set('Authorization', bearer(viewerToken))
        .send({ title: 'Nope' })
        .expect(403);
      await request(httpServer)
        .patch(`/api/boards/${boardId}/columns/reorder`)
        .set('Authorization', bearer(viewerToken))
        .send({ orderedIds: [colId] })
        .expect(403);
      await request(httpServer)
        .delete(`/api/boards/${boardId}/columns/${colId}`)
        .set('Authorization', bearer(viewerToken))
        .expect(403);
      await request(httpServer)
        .post(`/api/boards/${boardId}/tasks`)
        .set('Authorization', bearer(viewerToken))
        .send({
          columnId: colId,
          title: 'Nope',
          startHour: '9:0',
          endHour: '10:0',
        })
        .expect(403);
      await request(httpServer)
        .post(`/api/boards/${boardId}/participants`)
        .set('Authorization', bearer(viewerToken))
        .send({ name: 'Nope' })
        .expect(403);

      const detail = await request(httpServer)
        .get(`/api/boards/${boardId}`)
        .set('Authorization', bearer(viewerToken))
        .expect(200);
      const body = detail.body as {
        columns: { id: string }[];
        tasks: unknown[];
        participants: unknown[];
      };
      expect(body.columns.map((c) => c.id)).toEqual([colId]);
      expect(body.tasks).toHaveLength(0);
      expect(body.participants).toHaveLength(0);
    });

    it('rejects a non-member with 404 and an unauthenticated caller with 401', async () => {
      await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .set('Authorization', bearer(strangerToken))
        .send({ title: 'Nope' })
        .expect(404);

      await request(httpServer)
        .post(`/api/boards/${boardId}/columns`)
        .send({ title: 'Nope' })
        .expect(401);
    });
  });
});

import { randomUUID } from 'crypto';
import { Server } from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { colorForUser } from '../src/collaboration/presence-color';
import { Database, KYSELY } from '../src/database/database.module';
import {
  createTestDatabase,
  migrateTestDatabase,
  truncateAll,
} from '../src/database/testing/test-database';
import { UsersService } from '../src/users/users.service';

interface ErrorPayload {
  code: string;
  event: string;
  message?: string;
}
interface PresenceSyncPayload {
  boardId: string;
  members: { userId: string; name: string; color: string }[];
}
interface PresenceEventPayload {
  boardId: string;
  member: { userId: string; name: string; color: string };
}
interface ColumnEventPayload {
  boardId: string;
  column: { id: string; title: string; position: number };
}
interface ParticipantEventPayload {
  boardId: string;
  name: string;
}
interface CursorMovedPayload {
  boardId: string;
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitFor<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload as T);
    });
  });
}

function waitConnect(socket: ClientSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err: unknown) =>
      reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

describe('CollaborationGateway (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let httpServer: Server;
  let users: UsersService;
  let auth: AuthService;
  let base: string;

  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let strangerToken: string;
  let ownerId: string;
  let editorId: string;
  let viewerId: string;

  let boardId: string;
  const config = { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 };
  const bearer = (token: string) => `Bearer ${token}`;

  const sockets: ClientSocket[] = [];
  function open(token?: string): ClientSocket {
    const socket = ioClient(`${base}/collab`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: token ? { token } : {},
    });
    sockets.push(socket);
    return socket;
  }
  async function joined(token: string): Promise<ClientSocket> {
    const socket = open(token);
    await waitConnect(socket);
    const sync = waitFor<PresenceSyncPayload>(socket, 'presence:sync');
    socket.emit('board:join', { boardId });
    await sync;
    return socket;
  }

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
    await app.listen(0);

    httpServer = app.getHttpServer() as Server;
    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    base = `http://127.0.0.1:${port}`;

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
    ownerId = owner.id;
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
      .send({ id: boardId, name: 'Collab Board', config })
      .expect(201);
    await db
      .insertInto('board_members')
      .values([
        { board_id: boardId, user_id: editorId, role: 'editor' },
        { board_id: boardId, user_id: viewerId, role: 'viewer' },
      ])
      .execute();
  });

  afterEach(() => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    sockets.length = 0;
  });

  // VAL-RT-023
  describe('handshake JWT validation', () => {
    it('rejects a connection with no auth token (connect_error, never connected)', async () => {
      const socket = open();
      await expect(waitConnect(socket)).rejects.toBeDefined();
      expect(socket.connected).toBe(false);
    });

    it('rejects a connection with an invalid token (connect_error, never connected)', async () => {
      const socket = open('not.a.valid.jwt');
      await expect(waitConnect(socket)).rejects.toBeDefined();
      expect(socket.connected).toBe(false);
    });

    it('accepts a connection with a valid JWT', async () => {
      const socket = open(ownerToken);
      await expect(waitConnect(socket)).resolves.toBeUndefined();
      expect(socket.connected).toBe(true);
    });
  });

  describe('board:join membership', () => {
    it('accepts a member and replies with presence:sync including the member', async () => {
      const socket = open(ownerToken);
      await waitConnect(socket);
      const sync = waitFor<PresenceSyncPayload>(socket, 'presence:sync');
      socket.emit('board:join', { boardId });
      const payload = await sync;
      expect(payload.boardId).toBe(boardId);
      expect(payload.members.map((m) => m.userId)).toContain(ownerId);
    });

    // VAL-RT-024
    it('rejects a non-member with an error, no presence:sync, and no live updates', async () => {
      const owner = await joined(ownerToken);

      const stranger = open(strangerToken);
      await waitConnect(stranger);

      let gotSync = false;
      stranger.on('presence:sync', () => {
        gotSync = true;
      });
      let gotColumn = false;
      stranger.on('column:created', () => {
        gotColumn = true;
      });

      const err = waitFor<ErrorPayload>(stranger, 'error');
      stranger.emit('board:join', { boardId });
      const e = await err;
      expect(e.code).toBe('FORBIDDEN');
      expect(e.event).toBe('board:join');

      owner.emit('column:create', {
        boardId,
        column: { id: randomUUID(), title: 'Secret' },
      });
      await delay(400);
      expect(gotSync).toBe(false);
      expect(gotColumn).toBe(false);
    });

    it('notifies existing members when another member joins (presence:joined)', async () => {
      const owner = await joined(ownerToken);
      const joinedEvt = waitFor<PresenceEventPayload>(owner, 'presence:joined');
      await joined(editorToken);
      const evt = await joinedEvt;
      expect(evt.member.userId).toBe(editorId);
      expect(evt.member.color).toBe(colorForUser(editorId));
    });
  });

  describe('entity operations persist and broadcast', () => {
    it('persists an owner column:create and broadcasts column:created to the room', async () => {
      const owner = await joined(ownerToken);
      const editor = await joined(editorToken);

      const created = waitFor<ColumnEventPayload>(editor, 'column:created');
      const colId = randomUUID();
      owner.emit('column:create', {
        boardId,
        column: { id: colId, title: 'Stage' },
      });
      const evt = await created;
      expect(evt.boardId).toBe(boardId);
      expect(evt.column).toMatchObject({
        id: colId,
        title: 'Stage',
        position: 0,
      });

      const rows = await db
        .selectFrom('columns')
        .selectAll()
        .where('board_id', '=', boardId)
        .execute();
      expect(rows.map((r) => r.id)).toEqual([colId]);
    });

    // VAL-RT-020 (server portion)
    it('rejects a viewer op with FORBIDDEN, persisting and broadcasting nothing', async () => {
      const owner = await joined(ownerToken);
      const viewer = await joined(viewerToken);

      let broadcastReceived = false;
      owner.on('column:created', () => {
        broadcastReceived = true;
      });

      const err = waitFor<ErrorPayload>(viewer, 'error');
      viewer.emit('column:create', {
        boardId,
        column: { id: randomUUID(), title: 'Nope' },
      });
      const e = await err;
      expect(e.code).toBe('FORBIDDEN');
      expect(e.event).toBe('column:create');

      await delay(400);
      expect(broadcastReceived).toBe(false);
      const rows = await db
        .selectFrom('columns')
        .selectAll()
        .where('board_id', '=', boardId)
        .execute();
      expect(rows).toHaveLength(0);
    });
  });

  // VAL-RT-017/018/025 (server portion)
  describe('cursor:move', () => {
    it('broadcasts cursor:moved to others (not self) and never persists', async () => {
      const owner = await joined(ownerToken);
      const editor = await joined(editorToken);

      let selfReceived = false;
      owner.on('cursor:moved', () => {
        selfReceived = true;
      });
      const moved = waitFor<CursorMovedPayload>(editor, 'cursor:moved');
      owner.emit('cursor:move', { boardId, x: 0.5, y: 0.25 });
      const evt = await moved;
      expect(evt).toMatchObject({ userId: ownerId, x: 0.5, y: 0.25 });
      expect(evt.color).toBe(colorForUser(ownerId));

      await delay(200);
      expect(selfReceived).toBe(false);

      const cols = await db
        .selectFrom('columns')
        .selectAll()
        .where('board_id', '=', boardId)
        .execute();
      const tasks = await db
        .selectFrom('tasks')
        .selectAll()
        .where('board_id', '=', boardId)
        .execute();
      expect(cols).toHaveLength(0);
      expect(tasks).toHaveLength(0);
    });
  });

  // VAL-RT-025
  describe('deterministic per-user color', () => {
    it('keeps the same color across reconnects and differs between users', async () => {
      const owner = await joined(ownerToken);

      const firstJoin = waitFor<PresenceEventPayload>(owner, 'presence:joined');
      const editor = await joined(editorToken);
      const first = await firstJoin;
      const editorColor = first.member.color;
      expect(editorColor).toBe(colorForUser(editorId));

      editor.disconnect();
      await delay(150);

      const secondJoin = waitFor<PresenceEventPayload>(
        owner,
        'presence:joined',
      );
      await joined(editorToken);
      const second = await secondJoin;
      expect(second.member.color).toBe(editorColor);
      expect(colorForUser(ownerId)).not.toBe(editorColor);
    });
  });

  // VAL-CROSS-011
  describe('REST mutations broadcast to the room', () => {
    it('broadcasts participant:added to a connected collaborator after a REST add', async () => {
      const owner = await joined(ownerToken);
      const added = waitFor<ParticipantEventPayload>(
        owner,
        'participant:added',
      );
      await request(httpServer)
        .post(`/api/boards/${boardId}/participants`)
        .set('Authorization', bearer(ownerToken))
        .send({ name: 'Zoe' })
        .expect(201);
      const evt = await added;
      expect(evt.boardId).toBe(boardId);
      expect(evt.name).toBe('Zoe');
    });
  });

  // VAL-RT-016/019 (server portion)
  describe('presence:left on disconnect', () => {
    it('notifies the room when a member disconnects', async () => {
      const owner = await joined(ownerToken);
      const editor = await joined(editorToken);

      const left = waitFor<PresenceEventPayload>(owner, 'presence:left');
      editor.disconnect();
      const evt = await left;
      expect(evt.member.userId).toBe(editorId);
    });
  });
});

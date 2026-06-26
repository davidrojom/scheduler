import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  DefaultEventsMap,
  ExtendedError,
  Namespace,
  Server,
  Socket,
} from 'socket.io';
import { JwtPayload } from '../auth/auth.types';
import { BoardsService } from '../boards/boards.service';
import { ColumnsService } from '../boards/content/columns.service';
import { ParticipantsService } from '../boards/content/participants.service';
import { TasksService } from '../boards/content/tasks.service';
import { UsersService } from '../users/users.service';
import { colorForUser } from './presence-color';
import { boardRoom, RealtimeBroadcaster } from './realtime-broadcaster';
import {
  BoardUpdatePayload,
  ColumnCreatePayload,
  ColumnDeletePayload,
  ColumnReorderPayload,
  ColumnUpdatePayload,
  CursorMovePayload,
  JoinPayload,
  ParticipantPayload,
  PresenceMember,
  SocketUserData,
  TaskCreatePayload,
  TaskDeletePayload,
  TaskUpdatePayload,
} from './collaboration.types';

type CollabServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketUserData
>;
type CollabNamespace = Namespace<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketUserData
>;
type CollabSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketUserData
>;

@WebSocketGateway({
  namespace: '/collab',
  cors: { origin: true, credentials: true },
})
export class CollaborationGateway
  implements OnGatewayInit, OnGatewayDisconnect
{
  private io!: CollabNamespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly boards: BoardsService,
    private readonly columns: ColumnsService,
    private readonly tasks: TasksService,
    private readonly participants: ParticipantsService,
    private readonly realtime: RealtimeBroadcaster,
  ) {}

  afterInit(server: CollabServer | CollabNamespace): void {
    this.io = server instanceof Namespace ? server : server.of('/collab');
    this.realtime.setNamespace(this.io);
    this.io.use((socket, next) => {
      void this.authenticate(socket)
        .then(() => next())
        .catch((err: ExtendedError) => next(err));
    });
  }

  async handleDisconnect(
    @ConnectedSocket() client: CollabSocket,
  ): Promise<void> {
    const data = client.data;
    if (!data?.boards) {
      return;
    }
    for (const boardId of [...data.boards]) {
      await this.notifyLeftIfGone(boardId, data);
    }
  }

  @SubscribeMessage('board:join')
  async handleJoin(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: JoinPayload,
  ): Promise<void> {
    const data = client.data;
    const boardId = payload?.boardId;
    if (!boardId) {
      this.emitError(client, 'BAD_REQUEST', 'board:join');
      return;
    }
    const role = await this.boards.getMemberRole(boardId, data.userId);
    if (!role) {
      this.emitError(
        client,
        'FORBIDDEN',
        'board:join',
        'Not a member of this board',
      );
      return;
    }
    const room = boardRoom(boardId);
    await client.join(room);
    data.boards.add(boardId);
    const members = await this.presentMembers(room);
    client.emit('presence:sync', { boardId, members });
    client.to(room).emit('presence:joined', {
      boardId,
      member: memberOf(data),
    });
  }

  @SubscribeMessage('board:leave')
  async handleLeave(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: JoinPayload,
  ): Promise<void> {
    const boardId = payload?.boardId;
    if (!boardId) {
      return;
    }
    const room = boardRoom(boardId);
    await client.leave(room);
    client.data.boards.delete(boardId);
    await this.notifyLeftIfGone(boardId, client.data);
  }

  @SubscribeMessage('cursor:move')
  handleCursorMove(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: CursorMovePayload,
  ): void {
    const boardId = payload?.boardId;
    if (!boardId) {
      return;
    }
    const room = boardRoom(boardId);
    if (!client.rooms.has(room)) {
      return;
    }
    const data = client.data;
    client.to(room).emit('cursor:moved', {
      boardId,
      userId: data.userId,
      name: data.name,
      color: data.color,
      x: payload.x,
      y: payload.y,
    });
  }

  @SubscribeMessage('column:create')
  async onColumnCreate(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: ColumnCreatePayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'column:create', () =>
      this.columns.create(payload.boardId, payload.column),
    );
  }

  @SubscribeMessage('column:update')
  async onColumnUpdate(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: ColumnUpdatePayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'column:update', () =>
      this.columns.update(payload.boardId, payload.columnId, payload.changes),
    );
  }

  @SubscribeMessage('column:delete')
  async onColumnDelete(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: ColumnDeletePayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'column:delete', () =>
      this.columns.remove(payload.boardId, payload.columnId),
    );
  }

  @SubscribeMessage('column:reorder')
  async onColumnReorder(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: ColumnReorderPayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'column:reorder', () =>
      this.columns.reorder(payload.boardId, payload.orderedIds),
    );
  }

  @SubscribeMessage('task:create')
  async onTaskCreate(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: TaskCreatePayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'task:create', () =>
      this.tasks.create(payload.boardId, payload.task),
    );
  }

  @SubscribeMessage('task:update')
  async onTaskUpdate(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: TaskUpdatePayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'task:update', () =>
      this.tasks.update(payload.boardId, payload.taskId, payload.changes),
    );
  }

  @SubscribeMessage('task:delete')
  async onTaskDelete(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: TaskDeletePayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'task:delete', () =>
      this.tasks.remove(payload.boardId, payload.taskId),
    );
  }

  @SubscribeMessage('participant:add')
  async onParticipantAdd(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: ParticipantPayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'participant:add', () =>
      this.participants.add(payload.boardId, payload.name),
    );
  }

  @SubscribeMessage('participant:remove')
  async onParticipantRemove(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: ParticipantPayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'participant:remove', () =>
      this.participants.remove(payload.boardId, payload.name),
    );
  }

  @SubscribeMessage('board:update')
  async onBoardUpdate(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() payload: BoardUpdatePayload,
  ): Promise<void> {
    await this.withEditor(client, payload?.boardId, 'board:update', () =>
      this.boards.update(payload.boardId, payload.changes),
    );
  }

  private async authenticate(socket: CollabSocket): Promise<void> {
    const token = extractToken(socket);
    if (!token) {
      throw new Error('Missing authentication token');
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new Error('Invalid authentication token');
    }
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new Error('Unknown user');
    }
    socket.data = {
      userId: user.id,
      name: user.name ?? user.email,
      color: colorForUser(user.id),
      boards: new Set<string>(),
    };
  }

  private async withEditor(
    client: CollabSocket,
    boardId: string | undefined,
    event: string,
    action: () => Promise<unknown>,
  ): Promise<void> {
    if (!boardId) {
      this.emitError(client, 'BAD_REQUEST', event);
      return;
    }
    const role = await this.boards.getMemberRole(boardId, client.data.userId);
    if (!role || role === 'viewer') {
      this.emitError(client, 'FORBIDDEN', event);
      return;
    }
    try {
      await action();
    } catch (err) {
      this.emitError(
        client,
        'OP_FAILED',
        event,
        err instanceof Error ? err.message : undefined,
      );
    }
  }

  private async presentMembers(room: string): Promise<PresenceMember[]> {
    const sockets = await this.io.in(room).fetchSockets();
    const byUser = new Map<string, PresenceMember>();
    for (const s of sockets) {
      const d = s.data;
      if (d?.userId) {
        byUser.set(d.userId, memberOf(d));
      }
    }
    return [...byUser.values()];
  }

  private async notifyLeftIfGone(
    boardId: string,
    data: SocketUserData,
  ): Promise<void> {
    const room = boardRoom(boardId);
    const sockets = await this.io.in(room).fetchSockets();
    const stillPresent = sockets.some((s) => s.data?.userId === data.userId);
    if (!stillPresent) {
      this.io.to(room).emit('presence:left', {
        boardId,
        member: memberOf(data),
      });
    }
  }

  private emitError(
    client: CollabSocket,
    code: string,
    event: string,
    message?: string,
  ): void {
    client.emit('error', { code, event, message });
  }
}

function memberOf(data: SocketUserData): PresenceMember {
  return { userId: data.userId, name: data.name, color: data.color };
}

function extractToken(socket: CollabSocket): string | null {
  const auth = socket.handshake.auth as { token?: unknown };
  if (typeof auth?.token === 'string' && auth.token.length > 0) {
    return auth.token;
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return null;
}

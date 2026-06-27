import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Transaction } from 'kysely';
import { RealtimeBroadcaster } from '../collaboration/realtime-broadcaster';
import { Database, KYSELY } from '../database/database.module';
import { Board, BoardRole, DB } from '../database/database.types';
import {
  BoardDetailDto,
  BoardDto,
  BoardMemberDto,
  BoardSummaryDto,
  CreatedBoardDto,
} from './boards.types';
import { CreateBoardDto } from './dto/create-board.dto';
import { ImportBoardEntryDto, ImportBoardsDto } from './dto/import-boards.dto';
import { UpdateBoardDto } from './dto/update-board.dto';

@Injectable()
export class BoardsService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Optional() private readonly realtime?: RealtimeBroadcaster,
  ) {}

  async getMemberRole(
    boardId: string,
    userId: string,
  ): Promise<BoardRole | null> {
    if (!isUUID(boardId)) {
      return null;
    }
    const row = await this.db
      .selectFrom('board_members')
      .select('role')
      .where('board_id', '=', boardId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.role ?? null;
  }

  async listForUser(userId: string): Promise<BoardSummaryDto[]> {
    const rows = await this.db
      .selectFrom('boards')
      .innerJoin('board_members', 'board_members.board_id', 'boards.id')
      .where('board_members.user_id', '=', userId)
      .select([
        'boards.id as id',
        'boards.name as name',
        'boards.config as config',
        'boards.updated_at as updated_at',
        'board_members.role as role',
      ])
      .orderBy('boards.updated_at', 'desc')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      myRole: r.role,
      config: r.config,
      updatedAt: r.updated_at,
    }));
  }

  async create(userId: string, dto: CreateBoardDto): Promise<CreatedBoardDto> {
    const board = await this.db.transaction().execute((trx) =>
      this.insertBoardWithOwner(trx, userId, {
        id: dto.id,
        name: dto.name,
        config: dto.config,
      }),
    );
    return { ...mapBoard(board), myRole: 'owner' };
  }

  async getDetail(boardId: string, myRole: BoardRole): Promise<BoardDetailDto> {
    const board = await this.db
      .selectFrom('boards')
      .selectAll()
      .where('id', '=', boardId)
      .executeTakeFirstOrThrow();

    const members = await this.fetchMembers(boardId);

    const columnRows = await this.db
      .selectFrom('columns')
      .selectAll()
      .where('board_id', '=', boardId)
      .orderBy('position', 'asc')
      .orderBy('created_at', 'asc')
      .execute();

    const taskRows = await this.db
      .selectFrom('tasks')
      .selectAll()
      .where('board_id', '=', boardId)
      .orderBy('position', 'asc')
      .orderBy('created_at', 'asc')
      .execute();

    const participantRows = await this.db
      .selectFrom('participants')
      .select(['name'])
      .where('board_id', '=', boardId)
      .orderBy('created_at', 'asc')
      .orderBy('name', 'asc')
      .execute();

    return {
      board: mapBoard(board),
      myRole,
      members,
      columns: columnRows.map((c) => ({
        id: c.id,
        title: c.title,
        position: c.position,
      })),
      tasks: taskRows.map((t) => ({
        id: t.id,
        columnId: t.column_id,
        title: t.title,
        startHour: t.start_hour,
        endHour: t.end_hour,
        participants: t.participants,
        position: t.position,
      })),
      participants: participantRows.map((p) => p.name),
    };
  }

  /** Lists a board's collaborators (owner included). Used by the members modal,
   * kept separate from `getDetail` so it never pulls the full board content. */
  getMembers(boardId: string): Promise<BoardMemberDto[]> {
    return this.fetchMembers(boardId);
  }

  private async fetchMembers(boardId: string): Promise<BoardMemberDto[]> {
    const rows = await this.db
      .selectFrom('board_members')
      .innerJoin('users', 'users.id', 'board_members.user_id')
      .where('board_members.board_id', '=', boardId)
      .select([
        'users.id as user_id',
        'users.name as name',
        'users.email as email',
        'users.avatar_url as avatar_url',
        'board_members.role as role',
      ])
      .orderBy('board_members.created_at', 'asc')
      .execute();

    return rows.map((m) => ({
      userId: m.user_id,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatar_url,
      role: m.role,
    }));
  }

  async update(boardId: string, dto: UpdateBoardDto): Promise<BoardDto> {
    const board = await this.db
      .updateTable('boards')
      .set({
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.config !== undefined
          ? { config: JSON.stringify(dto.config) }
          : {}),
        updated_at: new Date(),
      })
      .where('id', '=', boardId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const mapped = mapBoard(board);
    this.realtime?.emitToBoard(boardId, 'board:updated', {
      boardId,
      board: mapped,
    });
    return mapped;
  }

  async remove(boardId: string): Promise<void> {
    await this.db.deleteFrom('boards').where('id', '=', boardId).execute();
  }

  /**
   * Removes a collaborator from a board (owner-only, enforced at the route).
   * The owner cannot be removed — there is exactly one (invites never grant
   * `owner`), so this also blocks the owner removing themselves. Broadcasts
   * `board:member_removed` so the removed user's client leaves the board and the
   * others refresh their collaborator list.
   */
  async removeMember(boardId: string, targetUserId: string): Promise<void> {
    const member = await this.db
      .selectFrom('board_members')
      .select('role')
      .where('board_id', '=', boardId)
      .where('user_id', '=', targetUserId)
      .executeTakeFirst();

    if (!member) {
      throw new NotFoundException('User is not a member of this board');
    }
    if (member.role === 'owner') {
      throw new ForbiddenException('The board owner cannot be removed');
    }

    await this.db
      .deleteFrom('board_members')
      .where('board_id', '=', boardId)
      .where('user_id', '=', targetUserId)
      .execute();

    this.realtime?.emitToBoard(boardId, 'board:member_removed', {
      boardId,
      userId: targetUserId,
    });
  }

  async importForUser(
    userId: string,
    dto: ImportBoardsDto,
  ): Promise<CreatedBoardDto[]> {
    const created: CreatedBoardDto[] = [];

    for (const entry of dto.boards) {
      const boardId = entry.board.id;
      if (boardId) {
        const existing = await this.db
          .selectFrom('boards')
          .select('id')
          .where('id', '=', boardId)
          .executeTakeFirst();
        if (existing) {
          continue;
        }
      }

      const board = await this.db
        .transaction()
        .execute((trx) => this.insertImportedBoard(trx, userId, entry));

      created.push({ ...mapBoard(board), myRole: 'owner' });
    }

    return created;
  }

  private async insertBoardWithOwner(
    trx: Transaction<DB>,
    userId: string,
    board: { id?: string; name: string; config?: unknown },
  ): Promise<Board> {
    const inserted = await trx
      .insertInto('boards')
      .values({
        ...(board.id ? { id: board.id } : {}),
        owner_id: userId,
        name: board.name,
        config: JSON.stringify(board.config ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('board_members')
      .values({ board_id: inserted.id, user_id: userId, role: 'owner' })
      .execute();

    return inserted;
  }

  private async insertImportedBoard(
    trx: Transaction<DB>,
    userId: string,
    entry: ImportBoardEntryDto,
  ): Promise<Board> {
    const inserted = await this.insertBoardWithOwner(trx, userId, {
      id: entry.board.id,
      name: entry.board.name,
      config: entry.board.config,
    });

    const columns = entry.columns ?? [];
    if (columns.length > 0) {
      await trx
        .insertInto('columns')
        .values(
          columns.map((c, i) => ({
            id: c.id,
            board_id: inserted.id,
            title: c.title,
            position: c.position ?? i,
          })),
        )
        .execute();
    }

    const columnIds = new Set(columns.map((c) => c.id));
    const tasks = (entry.tasks ?? []).filter((t) => columnIds.has(t.columnId));
    if (tasks.length > 0) {
      await trx
        .insertInto('tasks')
        .values(
          tasks.map((t, i) => ({
            id: t.id,
            board_id: inserted.id,
            column_id: t.columnId,
            title: t.title,
            start_hour: t.startHour,
            end_hour: t.endHour,
            participants: t.participants ?? [],
            position: t.position ?? i,
          })),
        )
        .execute();
    }

    const participants = [...new Set(entry.participants ?? [])];
    if (participants.length > 0) {
      await trx
        .insertInto('participants')
        .values(participants.map((name) => ({ board_id: inserted.id, name })))
        .execute();
    }

    return inserted;
  }
}

function mapBoard(row: Board): BoardDto {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    config: row.config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

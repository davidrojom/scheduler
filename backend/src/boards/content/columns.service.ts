import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { sql } from 'kysely';
import { RealtimeBroadcaster } from '../../collaboration/realtime-broadcaster';
import { Database, KYSELY } from '../../database/database.module';
import { Column } from '../../database/database.types';
import { BoardColumnDto } from '../boards.types';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@Injectable()
export class ColumnsService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Optional() private readonly realtime?: RealtimeBroadcaster,
  ) {}

  async list(boardId: string): Promise<BoardColumnDto[]> {
    const rows = await this.db
      .selectFrom('columns')
      .selectAll()
      .where('board_id', '=', boardId)
      .orderBy('position', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(mapColumn);
  }

  async create(boardId: string, dto: CreateColumnDto): Promise<BoardColumnDto> {
    const position = dto.position ?? (await this.nextPosition(boardId));
    const row = await this.db
      .insertInto('columns')
      .values({
        ...(dto.id ? { id: dto.id } : {}),
        board_id: boardId,
        title: dto.title,
        position,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const column = mapColumn(row);
    this.realtime?.emitToBoard(boardId, 'column:created', { boardId, column });
    return column;
  }

  async update(
    boardId: string,
    columnId: string,
    dto: UpdateColumnDto,
  ): Promise<BoardColumnDto> {
    const row = await this.db
      .updateTable('columns')
      .set({
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', columnId)
      .where('board_id', '=', boardId)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundException('Column not found');
    }
    const column = mapColumn(row);
    this.realtime?.emitToBoard(boardId, 'column:updated', { boardId, column });
    return column;
  }

  async remove(boardId: string, columnId: string): Promise<void> {
    const deleted = await this.db
      .deleteFrom('columns')
      .where('id', '=', columnId)
      .where('board_id', '=', boardId)
      .returning('id')
      .executeTakeFirst();
    if (!deleted) {
      throw new NotFoundException('Column not found');
    }
    this.realtime?.emitToBoard(boardId, 'column:deleted', {
      boardId,
      columnId,
    });
  }

  async reorder(
    boardId: string,
    orderedIds: string[],
  ): Promise<BoardColumnDto[]> {
    await this.db.transaction().execute(async (trx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await trx
          .updateTable('columns')
          .set({ position: i, updated_at: new Date() })
          .where('id', '=', orderedIds[i])
          .where('board_id', '=', boardId)
          .execute();
      }
    });
    const columns = await this.list(boardId);
    this.realtime?.emitToBoard(boardId, 'column:reordered', {
      boardId,
      columns,
    });
    return columns;
  }

  private async nextPosition(boardId: string): Promise<number> {
    const row = await this.db
      .selectFrom('columns')
      .select(sql<number>`coalesce(max(position), -1)`.as('maxPosition'))
      .where('board_id', '=', boardId)
      .executeTakeFirst();
    return (row?.maxPosition ?? -1) + 1;
  }
}

function mapColumn(row: Column): BoardColumnDto {
  return { id: row.id, title: row.title, position: row.position };
}

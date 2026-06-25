import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { Database, KYSELY } from '../../database/database.module';
import { Column } from '../../database/database.types';
import { BoardColumnDto } from '../boards.types';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@Injectable()
export class ColumnsService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

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
    return mapColumn(row);
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
    return mapColumn(row);
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
    return this.list(boardId);
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

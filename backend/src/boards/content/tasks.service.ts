import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { sql } from 'kysely';
import { RealtimeBroadcaster } from '../../collaboration/realtime-broadcaster';
import { Database, KYSELY } from '../../database/database.module';
import { Task } from '../../database/database.types';
import { BoardTaskDto } from '../boards.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Optional() private readonly realtime?: RealtimeBroadcaster,
  ) {}

  async create(boardId: string, dto: CreateTaskDto): Promise<BoardTaskDto> {
    await this.assertColumnInBoard(boardId, dto.columnId);
    const position = dto.position ?? (await this.nextPosition(boardId));
    const row = await this.db
      .insertInto('tasks')
      .values({
        ...(dto.id ? { id: dto.id } : {}),
        board_id: boardId,
        column_id: dto.columnId,
        title: dto.title,
        start_hour: dto.startHour,
        end_hour: dto.endHour,
        participants: dto.participants ?? [],
        position,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const task = mapTask(row);
    this.realtime?.emitToBoard(boardId, 'task:created', { boardId, task });
    return task;
  }

  async update(
    boardId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<BoardTaskDto> {
    if (dto.columnId !== undefined) {
      await this.assertColumnInBoard(boardId, dto.columnId);
    }
    const row = await this.db
      .updateTable('tasks')
      .set({
        ...(dto.columnId !== undefined ? { column_id: dto.columnId } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.startHour !== undefined ? { start_hour: dto.startHour } : {}),
        ...(dto.endHour !== undefined ? { end_hour: dto.endHour } : {}),
        ...(dto.participants !== undefined
          ? { participants: dto.participants }
          : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', taskId)
      .where('board_id', '=', boardId)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    const task = mapTask(row);
    this.realtime?.emitToBoard(boardId, 'task:updated', { boardId, task });
    return task;
  }

  async remove(boardId: string, taskId: string): Promise<void> {
    const deleted = await this.db
      .deleteFrom('tasks')
      .where('id', '=', taskId)
      .where('board_id', '=', boardId)
      .returning('id')
      .executeTakeFirst();
    if (!deleted) {
      throw new NotFoundException('Task not found');
    }
    this.realtime?.emitToBoard(boardId, 'task:deleted', { boardId, taskId });
  }

  private async assertColumnInBoard(
    boardId: string,
    columnId: string,
  ): Promise<void> {
    const column = await this.db
      .selectFrom('columns')
      .select('id')
      .where('id', '=', columnId)
      .where('board_id', '=', boardId)
      .executeTakeFirst();
    if (!column) {
      throw new NotFoundException('Column not found');
    }
  }

  private async nextPosition(boardId: string): Promise<number> {
    const row = await this.db
      .selectFrom('tasks')
      .select(sql<number>`coalesce(max(position), -1)`.as('maxPosition'))
      .where('board_id', '=', boardId)
      .executeTakeFirst();
    return (row?.maxPosition ?? -1) + 1;
  }
}

function mapTask(row: Task): BoardTaskDto {
  return {
    id: row.id,
    columnId: row.column_id,
    title: row.title,
    startHour: row.start_hour,
    endHour: row.end_hour,
    participants: row.participants,
    position: row.position,
  };
}

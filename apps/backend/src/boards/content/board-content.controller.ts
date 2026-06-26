import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BoardColumnDto, BoardTaskDto } from '../boards.types';
import { BoardRoles } from '../decorators/board-roles.decorator';
import { BoardRoleGuard } from '../guards/board-role.guard';
import { ColumnsService } from './columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ParticipantDto } from './dto/participant.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  ParticipantResultDto,
  ParticipantsService,
} from './participants.service';
import { TasksService } from './tasks.service';

@Controller('boards')
@UseGuards(JwtAuthGuard, BoardRoleGuard)
@BoardRoles('owner', 'editor')
export class BoardContentController {
  constructor(
    private readonly columns: ColumnsService,
    private readonly tasks: TasksService,
    private readonly participants: ParticipantsService,
  ) {}

  @Post(':id/columns')
  createColumn(
    @Param('id') boardId: string,
    @Body() dto: CreateColumnDto,
  ): Promise<BoardColumnDto> {
    return this.columns.create(boardId, dto);
  }

  @Patch(':id/columns/reorder')
  reorderColumns(
    @Param('id') boardId: string,
    @Body() dto: ReorderColumnsDto,
  ): Promise<BoardColumnDto[]> {
    return this.columns.reorder(boardId, dto.orderedIds);
  }

  @Patch(':id/columns/:columnId')
  updateColumn(
    @Param('id') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
  ): Promise<BoardColumnDto> {
    return this.columns.update(boardId, columnId, dto);
  }

  @Delete(':id/columns/:columnId')
  @HttpCode(200)
  async deleteColumn(
    @Param('id') boardId: string,
    @Param('columnId') columnId: string,
  ): Promise<{ success: true }> {
    await this.columns.remove(boardId, columnId);
    return { success: true };
  }

  @Post(':id/tasks')
  createTask(
    @Param('id') boardId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<BoardTaskDto> {
    return this.tasks.create(boardId, dto);
  }

  @Patch(':id/tasks/:taskId')
  updateTask(
    @Param('id') boardId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<BoardTaskDto> {
    return this.tasks.update(boardId, taskId, dto);
  }

  @Delete(':id/tasks/:taskId')
  @HttpCode(200)
  async deleteTask(
    @Param('id') boardId: string,
    @Param('taskId') taskId: string,
  ): Promise<{ success: true }> {
    await this.tasks.remove(boardId, taskId);
    return { success: true };
  }

  @Post(':id/participants')
  addParticipant(
    @Param('id') boardId: string,
    @Body() dto: ParticipantDto,
  ): Promise<ParticipantResultDto> {
    return this.participants.add(boardId, dto.name);
  }

  @Delete(':id/participants')
  @HttpCode(200)
  async removeParticipant(
    @Param('id') boardId: string,
    @Body() dto: ParticipantDto,
  ): Promise<{ success: true }> {
    await this.participants.remove(boardId, dto.name);
    return { success: true };
  }
}

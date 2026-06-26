import { CreateColumnDto } from '../boards/content/dto/create-column.dto';
import { CreateTaskDto } from '../boards/content/dto/create-task.dto';
import { UpdateColumnDto } from '../boards/content/dto/update-column.dto';
import { UpdateTaskDto } from '../boards/content/dto/update-task.dto';
import { UpdateBoardDto } from '../boards/dto/update-board.dto';

export interface SocketUserData {
  userId: string;
  name: string;
  color: string;
  boards: Set<string>;
}

export interface PresenceMember {
  userId: string;
  name: string;
  color: string;
}

export interface JoinPayload {
  boardId: string;
}

export interface CursorMovePayload {
  boardId: string;
  x: number;
  y: number;
}

export interface ColumnCreatePayload {
  boardId: string;
  column: CreateColumnDto;
}

export interface ColumnUpdatePayload {
  boardId: string;
  columnId: string;
  changes: UpdateColumnDto;
}

export interface ColumnDeletePayload {
  boardId: string;
  columnId: string;
}

export interface ColumnReorderPayload {
  boardId: string;
  orderedIds: string[];
}

export interface TaskCreatePayload {
  boardId: string;
  task: CreateTaskDto;
}

export interface TaskUpdatePayload {
  boardId: string;
  taskId: string;
  changes: UpdateTaskDto;
}

export interface TaskDeletePayload {
  boardId: string;
  taskId: string;
}

export interface ParticipantPayload {
  boardId: string;
  name: string;
}

export interface BoardUpdatePayload {
  boardId: string;
  changes: UpdateBoardDto;
}

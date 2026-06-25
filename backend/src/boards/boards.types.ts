import { BoardConfig, BoardRole } from '../database/database.types';

export interface BoardDto {
  id: string;
  name: string;
  ownerId: string;
  config: BoardConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatedBoardDto extends BoardDto {
  myRole: BoardRole;
}

export interface BoardSummaryDto {
  id: string;
  name: string;
  myRole: BoardRole;
  config: BoardConfig;
  updatedAt: Date;
}

export interface BoardMemberDto {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: BoardRole;
}

export interface BoardColumnDto {
  id: string;
  title: string;
  position: number;
}

export interface BoardTaskDto {
  id: string;
  columnId: string;
  title: string;
  startHour: string;
  endHour: string;
  participants: string[];
  position: number;
}

export interface BoardDetailDto {
  board: BoardDto;
  myRole: BoardRole;
  members: BoardMemberDto[];
  columns: BoardColumnDto[];
  tasks: BoardTaskDto[];
  participants: string[];
}

export interface ImportResultDto {
  boards: CreatedBoardDto[];
}

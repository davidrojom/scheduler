import {
  ColumnType,
  Generated,
  GeneratedAlways,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from 'kysely';

export type BoardRole = 'owner' | 'editor' | 'viewer';
export type InviteRole = 'editor' | 'viewer';

export interface BoardConfig {
  dayStartHour: number;
  dayEndHour: number;
  segmentsByHour: number;
  logo?: string;
}

export interface UsersTable {
  id: Generated<string>;
  google_id: string | null;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: GeneratedAlways<Date>;
  updated_at: Generated<Date>;
}

export interface BoardsTable {
  id: Generated<string>;
  owner_id: string;
  name: string;
  config: JSONColumnType<BoardConfig>;
  created_at: GeneratedAlways<Date>;
  updated_at: Generated<Date>;
}

export interface BoardMembersTable {
  board_id: string;
  user_id: string;
  role: BoardRole;
  created_at: GeneratedAlways<Date>;
}

export interface BoardInvitesTable {
  id: Generated<string>;
  board_id: string;
  token: string;
  role: InviteRole;
  created_by: string;
  created_at: GeneratedAlways<Date>;
  expires_at: Date | null;
  revoked: Generated<boolean>;
}

export interface ColumnsTable {
  id: Generated<string>;
  board_id: string;
  title: string;
  position: Generated<number>;
  created_at: GeneratedAlways<Date>;
  updated_at: Generated<Date>;
}

export interface TasksTable {
  id: Generated<string>;
  board_id: string;
  column_id: string;
  title: string;
  start_hour: string;
  end_hour: string;
  participants: ColumnType<string[], string[] | undefined, string[]>;
  position: Generated<number>;
  created_at: GeneratedAlways<Date>;
  updated_at: Generated<Date>;
}

export interface ParticipantsTable {
  id: Generated<string>;
  board_id: string;
  name: string;
  created_at: GeneratedAlways<Date>;
}

export interface DB {
  users: UsersTable;
  boards: BoardsTable;
  board_members: BoardMembersTable;
  board_invites: BoardInvitesTable;
  columns: ColumnsTable;
  tasks: TasksTable;
  participants: ParticipantsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Board = Selectable<BoardsTable>;
export type NewBoard = Insertable<BoardsTable>;
export type BoardUpdate = Updateable<BoardsTable>;

export type BoardMember = Selectable<BoardMembersTable>;
export type NewBoardMember = Insertable<BoardMembersTable>;
export type BoardMemberUpdate = Updateable<BoardMembersTable>;

export type BoardInvite = Selectable<BoardInvitesTable>;
export type NewBoardInvite = Insertable<BoardInvitesTable>;
export type BoardInviteUpdate = Updateable<BoardInvitesTable>;

export type Column = Selectable<ColumnsTable>;
export type NewColumn = Insertable<ColumnsTable>;
export type ColumnUpdate = Updateable<ColumnsTable>;

export type Task = Selectable<TasksTable>;
export type NewTask = Insertable<TasksTable>;
export type TaskUpdate = Updateable<TasksTable>;

export type Participant = Selectable<ParticipantsTable>;
export type NewParticipant = Insertable<ParticipantsTable>;
export type ParticipantUpdate = Updateable<ParticipantsTable>;

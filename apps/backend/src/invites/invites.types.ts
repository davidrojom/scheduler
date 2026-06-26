import { InviteRole } from '../database/database.types';

export interface CreatedInviteDto {
  id: string;
  token: string;
  role: InviteRole;
  url: string;
}

export interface InviteInfoDto {
  boardId: string | null;
  boardName: string | null;
  role: InviteRole | null;
  valid: boolean;
}

export interface AcceptInviteDto {
  boardId: string;
}

import { IsIn } from 'class-validator';
import { BoardRole } from '../../database/database.types';

const ROLES: BoardRole[] = ['owner', 'editor', 'viewer'];

export class UpdateMemberRoleDto {
  @IsIn(ROLES)
  role!: BoardRole;
}

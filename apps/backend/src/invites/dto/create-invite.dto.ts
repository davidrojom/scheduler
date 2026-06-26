import { IsIn } from 'class-validator';
import { InviteRole } from '../../database/database.types';

export class CreateInviteDto {
  @IsIn(['editor', 'viewer'])
  role!: InviteRole;
}

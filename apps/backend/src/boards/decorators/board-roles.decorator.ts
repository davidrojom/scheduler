import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { BoardRole } from '../../database/database.types';

export const BOARD_ROLES_KEY = 'boardRoles';

export const BoardRoles = (...roles: BoardRole[]) =>
  SetMetadata(BOARD_ROLES_KEY, roles);

export const MemberRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BoardRole => {
    const request = ctx.switchToHttp().getRequest<{ boardRole: BoardRole }>();
    return request.boardRole;
  },
);

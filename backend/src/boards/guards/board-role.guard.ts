import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BoardRole } from '../../database/database.types';
import { UserDto } from '../../users/users.types';
import { BoardsService } from '../boards.service';
import { BOARD_ROLES_KEY } from '../decorators/board-roles.decorator';

interface BoardRequest {
  user?: UserDto;
  params: { id: string };
  boardRole?: BoardRole;
}

const ALL_ROLES: BoardRole[] = ['owner', 'editor', 'viewer'];

@Injectable()
export class BoardRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly boards: BoardsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<BoardRole[]>(BOARD_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? ALL_ROLES;

    const request = context.switchToHttp().getRequest<BoardRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException();
    }

    const role = await this.boards.getMemberRole(request.params.id, user.id);
    if (!role) {
      throw new NotFoundException();
    }
    if (!required.includes(role)) {
      throw new ForbiddenException();
    }

    request.boardRole = role;
    return true;
  }
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDto } from '../../users/users.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDto => {
    const request = ctx.switchToHttp().getRequest<{ user: UserDto }>();
    return request.user;
  },
);

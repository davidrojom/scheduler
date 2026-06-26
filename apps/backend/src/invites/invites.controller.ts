import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserDto } from '../users/users.types';
import { InvitesService } from './invites.service';
import { AcceptInviteDto, InviteInfoDto } from './invites.types';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get(':token')
  getInfo(@Param('token') token: string): Promise<InviteInfoDto> {
    return this.invites.getInfo(token);
  }

  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  accept(
    @Param('token') token: string,
    @CurrentUser() user: UserDto,
  ): Promise<AcceptInviteDto> {
    return this.invites.accept(token, user.id);
  }
}

import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BoardRoles } from '../boards/decorators/board-roles.decorator';
import { BoardRoleGuard } from '../boards/guards/board-role.guard';
import { UserDto } from '../users/users.types';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InvitesService } from './invites.service';
import { CreatedInviteDto } from './invites.types';

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post(':id/invites')
  @BoardRoles('owner', 'editor')
  @UseGuards(BoardRoleGuard)
  create(
    @Param('id') boardId: string,
    @CurrentUser() user: UserDto,
    @Body() dto: CreateInviteDto,
  ): Promise<CreatedInviteDto> {
    return this.invites.create(boardId, user.id, dto.role);
  }

  @Delete(':id/invites/:inviteId')
  @BoardRoles('owner')
  @UseGuards(BoardRoleGuard)
  @HttpCode(200)
  async revoke(
    @Param('id') boardId: string,
    @Param('inviteId') inviteId: string,
  ): Promise<{ success: true }> {
    await this.invites.revoke(boardId, inviteId);
    return { success: true };
  }
}

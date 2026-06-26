import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardsModule } from '../boards/boards.module';
import { BoardRoleGuard } from '../boards/guards/board-role.guard';
import { BoardInvitesController } from './board-invites.controller';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [AuthModule, BoardsModule],
  controllers: [BoardInvitesController, InvitesController],
  providers: [InvitesService, BoardRoleGuard],
  exports: [InvitesService],
})
export class InvitesModule {}

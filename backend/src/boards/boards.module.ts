import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardRoleGuard } from './guards/board-role.guard';

@Module({
  imports: [AuthModule],
  controllers: [BoardsController],
  providers: [BoardsService, BoardRoleGuard],
  exports: [BoardsService],
})
export class BoardsModule {}

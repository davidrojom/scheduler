import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardContentController } from './content/board-content.controller';
import { ColumnsService } from './content/columns.service';
import { ParticipantsService } from './content/participants.service';
import { TasksService } from './content/tasks.service';
import { BoardRoleGuard } from './guards/board-role.guard';

@Module({
  imports: [AuthModule],
  controllers: [BoardsController, BoardContentController],
  providers: [
    BoardsService,
    BoardRoleGuard,
    ColumnsService,
    TasksService,
    ParticipantsService,
  ],
  exports: [BoardsService, ColumnsService, TasksService, ParticipantsService],
})
export class BoardsModule {}

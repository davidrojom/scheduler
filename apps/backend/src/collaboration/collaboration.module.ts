import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardsModule } from '../boards/boards.module';
import { UsersModule } from '../users/users.module';
import { CollaborationGateway } from './collaboration.gateway';

@Module({
  imports: [AuthModule, BoardsModule, UsersModule],
  providers: [CollaborationGateway],
})
export class CollaborationModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { RealtimeModule } from './collaboration/realtime.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { InvitesModule } from './invites/invites.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    RealtimeModule,
    UsersModule,
    AuthModule,
    BoardsModule,
    InvitesModule,
    CollaborationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

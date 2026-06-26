import { Global, Module } from '@nestjs/common';
import { RealtimeBroadcaster } from './realtime-broadcaster';

@Global()
@Module({
  providers: [RealtimeBroadcaster],
  exports: [RealtimeBroadcaster],
})
export class RealtimeModule {}

import { Inject, Injectable, Optional } from '@nestjs/common';
import { RealtimeBroadcaster } from '../../collaboration/realtime-broadcaster';
import { Database, KYSELY } from '../../database/database.module';

export interface ParticipantResultDto {
  name: string;
}

@Injectable()
export class ParticipantsService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Optional() private readonly realtime?: RealtimeBroadcaster,
  ) {}

  async list(boardId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('participants')
      .select('name')
      .where('board_id', '=', boardId)
      .orderBy('created_at', 'asc')
      .orderBy('name', 'asc')
      .execute();
    return rows.map((r) => r.name);
  }

  async add(boardId: string, name: string): Promise<ParticipantResultDto> {
    await this.db
      .insertInto('participants')
      .values({ board_id: boardId, name })
      .onConflict((oc) => oc.columns(['board_id', 'name']).doNothing())
      .execute();
    this.realtime?.emitToBoard(boardId, 'participant:added', { boardId, name });
    return { name };
  }

  async remove(boardId: string, name: string): Promise<void> {
    await this.db
      .deleteFrom('participants')
      .where('board_id', '=', boardId)
      .where('name', '=', name)
      .execute();
    this.realtime?.emitToBoard(boardId, 'participant:removed', {
      boardId,
      name,
    });
  }
}

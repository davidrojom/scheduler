import { Inject, Injectable } from '@nestjs/common';
import { Database, KYSELY } from '../../database/database.module';

export interface ParticipantResultDto {
  name: string;
}

@Injectable()
export class ParticipantsService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

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
    return { name };
  }

  async remove(boardId: string, name: string): Promise<void> {
    await this.db
      .deleteFrom('participants')
      .where('board_id', '=', boardId)
      .where('name', '=', name)
      .execute();
  }
}

import { randomBytes } from 'crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { Database, KYSELY } from '../database/database.module';
import { BoardInvite, BoardRole, InviteRole } from '../database/database.types';
import {
  AcceptInviteDto,
  CreatedInviteDto,
  InviteInfoDto,
} from './invites.types';

const ROLE_RANK: Record<BoardRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

@Injectable()
export class InvitesService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  async create(
    boardId: string,
    userId: string,
    role: InviteRole,
  ): Promise<CreatedInviteDto> {
    const token = randomBytes(24).toString('base64url');
    const row = await this.db
      .insertInto('board_invites')
      .values({ board_id: boardId, token, role, created_by: userId })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      token: row.token,
      role: row.role,
      url: this.buildUrl(row.token),
    };
  }

  async getInfo(token: string): Promise<InviteInfoDto> {
    const row = await this.db
      .selectFrom('board_invites')
      .innerJoin('boards', 'boards.id', 'board_invites.board_id')
      .where('board_invites.token', '=', token)
      .select([
        'board_invites.board_id as board_id',
        'board_invites.role as role',
        'board_invites.revoked as revoked',
        'board_invites.expires_at as expires_at',
        'boards.name as board_name',
      ])
      .executeTakeFirst();

    if (!row || row.revoked || this.isExpired(row.expires_at)) {
      return { boardId: null, boardName: null, role: null, valid: false };
    }

    return {
      boardId: row.board_id,
      boardName: row.board_name,
      role: row.role,
      valid: true,
    };
  }

  async accept(token: string, userId: string): Promise<AcceptInviteDto> {
    return this.db.transaction().execute(async (trx) => {
      const invite = await trx
        .selectFrom('board_invites')
        .selectAll()
        .where('token', '=', token)
        .forUpdate()
        .executeTakeFirst();

      if (!invite || invite.revoked || this.isExpired(invite.expires_at)) {
        throw new NotFoundException('Invite is invalid or no longer valid');
      }

      const existing = await trx
        .selectFrom('board_members')
        .select('role')
        .where('board_id', '=', invite.board_id)
        .where('user_id', '=', userId)
        .executeTakeFirst();

      if (!existing) {
        await trx
          .insertInto('board_members')
          .values({
            board_id: invite.board_id,
            user_id: userId,
            role: invite.role,
          })
          .onConflict((oc) => oc.columns(['board_id', 'user_id']).doNothing())
          .execute();
      } else if (ROLE_RANK[invite.role] > ROLE_RANK[existing.role]) {
        await trx
          .updateTable('board_members')
          .set({ role: invite.role })
          .where('board_id', '=', invite.board_id)
          .where('user_id', '=', userId)
          .execute();
      }

      return { boardId: invite.board_id };
    });
  }

  async revoke(boardId: string, inviteId: string): Promise<void> {
    if (!isUUID(inviteId)) {
      throw new NotFoundException('Invite not found');
    }
    const updated = await this.db
      .updateTable('board_invites')
      .set({ revoked: true })
      .where('id', '=', inviteId)
      .where('board_id', '=', boardId)
      .returning('id')
      .executeTakeFirst();

    if (!updated) {
      throw new NotFoundException('Invite not found');
    }
  }

  private isExpired(expiresAt: BoardInvite['expires_at']): boolean {
    return expiresAt !== null && expiresAt.getTime() <= Date.now();
  }

  private buildUrl(token: string): string {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    return `${frontendUrl}/join/${token}`;
  }
}

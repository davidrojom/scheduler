import { Injectable } from '@nestjs/common';
import { Namespace } from 'socket.io';

export function boardRoom(boardId: string): string {
  return `board:${boardId}`;
}

@Injectable()
export class RealtimeBroadcaster {
  private namespace: Namespace | null = null;

  setNamespace(namespace: Namespace): void {
    this.namespace = namespace;
  }

  emitToBoard(boardId: string, event: string, payload: unknown): void {
    this.namespace?.to(boardRoom(boardId)).emit(event, payload);
  }
}

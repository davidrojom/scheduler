import { Inject, Injectable, InjectionToken, NgZone } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io } from 'socket.io-client';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import {
  REMOTE_EVENT_NAMES,
  RemoteEvent,
} from './collaboration.types';

export interface CollabSocket {
  connected: boolean;
  readonly io: { on(event: string, handler: (...args: unknown[]) => void): void };
  on(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, payload: unknown): void;
  connect(): void;
  disconnect(): void;
}

export type SocketFactory = (token: string) => CollabSocket;

/**
 * Builds the `/collab` socket. Overridable in tests so the service can be
 * driven without a real network connection.
 */
export const COLLAB_SOCKET_FACTORY = new InjectionToken<SocketFactory>(
  'COLLAB_SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (token: string) =>
      io(`${environment.wsUrl}/collab`, {
        auth: { token },
        transports: ['websocket', 'polling'],
      }) as unknown as CollabSocket,
  }
);

/**
 * Owns the realtime connection to the gateway (architecture §7.7). It connects
 * while authenticated, joins the active DB board's room, emits local content
 * ops, surfaces remote past-tense events on `remoteEvents$`, and signals
 * `resync$` after a reconnect so the caller re-hydrates authoritative state.
 */
@Injectable({
  providedIn: 'root',
})
export class CollaborationService {
  private socket: CollabSocket | null = null;
  private activeBoardId: string | null = null;
  private readonly joinedBoards = new Set<string>();
  private pendingResync = false;

  private readonly _connected$ = new BehaviorSubject<boolean>(false);
  private readonly _remoteEvents$ = new Subject<RemoteEvent>();
  private readonly _resync$ = new Subject<string>();

  readonly connected$: Observable<boolean> = this._connected$.asObservable();
  readonly remoteEvents$: Observable<RemoteEvent> =
    this._remoteEvents$.asObservable();
  /** Emits a boardId when the caller should re-fetch its authoritative state. */
  readonly resync$: Observable<string> = this._resync$.asObservable();

  constructor(
    private readonly authService: AuthService,
    private readonly zone: NgZone,
    @Inject(COLLAB_SOCKET_FACTORY) private readonly socketFactory: SocketFactory
  ) {
    this.authService.authState$
      .pipe(takeUntilDestroyed())
      .subscribe((authenticated) => {
        if (authenticated) {
          this.connect();
        } else {
          this.disconnect();
        }
      });
  }

  /** Whether ops for `boardId` should travel over the socket (else fall back to REST). */
  isLive(boardId: string): boolean {
    return (
      !!this.socket && this.socket.connected && this.joinedBoards.has(boardId)
    );
  }

  emitOp(event: string, payload: unknown): boolean {
    if (!this.socket || !this.socket.connected) {
      return false;
    }
    this.socket.emit(event, payload);
    return true;
  }

  setActiveBoard(boardId: string | null): void {
    if (this.activeBoardId === boardId) {
      return;
    }
    const previous = this.activeBoardId;
    this.activeBoardId = boardId;

    if (previous && this.socket?.connected) {
      this.socket.emit('board:leave', { boardId: previous });
    }
    this.joinedBoards.delete(previous ?? '');

    if (boardId && this.socket?.connected) {
      this.socket.emit('board:join', { boardId });
    }
  }

  private connect(): void {
    if (this.socket) {
      return;
    }
    const token = this.authService.getToken();
    if (!token) {
      return;
    }

    const socket = this.socketFactory(token);
    this.socket = socket;

    socket.on('connect', () => {
      if (this.activeBoardId) {
        socket.emit('board:join', { boardId: this.activeBoardId });
      }
      this.zone.run(() => this._connected$.next(true));
    });

    socket.on('disconnect', () => {
      this.joinedBoards.clear();
      this.zone.run(() => this._connected$.next(false));
    });

    socket.on('connect_error', () => {
      this.zone.run(() => this._connected$.next(false));
    });

    // A reconnect re-runs `connect` (and thus `board:join`); flag it so the
    // following presence:sync triggers a re-hydrate of edits missed offline.
    socket.io.on('reconnect', () => {
      this.pendingResync = true;
    });

    socket.on('presence:sync', (...args: unknown[]) => {
      const payload = args[0] as { boardId?: string } | undefined;
      const boardId = payload?.boardId;
      if (!boardId) {
        return;
      }
      this.joinedBoards.add(boardId);
      if (this.pendingResync) {
        this.pendingResync = false;
        this.zone.run(() => this._resync$.next(boardId));
      }
    });

    // Server-side op rejections (e.g. viewer FORBIDDEN) arrive here; they must
    // not surface as uncaught errors.
    socket.on('error', () => {
      /* swallowed: rejections are enforced/observed server-side */
    });

    // Socket.IO message callbacks fire outside the Angular zone, so emitting
    // remote events directly would update state without scheduling change
    // detection (OnPush components would not re-render). Re-enter the zone so
    // the reactive rehydrate that follows repaints the board.
    for (const name of REMOTE_EVENT_NAMES) {
      socket.on(name, (...args: unknown[]) => {
        const payload = (args[0] ?? {}) as Record<string, unknown>;
        this.zone.run(() =>
          this._remoteEvents$.next({ type: name, ...payload } as RemoteEvent)
        );
      });
    }
  }

  private disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.joinedBoards.clear();
    this.activeBoardId = null;
    this.pendingResync = false;
    this._connected$.next(false);
  }
}

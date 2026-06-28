import { Inject, Injectable, InjectionToken, NgZone } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io } from 'socket.io-client';

import { environment } from '../../../environments/environment';
import { BoardRole } from '../models/project.model';
import { AuthService } from '../services/auth.service';
import {
  PresenceMember,
  REMOTE_EVENT_NAMES,
  RemoteCursor,
  RemoteEvent,
} from './collaboration.types';

/** A remote cursor is dropped this long after its last movement (safety net for
 * an ungraceful disconnect where `presence:left` is delayed); explicit
 * leave/tab-close removes it immediately. Kept under the ~10s contract window. */
export const CURSOR_IDLE_MS = 8000;
const CURSOR_SWEEP_MS = 2000;

/** Removes cursors whose last update is older than `idleMs`. Returns whether
 * anything was removed so callers can skip a needless re-emit. */
export function pruneIdleCursors(
  cursors: Map<string, RemoteCursor>,
  now: number,
  idleMs: number
): boolean {
  let changed = false;
  for (const [userId, cursor] of cursors) {
    if (now - cursor.updatedAt >= idleMs) {
      cursors.delete(userId);
      changed = true;
    }
  }
  return changed;
}

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

  private readonly presenceByUser = new Map<string, PresenceMember>();
  private readonly cursorByUser = new Map<string, RemoteCursor>();
  private cursorSweep: ReturnType<typeof setInterval> | null = null;

  private readonly _connected$ = new BehaviorSubject<boolean>(false);
  private readonly _remoteEvents$ = new Subject<RemoteEvent>();
  private readonly _resync$ = new Subject<string>();
  private readonly _memberRemoved$ = new Subject<{
    boardId: string;
    userId: string;
  }>();
  private readonly _memberRoleChanged$ = new Subject<{
    boardId: string;
    userId: string;
    role: BoardRole;
  }>();
  private readonly _presence$ = new BehaviorSubject<PresenceMember[]>([]);
  private readonly _cursors$ = new BehaviorSubject<RemoteCursor[]>([]);

  readonly connected$: Observable<boolean> = this._connected$.asObservable();
  readonly remoteEvents$: Observable<RemoteEvent> =
    this._remoteEvents$.asObservable();
  /** Emits a boardId when the caller should re-fetch its authoritative state. */
  readonly resync$: Observable<string> = this._resync$.asObservable();
  /**
   * Emits when a board owner removed a collaborator. The removed user's client
   * uses it to leave the board; everyone else updates their member list.
   */
  readonly memberRemoved$: Observable<{ boardId: string; userId: string }> =
    this._memberRemoved$.asObservable();
  /**
   * Emits when a member's role changed (incl. an ownership transfer, which emits
   * one event per affected member). Clients update their own `myRole` and the
   * collaborators list.
   */
  readonly memberRoleChanged$: Observable<{
    boardId: string;
    userId: string;
    role: BoardRole;
  }> = this._memberRoleChanged$.asObservable();
  /** Collaborators currently present in the active board's room (incl. self). */
  readonly presence$: Observable<PresenceMember[]> =
    this._presence$.asObservable();
  /** Remote collaborators' live cursors over the active board canvas. */
  readonly cursors$: Observable<RemoteCursor[]> = this._cursors$.asObservable();

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

  /** Emits the local pointer position (normalized 0..1) for the given board.
   * No-ops unless the board is joined and live (anonymous makes no emission). */
  emitCursor(boardId: string, x: number, y: number): void {
    if (!this.isLive(boardId)) {
      return;
    }
    this.socket?.emit('cursor:move', { boardId, x, y });
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

    // Presence/cursors are per-board; clear the previous board's set so a stale
    // collaborator/cursor never leaks across a switch. The new board's
    // presence:sync repopulates it.
    this.resetPresenceState();

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
      this.startCursorSweep();
      this.zone.run(() => this._connected$.next(true));
    });

    socket.on('disconnect', () => {
      this.joinedBoards.clear();
      this.zone.run(() => {
        this.resetPresenceState();
        this._connected$.next(false);
      });
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
      const payload = args[0] as
        | { boardId?: string; members?: PresenceMember[] }
        | undefined;
      const boardId = payload?.boardId;
      if (!boardId) {
        return;
      }
      this.joinedBoards.add(boardId);
      if (boardId === this.activeBoardId) {
        // The join-time sync carries the full current member set, so a late
        // joiner sees everyone already present (VAL-RT-026).
        this.presenceByUser.clear();
        for (const member of payload?.members ?? []) {
          this.presenceByUser.set(member.userId, member);
        }
        for (const userId of [...this.cursorByUser.keys()]) {
          if (!this.presenceByUser.has(userId)) {
            this.cursorByUser.delete(userId);
          }
        }
        this.zone.run(() => {
          this.publishPresence();
          this.publishCursors();
        });
      }
      if (this.pendingResync) {
        this.pendingResync = false;
        this.zone.run(() => this._resync$.next(boardId));
      }
    });

    socket.on('presence:joined', (...args: unknown[]) => {
      const payload = args[0] as
        | { boardId?: string; member?: PresenceMember }
        | undefined;
      if (
        payload?.boardId !== this.activeBoardId ||
        !payload?.member?.userId
      ) {
        return;
      }
      this.presenceByUser.set(payload.member.userId, payload.member);
      this.zone.run(() => this.publishPresence());
    });

    socket.on('presence:left', (...args: unknown[]) => {
      const payload = args[0] as
        | { boardId?: string; member?: PresenceMember }
        | undefined;
      if (
        payload?.boardId !== this.activeBoardId ||
        !payload?.member?.userId
      ) {
        return;
      }
      this.presenceByUser.delete(payload.member.userId);
      const hadCursor = this.cursorByUser.delete(payload.member.userId);
      this.zone.run(() => {
        this.publishPresence();
        if (hadCursor) {
          this.publishCursors();
        }
      });
    });

    socket.on('cursor:moved', (...args: unknown[]) => {
      const payload = args[0] as
        | {
            boardId?: string;
            userId?: string;
            name?: string;
            color?: string;
            x?: number;
            y?: number;
          }
        | undefined;
      if (payload?.boardId !== this.activeBoardId || !payload?.userId) {
        return;
      }
      this.cursorByUser.set(payload.userId, {
        userId: payload.userId,
        name: payload.name ?? '',
        color: payload.color ?? '#9ca3af',
        x: payload.x ?? 0,
        y: payload.y ?? 0,
        updatedAt: Date.now(),
      });
      this.zone.run(() => this.publishCursors());
    });

    // A board owner removed a collaborator. Re-enter the zone so consumers
    // (board access cleanup, member list) re-render under change detection.
    socket.on('board:member_removed', (...args: unknown[]) => {
      const payload = args[0] as
        | { boardId?: string; userId?: string }
        | undefined;
      if (!payload?.boardId || !payload?.userId) {
        return;
      }
      const removal = { boardId: payload.boardId, userId: payload.userId };
      this.zone.run(() => this._memberRemoved$.next(removal));
    });

    // A member's role changed (incl. an ownership transfer). Re-enter the zone so
    // `myRole`-driven controls and the collaborators list re-render.
    socket.on('board:member_role_changed', (...args: unknown[]) => {
      const payload = args[0] as
        | { boardId?: string; userId?: string; role?: BoardRole }
        | undefined;
      if (!payload?.boardId || !payload?.userId || !payload?.role) {
        return;
      }
      const change = {
        boardId: payload.boardId,
        userId: payload.userId,
        role: payload.role,
      };
      this.zone.run(() => this._memberRoleChanged$.next(change));
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
    this.stopCursorSweep();
    this.joinedBoards.clear();
    this.activeBoardId = null;
    this.pendingResync = false;
    this.resetPresenceState();
    this._connected$.next(false);
  }

  private resetPresenceState(): void {
    const hadPresence = this.presenceByUser.size > 0;
    const hadCursors = this.cursorByUser.size > 0;
    this.presenceByUser.clear();
    this.cursorByUser.clear();
    if (hadPresence) {
      this.publishPresence();
    }
    if (hadCursors) {
      this.publishCursors();
    }
  }

  private startCursorSweep(): void {
    if (this.cursorSweep) {
      return;
    }
    this.cursorSweep = setInterval(() => {
      if (pruneIdleCursors(this.cursorByUser, Date.now(), CURSOR_IDLE_MS)) {
        this.zone.run(() => this.publishCursors());
      }
    }, CURSOR_SWEEP_MS);
  }

  private stopCursorSweep(): void {
    if (this.cursorSweep) {
      clearInterval(this.cursorSweep);
      this.cursorSweep = null;
    }
  }

  private publishPresence(): void {
    this._presence$.next([...this.presenceByUser.values()]);
  }

  private publishCursors(): void {
    this._cursors$.next([...this.cursorByUser.values()]);
  }
}

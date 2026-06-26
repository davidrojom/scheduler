import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import {
  CollaborationService,
  CollabSocket,
  COLLAB_SOCKET_FACTORY,
  CURSOR_IDLE_MS,
  pruneIdleCursors,
} from './collaboration.service';
import { AuthService } from '../services/auth.service';
import {
  PresenceMember,
  RemoteCursor,
  RemoteEvent,
} from './collaboration.types';

class FakeSocket implements CollabSocket {
  connected = false;
  emitted: { event: string; payload: unknown }[] = [];
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  private managerHandlers = new Map<string, ((...args: unknown[]) => void)[]>();

  readonly io = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const list = this.managerHandlers.get(event) ?? [];
      list.push(handler);
      this.managerHandlers.set(event, list);
    },
  };

  on(event: string, handler: (...args: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
    this.trigger('disconnect');
  }

  trigger(event: string, payload?: unknown): void {
    (this.handlers.get(event) ?? []).forEach((h) => h(payload));
  }

  triggerManager(event: string, payload?: unknown): void {
    (this.managerHandlers.get(event) ?? []).forEach((h) => h(payload));
  }

  simulateConnect(): void {
    this.connected = true;
    this.trigger('connect');
  }
}

describe('CollaborationService', () => {
  let fake: FakeSocket;
  let authState$: BehaviorSubject<boolean>;
  let service: CollaborationService;

  function setup(authenticated: boolean) {
    fake = new FakeSocket();
    authState$ = new BehaviorSubject<boolean>(authenticated);
    const authStub: Partial<AuthService> = {
      authState$: authState$.asObservable(),
      getToken: () => (authenticated ? 'jwt-token' : null),
    };

    TestBed.configureTestingModule({
      providers: [
        CollaborationService,
        { provide: AuthService, useValue: authStub },
        { provide: COLLAB_SOCKET_FACTORY, useValue: () => fake },
      ],
    });

    service = TestBed.inject(CollaborationService);
  }

  it('does not create a socket while anonymous', () => {
    setup(false);
    expect(service.isLive('b1')).toBeFalse();
    expect(fake.emitted.length).toBe(0);
  });

  it('joins the active board once connected and reports it live', () => {
    setup(true);
    service.setActiveBoard('b1');
    fake.simulateConnect();

    expect(fake.emitted).toContain(
      jasmine.objectContaining({ event: 'board:join', payload: { boardId: 'b1' } })
    );

    expect(service.isLive('b1')).toBeFalse();
    fake.trigger('presence:sync', { boardId: 'b1', members: [] });
    expect(service.isLive('b1')).toBeTrue();
  });

  it('emitOp emits while connected and refuses while disconnected', () => {
    setup(true);
    expect(service.emitOp('task:create', { boardId: 'b1' })).toBeFalse();

    fake.simulateConnect();
    expect(service.emitOp('task:create', { boardId: 'b1' })).toBeTrue();
    expect(fake.emitted).toContain(
      jasmine.objectContaining({ event: 'task:create' })
    );
  });

  it('forwards remote past-tense events on remoteEvents$', () => {
    setup(true);
    fake.simulateConnect();

    const received: RemoteEvent[] = [];
    service.remoteEvents$.subscribe((e) => received.push(e));

    fake.trigger('column:created', {
      boardId: 'b1',
      column: { id: 'c1', title: 'A', position: 0 },
    });

    expect(received.length).toBe(1);
    expect(received[0]).toEqual({
      type: 'column:created',
      boardId: 'b1',
      column: { id: 'c1', title: 'A', position: 0 },
    });
  });

  it('does not resync on the first join but does after a reconnect', () => {
    setup(true);
    const resyncs: string[] = [];
    service.resync$.subscribe((id) => resyncs.push(id));

    service.setActiveBoard('b1');
    fake.simulateConnect();
    fake.trigger('presence:sync', { boardId: 'b1', members: [] });
    expect(resyncs).toEqual([]);

    // Simulate a transient drop + auto-reconnect.
    fake.trigger('disconnect');
    fake.triggerManager('reconnect');
    fake.simulateConnect();
    fake.trigger('presence:sync', { boardId: 'b1', members: [] });

    expect(resyncs).toEqual(['b1']);
  });

  it('disconnects and goes offline when authentication is lost', () => {
    setup(true);
    fake.simulateConnect();
    fake.trigger('presence:sync', { boardId: 'b1', members: [] });
    expect(service.isLive('b1')).toBeTrue();

    authState$.next(false);

    expect(fake.connected).toBeFalse();
    expect(service.isLive('b1')).toBeFalse();
  });

  it('publishes the full member set from presence:sync for the active board', () => {
    setup(true);
    service.setActiveBoard('b1');
    fake.simulateConnect();

    const members: PresenceMember[][] = [];
    service.presence$.subscribe((m) => members.push(m));

    fake.trigger('presence:sync', {
      boardId: 'b1',
      members: [
        { userId: 'u1', name: 'Alice', color: '#f00' },
        { userId: 'u2', name: 'Bob', color: '#00f' },
        { userId: 'u3', name: 'Cara', color: '#0f0' },
      ],
    });

    const latest = members[members.length - 1];
    expect(latest.length).toBe(3);
    expect(latest.map((m) => m.name).sort()).toEqual(['Alice', 'Bob', 'Cara']);
  });

  it('adds a collaborator on presence:joined and removes them (and their cursor) on presence:left', () => {
    setup(true);
    service.setActiveBoard('b1');
    fake.simulateConnect();
    fake.trigger('presence:sync', {
      boardId: 'b1',
      members: [{ userId: 'u1', name: 'Alice', color: '#f00' }],
    });

    const presence: PresenceMember[][] = [];
    const cursors: RemoteCursor[][] = [];
    service.presence$.subscribe((m) => presence.push(m));
    service.cursors$.subscribe((c) => cursors.push(c));

    fake.trigger('presence:joined', {
      boardId: 'b1',
      member: { userId: 'u2', name: 'Bob', color: '#00f' },
    });
    expect(presence[presence.length - 1].map((m) => m.userId).sort()).toEqual([
      'u1',
      'u2',
    ]);

    fake.trigger('cursor:moved', {
      boardId: 'b1',
      userId: 'u2',
      name: 'Bob',
      color: '#00f',
      x: 0.5,
      y: 0.5,
    });
    expect(cursors[cursors.length - 1].length).toBe(1);

    fake.trigger('presence:left', {
      boardId: 'b1',
      member: { userId: 'u2', name: 'Bob', color: '#00f' },
    });
    expect(presence[presence.length - 1].map((m) => m.userId)).toEqual(['u1']);
    expect(cursors[cursors.length - 1].length).toBe(0);
  });

  it('tracks remote cursors with their server color and ignores other boards', () => {
    setup(true);
    service.setActiveBoard('b1');
    fake.simulateConnect();
    fake.trigger('presence:sync', { boardId: 'b1', members: [] });

    const cursors: RemoteCursor[][] = [];
    service.cursors$.subscribe((c) => cursors.push(c));

    fake.trigger('cursor:moved', {
      boardId: 'b1',
      userId: 'u2',
      name: 'Bob',
      color: '#00f',
      x: 0.25,
      y: 0.75,
    });
    const live = cursors[cursors.length - 1];
    expect(live.length).toBe(1);
    expect(live[0]).toEqual(
      jasmine.objectContaining({
        userId: 'u2',
        name: 'Bob',
        color: '#00f',
        x: 0.25,
        y: 0.75,
      })
    );

    fake.trigger('cursor:moved', {
      boardId: 'other',
      userId: 'u3',
      name: 'Cara',
      color: '#0f0',
      x: 0.1,
      y: 0.1,
    });
    expect(cursors[cursors.length - 1].length).toBe(1);
  });

  it('emitCursor emits cursor:move only when the board is live', () => {
    setup(true);
    service.setActiveBoard('b1');

    service.emitCursor('b1', 0.5, 0.5);
    expect(fake.emitted.some((e) => e.event === 'cursor:move')).toBeFalse();

    fake.simulateConnect();
    fake.trigger('presence:sync', { boardId: 'b1', members: [] });

    service.emitCursor('b1', 0.4, 0.6);
    expect(fake.emitted).toContain(
      jasmine.objectContaining({
        event: 'cursor:move',
        payload: { boardId: 'b1', x: 0.4, y: 0.6 },
      })
    );
  });

  it('clears presence and cursors when the active board changes', () => {
    setup(true);
    service.setActiveBoard('b1');
    fake.simulateConnect();
    fake.trigger('presence:sync', {
      boardId: 'b1',
      members: [{ userId: 'u2', name: 'Bob', color: '#00f' }],
    });
    fake.trigger('cursor:moved', {
      boardId: 'b1',
      userId: 'u2',
      name: 'Bob',
      color: '#00f',
      x: 0.5,
      y: 0.5,
    });

    const presence: PresenceMember[][] = [];
    const cursors: RemoteCursor[][] = [];
    service.presence$.subscribe((m) => presence.push(m));
    service.cursors$.subscribe((c) => cursors.push(c));

    service.setActiveBoard('b2');

    expect(presence[presence.length - 1].length).toBe(0);
    expect(cursors[cursors.length - 1].length).toBe(0);
  });
});

describe('pruneIdleCursors', () => {
  function cursor(userId: string, updatedAt: number): RemoteCursor {
    return { userId, name: userId, color: '#000', x: 0, y: 0, updatedAt };
  }

  it('removes cursors idle beyond the threshold and keeps fresh ones', () => {
    const now = 100_000;
    const cursors = new Map<string, RemoteCursor>([
      ['stale', cursor('stale', now - CURSOR_IDLE_MS - 1)],
      ['fresh', cursor('fresh', now - 1000)],
    ]);

    const changed = pruneIdleCursors(cursors, now, CURSOR_IDLE_MS);

    expect(changed).toBeTrue();
    expect([...cursors.keys()]).toEqual(['fresh']);
  });

  it('reports no change when every cursor is fresh', () => {
    const now = 100_000;
    const cursors = new Map<string, RemoteCursor>([
      ['a', cursor('a', now - 10)],
    ]);

    expect(pruneIdleCursors(cursors, now, CURSOR_IDLE_MS)).toBeFalse();
    expect([...cursors.keys()]).toEqual(['a']);
  });
});

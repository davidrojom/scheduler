import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import {
  CollaborationService,
  CollabSocket,
  COLLAB_SOCKET_FACTORY,
} from './collaboration.service';
import { AuthService } from '../services/auth.service';
import { RemoteEvent } from './collaboration.types';

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
});

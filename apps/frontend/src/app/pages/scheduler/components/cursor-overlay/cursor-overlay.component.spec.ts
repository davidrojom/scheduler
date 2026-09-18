import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import {
  CursorOverlayComponent,
  followScrollDelta,
} from './cursor-overlay.component';
import { CollaborationService } from '../../../../shared/collaboration/collaboration.service';
import { RemoteCursor } from '../../../../shared/collaboration/collaboration.types';

function fakeRect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('CursorOverlayComponent', () => {
  let fixture: ComponentFixture<CursorOverlayComponent>;
  let component: CursorOverlayComponent;
  let cursors$: BehaviorSubject<RemoteCursor[]>;
  let emitCursor: jasmine.Spy;
  let followed: WritableSignal<string | null>;

  beforeEach(() => {
    cursors$ = new BehaviorSubject<RemoteCursor[]>([]);
    emitCursor = jasmine.createSpy('emitCursor');
    followed = signal<string | null>(null);
    const collabStub: Partial<CollaborationService> = {
      cursors$: cursors$.asObservable(),
      presence$: new BehaviorSubject([]).asObservable(),
      followedUserId: followed,
      emitCursor: emitCursor as unknown as CollaborationService['emitCursor'],
    };

    TestBed.configureTestingModule({
      imports: [CursorOverlayComponent],
      providers: [{ provide: CollaborationService, useValue: collabStub }],
    });

    fixture = TestBed.createComponent(CursorOverlayComponent);
    component = fixture.componentInstance;
  });

  it('emits normalized coordinates from a pointer move over the canvas', () => {
    const canvas = document.createElement('div');
    spyOn(canvas, 'getBoundingClientRect').and.returnValue(
      fakeRect(100, 50, 400, 200)
    );
    component.boardId = 'b1';
    component.canvas = canvas;
    fixture.detectChanges();

    component.onMouseMove({ clientX: 300, clientY: 150 } as MouseEvent);

    expect(emitCursor).toHaveBeenCalledWith('b1', 0.5, 0.5);
  });

  it('ignores pointer moves outside the canvas bounds', () => {
    const canvas = document.createElement('div');
    spyOn(canvas, 'getBoundingClientRect').and.returnValue(
      fakeRect(100, 50, 400, 200)
    );
    component.boardId = 'b1';
    component.canvas = canvas;
    fixture.detectChanges();

    component.onMouseMove({ clientX: 10, clientY: 10 } as MouseEvent);

    expect(emitCursor).not.toHaveBeenCalled();
  });

  it('does not emit when there is no active board', () => {
    const canvas = document.createElement('div');
    spyOn(canvas, 'getBoundingClientRect').and.returnValue(
      fakeRect(0, 0, 100, 100)
    );
    component.boardId = null;
    component.canvas = canvas;
    fixture.detectChanges();

    component.onMouseMove({ clientX: 50, clientY: 50 } as MouseEvent);

    expect(emitCursor).not.toHaveBeenCalled();
  });

  it('renders remote cursors at canvas-relative pixel positions', () => {
    const canvas = document.createElement('div');
    spyOn(canvas, 'getBoundingClientRect').and.returnValue(
      fakeRect(100, 50, 400, 200)
    );
    spyOn(
      fixture.nativeElement as HTMLElement,
      'getBoundingClientRect'
    ).and.returnValue(fakeRect(0, 0, 1000, 600));
    component.boardId = 'b1';
    component.canvas = canvas;
    fixture.detectChanges();

    cursors$.next([
      {
        userId: 'u2',
        name: 'Bob',
        color: '#00f',
        x: 0.5,
        y: 0.5,
        updatedAt: Date.now(),
      },
    ]);

    expect(component.cursors.length).toBe(1);
    expect(component.cursors[0]).toEqual(
      jasmine.objectContaining({
        userId: 'u2',
        name: 'Bob',
        color: '#00f',
        left: 300,
        top: 150,
      })
    );
  });

  it('followScrollDelta returns deltas only when the cursor leaves the view', () => {
    const rect = fakeRect(0, 0, 400, 600);
    expect(followScrollDelta(500, rect, 80)).toBeGreaterThan(0);
    expect(followScrollDelta(-10, rect, 80)).toBeLessThan(0);
    expect(followScrollDelta(200, rect, 80)).toBe(0);
  });

  it('scrolls the board container to keep the followed cursor in view', () => {
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;top:0;left:0;width:400px;height:200px;overflow-x:auto;';
    const canvas = document.createElement('div');
    canvas.style.cssText = 'width:1000px;height:100px;';
    container.appendChild(canvas);
    document.body.appendChild(container);

    spyOn(canvas, 'getBoundingClientRect').and.returnValue(
      fakeRect(0, 0, 1000, 100)
    );
    component.boardId = 'b1';
    component.canvas = canvas;
    fixture.detectChanges();

    followed.set('u2');
    cursors$.next([
      {
        userId: 'u2',
        name: 'Bob',
        color: '#00f',
        x: 0.95,
        y: 0.5,
        updatedAt: Date.now(),
      },
    ]);

    expect(container.scrollLeft).toBeGreaterThan(0);
    container.remove();
  });

  it('does not scroll when the followed cursor stays in view', () => {
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;top:0;left:0;width:400px;height:200px;overflow-x:auto;';
    const canvas = document.createElement('div');
    canvas.style.cssText = 'width:1000px;height:100px;';
    container.appendChild(canvas);
    document.body.appendChild(container);

    spyOn(canvas, 'getBoundingClientRect').and.returnValue(
      fakeRect(0, 0, 1000, 100)
    );
    component.boardId = 'b1';
    component.canvas = canvas;
    fixture.detectChanges();

    followed.set('u2');
    cursors$.next([
      {
        userId: 'u2',
        name: 'Bob',
        color: '#00f',
        x: 0.2,
        y: 0.5,
        updatedAt: Date.now(),
      },
    ]);

    expect(container.scrollLeft).toBe(0);
    container.remove();
  });

  it('stops following on manual scrolling (wheel or touch)', () => {
    followed.set('u2');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.dispatchEvent(new Event('wheel'));
    expect(followed()).toBeNull();

    followed.set('u2');
    host.dispatchEvent(new Event('touchmove'));
    expect(followed()).toBeNull();
  });
});

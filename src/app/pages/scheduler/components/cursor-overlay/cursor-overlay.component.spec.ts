import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { CursorOverlayComponent } from './cursor-overlay.component';
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

  beforeEach(() => {
    cursors$ = new BehaviorSubject<RemoteCursor[]>([]);
    emitCursor = jasmine.createSpy('emitCursor');
    const collabStub: Partial<CollaborationService> = {
      cursors$: cursors$.asObservable(),
      presence$: new BehaviorSubject([]).asObservable(),
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
});

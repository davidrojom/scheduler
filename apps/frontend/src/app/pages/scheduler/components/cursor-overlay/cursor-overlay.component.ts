import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Input,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, asyncScheduler, fromEvent, throttleTime } from 'rxjs';

import { CollaborationService } from '../../../../shared/collaboration/collaboration.service';
import { RemoteCursor } from '../../../../shared/collaboration/collaboration.types';

interface RenderedCursor {
  userId: string;
  name: string;
  color: string;
  left: number;
  top: number;
}

const CURSOR_THROTTLE_MS = 50;

/** How close (px) to the board's edge the followed cursor may get before the
 * view scrolls to keep it in view. */
const FOLLOW_EDGE_MARGIN_PX = 80;

/** Scroll needed on one axis to bring `pos` back inside the `[min, max]` view
 * window (0 while it is within `marginPx` of the edges). Axis-agnostic: pass
 * left/right for horizontal, top/bottom for vertical. */
export function followScrollDelta(
  pos: number,
  min: number,
  max: number,
  marginPx: number
): number {
  if (pos < min + marginPx) {
    return Math.round(pos - (min + marginPx));
  }
  if (pos > max - marginPx) {
    return Math.round(pos - (max - marginPx));
  }
  return 0;
}

/**
 * Wraps the board canvas, captures the local pointer (throttled, normalized
 * 0..1 against the canvas) to emit `cursor:move`, and renders remote
 * collaborators' cursors as colored, name-labeled overlays positioned by the
 * same normalized coordinates (architecture §5.4, §7.7).
 */
@Component({
  selector: 'sch-cursor-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './cursor-overlay.component.html',
  styleUrl: './cursor-overlay.component.scss',
})
export class CursorOverlayComponent implements OnInit {
  /** The active DB board id; cursors are emitted/rendered only when joined. */
  @Input() boardId: string | null = null;
  /** The board canvas element used as the normalization reference. */
  @Input() canvas: HTMLElement | null = null;

  cursors: RenderedCursor[] = [];

  private latest: RemoteCursor[] = [];
  private readonly moves$ = new Subject<{ clientX: number; clientY: number }>();
  /** Last pointer position, so scrolling can re-publish it without a mousemove. */
  private lastPointer: { clientX: number; clientY: number } | null = null;

  constructor(
    private readonly collab: CollaborationService,
    private readonly host: ElementRef<HTMLElement>,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.moves$
      .pipe(
        throttleTime(CURSOR_THROTTLE_MS, asyncScheduler, {
          leading: true,
          trailing: true,
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ clientX, clientY }) => this.publishMove(clientX, clientY));

    this.collab.cursors$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cursors) => {
        this.latest = cursors;
        this.render();
      });

    // Scrolling moves the board under a stationary pointer: the normalized
    // cursor position changes without any mousemove, so re-publish the last
    // pointer position. Capture phase — `scroll` doesn't bubble.
    fromEvent<Event>(document, 'scroll', { capture: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.lastPointer) {
          this.moves$.next(this.lastPointer);
        }
      });
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.boardId) {
      return;
    }
    this.lastPointer = { clientX: event.clientX, clientY: event.clientY };
    this.moves$.next(this.lastPointer);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.render();
  }

  private publishMove(clientX: number, clientY: number): void {
    if (!this.boardId || !this.canvas) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return;
    }
    this.collab.emitCursor(this.boardId, x, y);
  }

  private render(): void {
    const canvas = this.canvas;
    if (!canvas) {
      this.cursors = [];
      this.changeDetector.markForCheck();
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const hostRect = this.host.nativeElement.getBoundingClientRect();
    const offsetX = canvasRect.left - hostRect.left;
    const offsetY = canvasRect.top - hostRect.top;

    this.cursors = this.latest.map((cursor) => ({
      userId: cursor.userId,
      name: cursor.name,
      color: cursor.color,
      left: offsetX + cursor.x * canvasRect.width,
      top: offsetY + cursor.y * canvasRect.height,
    }));
    this.followCursor(canvasRect);
    this.changeDetector.markForCheck();
  }

  /** Keeps the followed member's cursor in view by scrolling every scrollable
   * ancestor of the canvas on both axes — in this layout the board scrolls
   * horizontally in one container and vertically in another. */
  private followCursor(canvasRect: DOMRect): void {
    const followedId = this.collab.followedUserId();
    if (!followedId || !this.canvas) {
      return;
    }
    const cursor = this.latest.find((c) => c.userId === followedId);
    if (!cursor) {
      return;
    }
    const cursorX = canvasRect.left + cursor.x * canvasRect.width;
    const cursorY = canvasRect.top + cursor.y * canvasRect.height;

    let node: HTMLElement | null = this.canvas.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      const scrollsX =
        /(auto|scroll)/.test(style.overflowX) &&
        node.scrollWidth > node.clientWidth + 1;
      const scrollsY =
        /(auto|scroll)/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight + 1;
      if (scrollsX || scrollsY) {
        const rect = node.getBoundingClientRect();
        if (scrollsX) {
          node.scrollLeft += followScrollDelta(
            cursorX,
            rect.left,
            rect.right,
            FOLLOW_EDGE_MARGIN_PX
          );
        }
        if (scrollsY) {
          node.scrollTop += followScrollDelta(
            cursorY,
            rect.top,
            rect.bottom,
            FOLLOW_EDGE_MARGIN_PX
          );
        }
      }
      node = node.parentElement;
    }
  }

  @HostListener('wheel')
  @HostListener('touchmove')
  onManualScroll(): void {
    // ponytail: scrollbar-drag unfollow isn't wired; wheel/touch covers mouse,
    // trackpad and swipe, and programmatic scrolls don't fire these.
    if (this.collab.followedUserId()) {
      this.collab.followedUserId.set(null);
    }
  }
}

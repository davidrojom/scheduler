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
import { Subject, asyncScheduler, throttleTime } from 'rxjs';

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
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.boardId) {
      return;
    }
    this.moves$.next({ clientX: event.clientX, clientY: event.clientY });
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
    this.changeDetector.markForCheck();
  }
}

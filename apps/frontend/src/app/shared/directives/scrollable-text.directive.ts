import {
  Directive,
  ElementRef,
  AfterViewInit,
  Renderer2,
  OnDestroy,
} from '@angular/core';

@Directive({
  selector: '[schScrollableText]',
  standalone: true,
})
export class ScrollableTextDirective implements AfterViewInit, OnDestroy {
  private resizeObserver?: ResizeObserver;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.checkOverflow();
      this.observeResize();
    }, 0);
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private checkOverflow(): void {
    const element = this.el.nativeElement as HTMLElement;
    const parent = element.parentElement;

    if (!parent) {
      return;
    }

    const isOverflowing = element.scrollWidth > parent.clientWidth;

    if (isOverflowing) {
      this.renderer.addClass(element, 'long-text');
      this.duplicateContent();
    } else {
      this.renderer.removeClass(element, 'long-text');
      this.removeDuplicateContent();
    }
  }

  private duplicateContent(): void {
    const element = this.el.nativeElement as HTMLElement;

    if (element.querySelector('.duplicate-text')) {
      return;
    }

    const originalText = element.textContent || '';
    const duplicate = this.renderer.createElement('span');
    this.renderer.addClass(duplicate, 'duplicate-text');
    this.renderer.setProperty(duplicate, 'textContent', originalText);
    this.renderer.setStyle(duplicate, 'margin-left', '3em');
    this.renderer.appendChild(element, duplicate);
  }

  private removeDuplicateContent(): void {
    const element = this.el.nativeElement as HTMLElement;
    const duplicate = element.querySelector('.duplicate-text');

    if (duplicate) {
      this.renderer.removeChild(element, duplicate);
    }
  }

  private observeResize(): void {
    const element = this.el.nativeElement as HTMLElement;
    const parent = element.parentElement;

    if (!parent) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.checkOverflow();
    });

    this.resizeObserver.observe(parent);
  }
}

import { computed, Directive, input } from '@angular/core';
import { hlm, type ClassValue } from './utils';

@Directive({
  selector: '[hlmSeparator]',
  standalone: true,
  host: {
    '[class]': '_computedClass()',
    '[attr.role]': '"separator"',
    '[attr.aria-orientation]': 'orientation()',
  },
})
export class HlmSeparatorDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  public readonly orientation = input<'horizontal' | 'vertical'>('horizontal');

  protected readonly _computedClass = computed(() =>
    hlm(
      'block shrink-0 bg-border',
      this.orientation() === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      this.userClass(),
    ),
  );
}

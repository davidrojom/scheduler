import { computed, Directive, input } from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import { hlm, type ClassValue } from './utils';

export const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>i]:absolute [&>i]:left-4 [&>i]:top-4 [&>i]:text-foreground [&>i~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        destructive: 'border-destructive/50 text-destructive [&>i]:text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type AlertVariants = VariantProps<typeof alertVariants>;

@Directive({
  selector: '[hlmAlert]',
  standalone: true,
  host: {
    '[class]': '_computedClass()',
    '[attr.role]': '"alert"',
  },
})
export class HlmAlertDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  public readonly variant = input<AlertVariants['variant']>('default');

  protected readonly _computedClass = computed(() =>
    hlm(alertVariants({ variant: this.variant() }), this.userClass()),
  );
}

@Directive({
  selector: '[hlmAlertTitle]',
  standalone: true,
  host: { '[class]': '_computedClass()' },
})
export class HlmAlertTitleDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('mb-1 font-medium leading-none tracking-tight', this.userClass()),
  );
}

@Directive({
  selector: '[hlmAlertDescription]',
  standalone: true,
  host: { '[class]': '_computedClass()' },
})
export class HlmAlertDescriptionDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('text-sm [&_p]:leading-relaxed', this.userClass()),
  );
}

import { HlmButtonDirective } from './button';
import { HlmInputDirective } from './input';
import { HlmLabelDirective } from './label';
import { HlmBadgeDirective } from './badge';
import { HlmSeparatorDirective } from './separator';
import {
  HlmAlertDirective,
  HlmAlertTitleDirective,
  HlmAlertDescriptionDirective,
} from './alert';
import {
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardTitleDirective,
  HlmCardDescriptionDirective,
  HlmCardContentDirective,
  HlmCardFooterDirective,
} from './card';

export * from './utils';
export * from './button';
export * from './input';
export * from './label';
export * from './badge';
export * from './separator';
export * from './alert';
export * from './card';

/**
 * Spartan helm primitives, ready to drop into a standalone component's
 * `imports` array: `imports: [...SpartanUi]`.
 */
export const SpartanUi = [
  HlmButtonDirective,
  HlmInputDirective,
  HlmLabelDirective,
  HlmBadgeDirective,
  HlmSeparatorDirective,
  HlmAlertDirective,
  HlmAlertTitleDirective,
  HlmAlertDescriptionDirective,
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardTitleDirective,
  HlmCardDescriptionDirective,
  HlmCardContentDirective,
  HlmCardFooterDirective,
] as const;

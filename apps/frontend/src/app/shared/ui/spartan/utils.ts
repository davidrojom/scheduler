import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` (a.k.a. `hlm`) merges Tailwind class lists, resolving conflicts so the
 * last conflicting utility wins. This is the same helper Spartan's helm
 * components use to combine their base variants with consumer-provided classes.
 */
export function hlm(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}

export const cn = hlm;

export type { ClassValue };

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Below this baseline, a % delta swings wildly for a tiny absolute change
// (e.g. $0.17 avg vs $35.98 today reads as "+20,544%") — show the $ diff instead.
export const MIN_DELTA_BASELINE = 5

export interface DeltaInfo {
  diff: number            // value - avg, signed
  pct: number | null
  useAbs: boolean          // true when avg is too small for a % to be meaningful
}

export function computeDelta(value: number, avg: number | null | undefined): DeltaInfo | null {
  if (avg == null || avg <= 0.01) return null
  const diff = value - avg
  return { diff, pct: (diff / avg) * 100, useAbs: avg < MIN_DELTA_BASELINE }
}

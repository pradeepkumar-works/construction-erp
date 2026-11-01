'use client';

import { useAppearance } from '@/lib/appearance';
import { resolve, type Resolved } from './engine';

export function useResolved(): Resolved {
  const { dark, prefs } = useAppearance();
  return resolve(dark ? 'dark' : 'light', prefs.density);
}

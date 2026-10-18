'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { Grid } from 'antd';

/**
 * Below antd's `md` breakpoint (768 px): a phone (UX item 84). Lists show cards instead of a table, their filters sit
 * behind a Filters button, and a record's actions stick to the bottom of the screen. Until the first measure it is false,
 * so the desktop layout is what renders first.
 */
export const useIsPhone = () => Grid.useBreakpoint().md === false;

const onResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

/**
 * Which of these widths (CSS pixels) the window reaches, following resizes: a component re-renders only when the window
 * crosses one of them. Before the browser has measured, none.
 */
export function useWidthsReached(widths: readonly number[]): Set<number> {
  const key = useSyncExternalStore(
    onResize,
    () => widths.filter((w) => window.innerWidth >= w).join(','),
    () => '',
  );
  return useMemo(() => new Set(key ? key.split(',').map(Number) : []), [key]);
}

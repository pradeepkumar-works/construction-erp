'use client';

import { useSyncExternalStore } from 'react';
import { chromeCss, type ChromeChoice } from '@/ds';

/**
 * The menu's colours (Menu and names): the company's palette written over the chrome roles for the whole app, both themes.
 * While an admin tries colours on Menu and names, the choice on that screen shows here before it is saved.
 */
let preview: ChromeChoice | null = null;
const listeners = new Set<() => void>();

export function setChromePreview(choice: ChromeChoice | null) {
  preview = choice;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ShellColours({ choice }: { choice: ChromeChoice }) {
  const shown = useSyncExternalStore(subscribe, () => preview, () => null) ?? choice;
  const css = chromeCss(shown);
  return css ? <style data-chrome-colours="">{css}</style> : null;
}

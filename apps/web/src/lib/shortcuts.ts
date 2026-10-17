'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { readPref, writePref } from './prefs';

/**
 * Single-key shortcuts (J and K in lists and the inbox, A C R X O in Approvals, [ for the sidebar, ? for help) can be
 * turned off in Help > Keyboard shortcuts (UX item 81, WCAG 2.1.4), since speech input can fire them by accident.
 * On by default; kept per browser.
 */
const KEY = 'nirmaan.shortcuts.single';
const EVENT = 'nirmaan:shortcuts';

export const singleKeysOn = () => (typeof window === 'undefined' ? true : readPref<boolean>(KEY, true) !== false);

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

export function useSingleKeys(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, singleKeysOn, () => true);
  const set = useCallback((next: boolean) => {
    writePref(KEY, next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [on, set];
}

/** Mac keyboards use ⌘; Windows and Linux use Ctrl or Alt. */
export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Ask's shortcut: ⌘J on a Mac, Alt J elsewhere, since Ctrl J is the browser's Downloads on Windows and Linux.
 * `code` is used, not `key`, because Alt changes the character on some layouts.
 */
export const isAskShortcut = (e: KeyboardEvent) => e.code === 'KeyJ' && !e.shiftKey && (isMac() ? e.metaKey && !e.ctrlKey && !e.altKey : e.altKey && !e.ctrlKey && !e.metaKey);
export const askShortcutLabel = () => (isMac() ? '⌘J' : 'Alt J');
export const askShortcutKeys = () => (isMac() ? ['⌘', 'J'] : ['Alt', 'J']);

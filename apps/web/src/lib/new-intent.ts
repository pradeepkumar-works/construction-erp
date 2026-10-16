'use client';

import { useEffect, useRef } from 'react';

/** What the header's "+ New" menu can start. */
export type NewKind = 'dpr' | 'progress' | 'material-request' | 'expense' | 'risk' | 'purchase-order' | 'ra-bill';

const listeners = new Map<NewKind, Set<() => void>>();
/** Asked for before its page was open; the list picks it up when it mounts. */
let pending: { kind: NewKind; at: number } | null = null;
const PENDING_MS = 15_000;

/**
 * Starts a new entry: the list already on screen opens its form, otherwise `navigate` goes to the list's page and the
 * list opens the form as it mounts.
 */
export function requestNew(kind: NewKind, navigate: () => void) {
  const open = [...(listeners.get(kind) ?? [])].pop();
  if (open) {
    open();
    return;
  }
  pending = { kind, at: Date.now() };
  navigate();
}

/** A list with a "New" button calls this so the header's "+ New" can open its form. */
export function useNewIntent(kind: NewKind, enabled: boolean, open: () => void) {
  const ref = useRef(open);
  useEffect(() => {
    ref.current = open;
  });
  useEffect(() => {
    if (!enabled) return;
    if (pending?.kind === kind && Date.now() - pending.at < PENDING_MS) {
      pending = null;
      ref.current();
    }
    const fn = () => ref.current();
    const set = listeners.get(kind) ?? new Set();
    set.add(fn);
    listeners.set(kind, set);
    return () => {
      set.delete(fn);
    };
  }, [kind, enabled]);
}

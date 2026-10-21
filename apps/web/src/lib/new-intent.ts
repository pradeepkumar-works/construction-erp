'use client';

import { useEffect, useRef } from 'react';
import type { AiDraftDto } from '@erp/shared';

/** What the header's "+ New" menu can start, and Ask Nirmaan can draft. */
export type NewKind = 'dpr' | 'progress' | 'material-request' | 'expense' | 'risk' | 'purchase-order' | 'ra-bill' | 'letter' | 'payment-request';

type Open = (draft?: AiDraftDto) => void;
const listeners = new Map<NewKind, Set<Open>>();
/** Asked for before its page was open; the list picks it up when it mounts. */
let pending: { kind: NewKind; at: number; draft?: AiDraftDto } | null = null;
const PENDING_MS = 15_000;

/**
 * Starts a new entry: the list already on screen opens its form, otherwise `navigate` goes to the list's page and the
 * list opens the form as it mounts. With `draft` (from Ask Nirmaan, AI item 71) the form opens filled in.
 */
export function requestNew(kind: NewKind, navigate: () => void, draft?: AiDraftDto) {
  const open = [...(listeners.get(kind) ?? [])].pop();
  if (open) {
    open(draft);
    return;
  }
  pending = { kind, at: Date.now(), draft };
  navigate();
}

/** A list with a "New" button calls this so the header's "+ New" (and a draft from Ask Nirmaan) can open its form. */
export function useNewIntent(kind: NewKind, enabled: boolean, open: Open) {
  const ref = useRef(open);
  useEffect(() => {
    ref.current = open;
  });
  useEffect(() => {
    if (!enabled) return;
    if (pending?.kind === kind && Date.now() - pending.at < PENDING_MS) {
      const { draft } = pending;
      pending = null;
      ref.current(draft);
    }
    const fn: Open = (draft) => ref.current(draft);
    const set = listeners.get(kind) ?? new Set();
    set.add(fn);
    listeners.set(kind, set);
    return () => {
      set.delete(fn);
    };
  }, [kind, enabled]);
}

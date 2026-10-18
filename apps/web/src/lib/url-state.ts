'use client';

import { useCallback, useState } from 'react';

const readParam = (name: string): string | undefined => {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    // No URL to read (tests); start empty.
    return undefined;
  }
};

/** Sets (or, with no value, removes) one query parameter in the address bar, leaving the others (`?tab=`, `?id=`) alone. */
export function writeUrlParam(name: string, value?: string) {
  try {
    const sp = new URLSearchParams(window.location.search);
    if (value) sp.set(name, value);
    else sp.delete(name);
    const qs = sp.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', next);
  } catch {
    // Address bar not writable; the page still works.
  }
}

/**
 * One piece of a page's state kept in the URL (UX item 84), so a reload or a link sent on brings it back: the
 * Approvals inbox's search, type and order, a tab inside a tab. Read once when the component mounts.
 */
export function useUrlParam(name: string): [string | undefined, (value?: string) => void] {
  const [value, setValue] = useState(() => readParam(name));
  const set = useCallback(
    (next?: string) => {
      setValue(next || undefined);
      writeUrlParam(name, next);
    },
    [name],
  );
  return [value, set];
}

/**
 * A tab bar's open tab in the URL. It goes in `?sub=` by default, so it does not clash with the project page's `?tab=`
 * when the component is one of its tabs. `initial` is where a link (a notification's `?tab=`) asked it to start; the
 * parameter is left out while the tab is that one.
 */
export function useUrlTab<K extends string>(keys: readonly K[], fallback: K, opts: { param?: string; initial?: K } = {}): [K, (tab: K) => void] {
  const [raw, setRaw] = useUrlParam(opts.param ?? 'sub');
  const start = opts.initial && keys.includes(opts.initial) ? opts.initial : fallback;
  const tab = raw && keys.includes(raw as K) ? (raw as K) : start;
  const setTab = useCallback((k: K) => setRaw(k === start ? undefined : k), [setRaw, start]);
  return [tab, setTab];
}

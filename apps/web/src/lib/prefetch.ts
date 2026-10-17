'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { listStartQueryFor, recordQueryFor } from './queries';
import { useProjectScope } from './project-scope';

/** How long the pointer rests on a link before its page is fetched ahead: long enough to skip a pointer passing by. */
export const HOVER_INTENT_MS = 100;

/**
 * Fetching ahead (item 83): a record link fetches the record (and its page's code), a sidebar link its list's first page,
 * into the same queries the page then reads, so a click shows the page at once. Fresh data (`staleTime`) is not asked
 * for again, and a failed prefetch is silent: the page asks again and shows the error itself.
 */
export function usePrefetch() {
  const qc = useQueryClient();
  const router = useRouter();
  const [projectId] = useProjectScope();
  return useMemo(
    () => ({
      /** A record's own page (`/dpr/<id>`): the record the drawer and the page both read, and the route. */
      record(href?: string | null) {
        if (!href) return;
        router.prefetch(href);
        const q = recordQueryFor(href);
        if (q) void qc.prefetchQuery(q);
      },
      /** A sidebar link: the first page of its list, in the header's project where the list follows it. */
      list(href: string) {
        const q = listStartQueryFor(href, projectId);
        if (q) void qc.prefetchQuery(q);
      },
    }),
    [qc, router, projectId],
  );
}

/** Pointer and focus handlers that run `fetchAhead` when the pointer rests on an element, or at once when it takes focus. */
export function useHoverIntent(fetchAhead: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(fetchAhead);
  useEffect(() => {
    latest.current = fetchAhead;
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useMemo(
    () => ({
      onMouseEnter: () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => latest.current(), HOVER_INTENT_MS);
      },
      onMouseLeave: () => window.clearTimeout(timer.current),
      onFocus: () => latest.current(),
    }),
    [],
  );
}

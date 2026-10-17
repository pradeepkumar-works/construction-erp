'use client';

import React, { createContext, useContext, useEffect } from 'react';

/**
 * One breadcrumb per page (UX item 81). Where the header shows "Site › Daily reports", a page's own crumbs would repeat
 * it, so `PageHeader` hands its last crumb (the record's kind, the project's code) to the header instead of drawing a
 * second breadcrumb. Where the header has none (phones, pages outside the sidebar), the page draws its own.
 */
export interface PageTrail {
  /** The header is showing the trail on this page. */
  shown: boolean;
  setTail: (tail: string | null) => void;
}

export const PageTrailContext = createContext<PageTrail>({ shown: false, setTail: () => undefined });

export function usePageTrailTail(tail: string | null, enabled: boolean) {
  const { shown, setTail } = useContext(PageTrailContext);
  useEffect(() => {
    if (!enabled || !shown) return;
    setTail(tail);
    return () => setTail(null);
  }, [enabled, shown, tail, setTail]);
  return shown;
}

export function PageTrailProvider({ value, children }: { value: PageTrail; children: React.ReactNode }) {
  return <PageTrailContext.Provider value={value}>{children}</PageTrailContext.Provider>;
}

'use client';

import { useEffect } from 'react';
import { PRODUCT_NAME } from '@erp/shared';

/**
 * The browser tab's title for this page (UX item 81, WCAG 2.4.2): "Purchase orders · Nirmaan", or a record's own name
 * ("PO-2026-0012 · Tata Steel · Nirmaan"), so tabs, history, bookmarks and the screen reader's page-change announcement
 * tell pages apart. `PageHeader` and record pages call it; a page without a `PageHeader` calls it itself.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${PRODUCT_NAME}`;
    return () => {
      document.title = PRODUCT_NAME;
    };
  }, [title]);
}

/** Plain text of a heading, for the tab title: a string as it is, anything else left to the caller. */
export const textOf = (node: unknown): string | null => (typeof node === 'string' || typeof node === 'number' ? String(node) : null);

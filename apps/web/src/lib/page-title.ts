'use client';

import { useEffect } from 'react';
import { PRODUCT_NAME } from '@erp/shared';

/** The page whose title is showing; only it puts the title back. */
let owner: symbol | null = null;

/**
 * The browser tab's title for this page (UX item 81, WCAG 2.4.2): "Purchase orders · Nirmaan", or a record's own name
 * ("PO-2026-0012 · Tata Steel · Nirmaan"), so tabs, history, bookmarks and the screen reader's page-change announcement
 * tell pages apart. `PageHeader` and record pages call it; a page without a `PageHeader` calls it itself.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const want = `${title} · ${PRODUCT_NAME}`;
    const me = Symbol(title);
    owner = me;
    document.title = want;
    // Next.js can write the layout's own <title> back after the page has set its own (a page that streams in late);
    // the page that set the title last puts it back.
    const observer = new MutationObserver(() => {
      if (owner === me && document.title !== want) document.title = want;
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      if (owner === me) owner = null;
      document.title = PRODUCT_NAME;
    };
  }, [title]);
}

/** Plain text of a heading, for the tab title: a string as it is, anything else left to the caller. */
export const textOf = (node: unknown): string | null => (typeof node === 'string' || typeof node === 'number' ? String(node) : null);

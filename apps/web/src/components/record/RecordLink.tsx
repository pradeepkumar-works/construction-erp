'use client';

import React from 'react';
import { Typography } from 'antd';
import { useHoverIntent, usePrefetch } from '@/lib/prefetch';

/**
 * A record's number or name in a list: a click opens the quick look, while Ctrl or Cmd click, a middle click or
 * "Open in new tab" go to the record's own page, since it is a real link. A type without its own page
 * yet passes no `href`: it is then a button that looks like a link, so it still takes focus and opens on Enter or Space
 * (a link without `href` cannot be reached from the keyboard). With `href`, resting the pointer on it or
 * focusing it fetches the record ahead, for the quick look and the page alike; `data-record-link` lets its row
 * do the same. Its text is a number or a name, so a browser's translation leaves it alone (`translate="no"`).
 */
export function RecordLink({ href, onOpen, strong, className, children }: { href?: string; onOpen: () => void; strong?: boolean; className?: string; children: React.ReactNode }) {
  const prefetch = usePrefetch();
  const ahead = useHoverIntent(() => prefetch.record(href));
  if (!href)
    return (
      // eslint-disable-next-line jsx-a11y/anchor-is-valid -- deliberately a button with a link's look (role="button", Space below, Enter by the anchor), see above
      <Typography.Link
        href="#"
        role="button"
        translate="no"
        strong={strong}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key !== ' ') return;
          e.preventDefault();
          onOpen();
        }}
      >
        {children}
      </Typography.Link>
    );
  return (
    <Typography.Link
      href={href}
      strong={strong}
      className={className}
      data-record-link=""
      translate="no"
      {...ahead}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen();
      }}
    >
      {children}
    </Typography.Link>
  );
}

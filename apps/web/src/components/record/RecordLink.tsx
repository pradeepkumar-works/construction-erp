'use client';

import React from 'react';
import { Typography } from 'antd';

/**
 * A record's number or name in a list: a click opens the quick look, while Ctrl or Cmd click, a middle click or
 * "Open in new tab" go to the record's own page, since it is a real link (UI roadmap item 57). A type without its own page
 * yet passes no `href`: it is then a button that looks like a link, so it still takes focus and opens on Enter or Space
 * (UX item 81; a link without `href` cannot be reached from the keyboard).
 */
export function RecordLink({ href, onOpen, strong, className, children }: { href?: string; onOpen: () => void; strong?: boolean; className?: string; children: React.ReactNode }) {
  if (!href)
    return (
      <Typography.Link
        href="#"
        role="button"
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

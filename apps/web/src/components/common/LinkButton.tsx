'use client';

import React from 'react';
import { Button, type ButtonProps } from 'antd';
import { useRouter } from 'next/navigation';

/**
 * A link that looks like a button: one `<a>` with antd's button styles, so there is no `<button>` inside a
 * `<Link>` (invalid HTML and two Tab stops). A plain click moves within the app; Ctrl or Cmd click and a middle click open
 * a new tab as any link does.
 */
export function LinkButton({ href, onClick, onMouseEnter, ...props }: Omit<ButtonProps, 'href'> & { href: string }) {
  const router = useRouter();
  return (
    <Button
      {...props}
      href={href}
      onMouseEnter={(e) => {
        router.prefetch(href);
        onMouseEnter?.(e);
      }}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        router.push(href);
      }}
    />
  );
}

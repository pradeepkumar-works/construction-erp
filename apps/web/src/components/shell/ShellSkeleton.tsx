'use client';

import React, { useLayoutEffect, useState } from 'react';
import { tk } from '@/ds';
import { AppearanceProvider } from '@/lib/appearance';
import { readPref } from '@/lib/prefs';
import { PageSkeleton } from '@/components/common/QueryState';
import { PREF_RAIL } from './Sidebar';
import s from './Sidebar.module.css';

/**
 * What shows while the sign-in is checked, in place of a spinner on a blank screen: the sidebar at its width
 * (or its rail), the header bar and a page of placeholders, where the shell will draw them, so the app appears in place.
 * The server's HTML has only the sidebar, the same navy in both themes; the rest follows in the user's theme as soon as
 * the browser has read it.
 */
export function ShellSkeleton() {
  const [rail, setRail] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    setRail(readPref<boolean | null>(PREF_RAIL, null) ?? window.innerWidth < 1100);
  }, []);
  if (rail === null) return <Frame rail={false} />;
  return (
    <AppearanceProvider>
      <Frame rail={rail} body />
    </AppearanceProvider>
  );
}

function Frame({ rail, body }: { rail: boolean; body?: boolean }) {
  return (
    <div role="status" style={{ display: 'flex', minHeight: '100vh' }} aria-busy="true" aria-label="Loading">
      <div className={`${s.aside} ${s.asideSkeleton} ${rail ? s.asideRail : ''}`} style={{ background: tk.color.chrome.bg }} aria-hidden="true" />
      {body ? <Body /> : null}
    </div>
  );
}

function Body() {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ height: 56, background: tk.color.surface.base, borderBottom: tk.line('hairline') }} />
      <div className="page-container">
        <PageSkeleton />
      </div>
    </div>
  );
}

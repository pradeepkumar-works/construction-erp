'use client';

import React from 'react';
import { tk } from '@/ds';
import { useAppearance } from '@/lib/appearance';

/** Illustrations in public/illustrations drawn for empty lists; each has a `-night` copy in the dark theme's colours. */
const ART = {
  projects: 'empty-no-projects',
  entries: 'empty-no-entries',
  approved: 'empty-all-approved',
} as const;

export type EmptyArtKind = keyof typeof ART;

/** Inside a project's tabs a list is a section of the page, so its empty state is a line, not the first-run picture. */
export const EmptyInline = React.createContext(false);

export function EmptyArt({ art, title, children }: { art: EmptyArtKind; title: React.ReactNode; children?: React.ReactNode }) {
  const { dark } = useAppearance();
  if (React.useContext(EmptyInline)) return <EmptyLine title={title}>{children}</EmptyLine>;
  return (
    <div style={{ padding: `${tk.space[4]} 0 ${tk.space[6]}`, textAlign: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG illustration, which next/image would serve unoptimised as it is */}
      <img src={`/illustrations/${ART[art]}${dark ? '-night' : ''}.svg`} alt="" width={240} height={180} style={{ display: 'block', margin: `0 auto ${tk.space[2]}`, maxWidth: '100%', height: 'auto' }} />
      <div style={{ color: tk.color.text.muted }}>{title}</div>
      {children ? <div style={{ marginTop: tk.space[3] }}>{children}</div> : null}
    </div>
  );
}

export function EmptyLine({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ padding: `${tk.space[3]} 0`, textAlign: 'center', color: tk.color.text.muted }}>
      {title}
      {children ? <div style={{ marginTop: tk.space[2] }}>{children}</div> : null}
    </div>
  );
}

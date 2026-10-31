'use client';

import React from 'react';
import { theme } from 'antd';
import { useAppearance } from '@/lib/appearance';

/** Illustrations in public/illustrations drawn for empty lists; each has a `-night` copy in the dark theme's colours. */
const ART = {
  projects: 'empty-no-projects',
  entries: 'empty-no-entries',
  approved: 'empty-all-approved',
} as const;

export type EmptyArtKind = keyof typeof ART;

/** A whole list page's first run: the illustration over one line. */
export function EmptyArt({ art, title, children }: { art: EmptyArtKind; title: React.ReactNode; children?: React.ReactNode }) {
  const { token } = theme.useToken();
  const { dark } = useAppearance();
  return (
    <div style={{ padding: '16px 0 24px', textAlign: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG illustration, which next/image would serve unoptimised as it is */}
      <img src={`/illustrations/${ART[art]}${dark ? '-night' : ''}.svg`} alt="" width={240} height={180} style={{ display: 'block', margin: '0 auto 8px', maxWidth: '100%', height: 'auto' }} />
      <div style={{ color: token.colorTextSecondary }}>{title}</div>
      {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

export function EmptyLine({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <div style={{ padding: `${token.paddingSM}px 0`, textAlign: 'center', color: token.colorTextSecondary }}>
      {title}
      {children ? <div style={{ marginTop: token.marginXS }}>{children}</div> : null}
    </div>
  );
}

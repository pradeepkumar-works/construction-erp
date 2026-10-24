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

/** An empty list with an illustration: use as a Table's `locale.emptyText` or on its own. */
export function EmptyArt({ art, title, children, size = 'default' }: { art: EmptyArtKind; title: React.ReactNode; children?: React.ReactNode; /** `small` inside a card or a table in a tab. */ size?: 'default' | 'small' }) {
  const { token } = theme.useToken();
  const { dark } = useAppearance();
  const small = size === 'small';
  return (
    <div style={{ padding: small ? '8px 0 12px' : '16px 0 24px', textAlign: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG illustration, which next/image would serve unoptimised as it is */}
      <img
        src={`/illustrations/${ART[art]}${dark ? '-night' : ''}.svg`}
        alt=""
        width={small ? 128 : 240}
        height={small ? 96 : 180}
        style={{ display: 'block', margin: '0 auto 8px', maxWidth: '100%', height: 'auto' }}
      />
      <div style={{ color: token.colorTextSecondary }}>{title}</div>
      {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

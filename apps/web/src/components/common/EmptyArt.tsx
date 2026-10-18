import React from 'react';
import { themeColor } from '@/lib/theme';

/** Illustrations in public/illustrations drawn for empty lists. */
const ART = {
  projects: '/illustrations/empty-no-projects.svg',
  entries: '/illustrations/empty-no-entries.svg',
  approved: '/illustrations/empty-all-approved.svg',
} as const;

export type EmptyArtKind = keyof typeof ART;

/** An empty list with an illustration: use as a Table's `locale.emptyText` or on its own. */
export function EmptyArt({ art, title, children }: { art: EmptyArtKind; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 0 24px', textAlign: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG illustration, which next/image would serve unoptimised as it is */}
      <img src={ART[art]} alt="" width={240} height={180} style={{ display: 'block', margin: '0 auto 8px', maxWidth: '100%', height: 'auto' }} />
      <div style={{ color: themeColor('colorTextSecondary') }}>{title}</div>
      {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

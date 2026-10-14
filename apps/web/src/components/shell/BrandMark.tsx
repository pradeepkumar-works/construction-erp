import React from 'react';
import { BRAND } from '@/lib/brand';

/** The logo mark (a heavy N on a datum line, on hi-vis yellow) used in the sidebar, the mobile header and the sign-in card. Same drawing as app/icon.svg. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ flex: '0 0 auto', display: 'block' }} aria-hidden>
      <rect width="64" height="64" rx="12" fill={BRAND.colors.accent} />
      <path d="M15 46V12h9.5l15 20.5V12H49v34h-9.5L24.5 25.5V46z" fill={BRAND.colors.ink} />
      <rect x="15" y="50" width="34" height="3" rx="1.5" fill={BRAND.colors.ink} />
    </svg>
  );
}

/** "NIRMAAN" in the display face, for the sidebar and sign-in card. */
export function Wordmark({ color, size = 17 }: { color?: string; size?: number }) {
  return (
    <span className="wordmark" style={{ color, fontSize: size }}>
      {BRAND.wordmark}
    </span>
  );
}

import React from 'react';
import { BRAND } from '@/lib/brand';

/** The square logo mark used in the sidebar, the mobile header and the sign-in card. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, fontSize: Math.round(size * 0.47) }} aria-hidden>
      {BRAND.monogram}
    </span>
  );
}

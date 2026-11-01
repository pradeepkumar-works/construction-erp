/**
 * Product name and brand colours in one place. The antd theme (`lib/theme.ts`), the shell, the sign-in pages,
 * the printable DPR and progress report all read from here, and `lib/theme.ts` declares each colour as a
 * `--brand-*` CSS variable for the CSS files, so a rebrand is a change to this file, `BrandMark` and `app/icon.svg`.
 */
import { PRODUCT_NAME } from '@erp/shared';
import { PALETTE } from '@/ds/source/palette';

export const BRAND = {
  name: PRODUCT_NAME,
  /** The name as set in the wordmark (condensed capitals). */
  wordmark: 'NIRMAAN',
  description: 'Site progress, billing, purchases, quality and approvals for construction contractors',
  colors: PALETTE,
} as const;

type Family = 'work' | 'materials' | 'buying' | 'money' | 'people' | 'business' | 'insight' | 'admin';
const cap = (f: Family) => (f[0].toUpperCase() + f.slice(1)) as Capitalize<Family>;

/** A module family's icon colour and fill, for the theme in use (the night fill is the icon colour at 16%). */
export function familyColors(family: Family | undefined, dark: boolean): { fg: string; bg: string } {
  const c = BRAND.colors;
  const k = cap(family ?? 'work');
  if (dark) {
    const fg = c[`family${k}Night`];
    return { fg, bg: `color-mix(in srgb, ${fg} 16%, transparent)` };
  }
  return { fg: c[`family${k}`], bg: c[`family${k}Bg`] };
}


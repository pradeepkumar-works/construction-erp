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


/**
 * The product's name and words in one place. Its colours are the design tokens (`src/ds/source/`, read through `tk`),
 * so a rebrand is a change there, to this file, `BrandMark` and `app/icon.svg`.
 */
import { PRODUCT_NAME } from '@erp/shared';

export const BRAND = {
  name: PRODUCT_NAME,
  /** The name as set in the wordmark (condensed capitals). */
  wordmark: 'NIRMAAN',
  description: 'Site progress, billing, purchases, quality and approvals for construction contractors',
} as const;

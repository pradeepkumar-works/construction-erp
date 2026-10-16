/**
 * Product name and brand colours in one place. The antd theme (`lib/theme.ts`), the shell, the sign-in pages,
 * the printable DPR and progress report all read from here, and `lib/theme.ts` declares each colour as a
 * `--brand-*` CSS variable for the CSS files, so a rebrand is a change to this file, `BrandMark` and `app/icon.svg`.
 */
import { PRODUCT_NAME } from '@erp/shared';

export const BRAND = {
  name: PRODUCT_NAME,
  /** The name as set in the wordmark (condensed capitals). */
  wordmark: 'NIRMAAN',
  description: 'Site progress, billing, purchases, quality and approvals for construction contractors',
  colors: {
    /** Nirmaan blue: antd primary (buttons, checkboxes, tabs, progress bars, the selected menu item). */
    primary: '#1E63D6',
    /** Menu hover on the navy sidebar. */
    primaryDeep: '#17345E',
    /** Blueprint navy: the sidebar, the sign-in page, headings in printed reports. */
    ink: '#0B1F3A',
    inkDeep: '#061328',
    /** Nirmaan blue: the mark, primary buttons, the selected menu item. Text on it is `onAccent`. */
    accent: '#1E63D6',
    accentDeep: '#164FB3',
    /** A lighter blue for text and icons on the navy (the wordmark's surroundings, landing page highlights). */
    accentLight: '#6EA8FF',
    onAccent: '#FFFFFF',
    /** Links: a deeper blue that reads on white. */
    link: '#1A56BF',
    /** Pending and alerts (brick orange, so it never reads as the brand blue). */
    pending: '#C2410C',
    /** Approve and pass buttons, and figures that are good news (a positive margin). */
    success: '#1F9D55',
    /** Overdue amounts, losses and other figures that need attention (antd red-7, which reads on white). */
    danger: '#CF1322',
    canvas: '#F3F6FA',
    border: '#DCE3ED',
    /** Secondary text on white (subtitles), and quieter captions and footers. */
    muted: '#5B6779',
    subtle: '#8A94A3',
    /** A pale blue fill behind a selected chip. */
    accentSoft: '#EEF4FD',
    /** Series colours in charts, beside the primary blue (cost heads: expenses, machinery, labour, subcontract). */
    chartViolet: '#7C3AED',
    chartAmber: '#D97706',
    chartTeal: '#0F766E',
    chartPink: '#BE185D',
    /** The website's body text, captions, hairlines and the browser-frame bar on its screenshots. */
    siteText: '#3B4A5F',
    siteMuted: '#64748B',
    siteRule: '#E3E9F1',
    siteFrame: '#F7F9FC',
  },
} as const;

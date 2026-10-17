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
    /** Approve and pass buttons, and figures that are good news (a positive margin). Dark enough for white text on it and for text on white (WCAG AA). */
    success: '#167A3E',
    /** Overdue amounts, losses and other figures that need attention (antd red-7, which reads on white). */
    danger: '#CF1322',
    canvas: '#F3F6FA',
    border: '#DCE3ED',
    /** Secondary text on white (subtitles), and quieter captions and footers. */
    muted: '#5B6779',
    /** The quietest text on white that still meets WCAG AA (4.5:1): captions, footers. */
    subtle: '#64748B',
    /** antd's tertiary and placeholder text (descriptions, Typography secondary, empty fields), darkened from 45% and 25% black to meet AA. */
    textTertiary: 'rgba(0, 0, 0, 0.58)',
    textPlaceholder: 'rgba(0, 0, 0, 0.55)',
    /** Section titles on the navy sidebar. */
    inkCaption: 'rgba(255, 255, 255, 0.6)',
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
    /** Dark mode surfaces: a near-neutral night with a little of the blueprint navy (page, cards, menus and popups). */
    nightLayout: '#0B1119',
    nightSurface: '#121A25',
    nightElevated: '#18222F',
    nightBorder: '#2B3747',
    nightBorderSoft: '#202B39',
    /** Dark mode text, and links that read on the night surfaces. */
    nightText: '#E3EAF4',
    nightLink: '#6EA8FF',
    /** Dark mode tertiary and placeholder text: nightText at 62% and 58%, which keep 4.5:1 on every night surface. */
    nightTextTertiary: 'rgba(227, 234, 244, 0.62)',
    nightTextPlaceholder: 'rgba(227, 234, 244, 0.58)',
    /** Dark mode danger buttons: a red that reads on the night surfaces as text, with night-ink text when it is the fill. */
    nightDanger: '#F26D6F',
  },
} as const;

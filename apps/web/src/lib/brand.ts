/**
 * Product name and brand colours in one place. The antd theme (providers.tsx), the shell, the sign-in pages,
 * the printable DPR and progress report and the CSS variables in globals.css all read from here, so a
 * rebrand is a change to this file, `BrandMark` and `app/icon.svg`.
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
    /** Approve and pass buttons. */
    success: '#1F9D55',
    canvas: '#F3F6FA',
    border: '#DCE3ED',
  },
} as const;

/** CSS custom properties for globals.css; set on <html> by the root layout. */
export const brandCssVars: Record<string, string> = {
  '--brand-primary': BRAND.colors.primary,
  '--brand-primary-deep': BRAND.colors.primaryDeep,
  '--brand-ink': BRAND.colors.ink,
  '--brand-ink-deep': BRAND.colors.inkDeep,
  '--brand-accent': BRAND.colors.accent,
  '--brand-accent-deep': BRAND.colors.accentDeep,
  '--brand-accent-light': BRAND.colors.accentLight,
  '--brand-on-accent': BRAND.colors.onAccent,
  '--brand-link': BRAND.colors.link,
  '--brand-canvas': BRAND.colors.canvas,
  '--brand-border': BRAND.colors.border,
};

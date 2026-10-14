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
  description: 'Projects, BOQ, site progress, DPR and approvals for construction contractors',
  colors: {
    /** Signboard black: antd primary (checkboxes, tabs, progress bars), sidebar, headings in printed reports. */
    primary: '#1C1F1E',
    /** Menu hover on the dark sidebar. */
    primaryDeep: '#2E3230',
    ink: '#1C1F1E',
    inkDeep: '#0E100F',
    /** Hi-vis yellow: the mark, primary buttons, the selected menu item. Text on it is `ink`. */
    accent: '#FFC20E',
    accentDeep: '#E0A800',
    /** Links: a dark amber that reads on white. */
    link: '#8A5A00',
    /** Pending and alerts (brick orange; yellow is the brand, so it cannot also mean "pending"). */
    pending: '#C2410C',
    /** Approve and pass buttons. */
    success: '#1F9D55',
    canvas: '#F4F3EF',
    border: '#E3E1DA',
  },
} as const;

/** CSS custom properties for globals.css; set on <html> by the root layout. */
export const brandCssVars: Record<string, string> = {
  '--brand-primary': BRAND.colors.primary,
  '--brand-ink': BRAND.colors.ink,
  '--brand-ink-deep': BRAND.colors.inkDeep,
  '--brand-accent': BRAND.colors.accent,
  '--brand-accent-deep': BRAND.colors.accentDeep,
  '--brand-link': BRAND.colors.link,
  '--brand-canvas': BRAND.colors.canvas,
  '--brand-border': BRAND.colors.border,
};

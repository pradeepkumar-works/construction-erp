/**
 * Product name and brand colours in one place. The antd theme (providers.tsx), the shell, the sign-in pages,
 * the printable DPR and progress report and the CSS variables in globals.css all read from here, so a
 * rebrand is a change to this file, `BrandMark` and `app/icon.svg`.
 */
export const BRAND = {
  name: 'Construction ERP',
  description: 'Projects, BOQ, site progress, DPR and approvals for construction contractors',
  /** Letters on the square mark until a logo replaces them. */
  monogram: 'CE',
  colors: {
    /** Buttons, links, selected menu item, progress bars. */
    primary: '#1659a8',
    /** Menu hover on the dark sidebar. */
    primaryDeep: '#163a68',
    /** Sidebar, headings in printed reports. */
    ink: '#0f2a4d',
    inkDeep: '#091a30',
    /** The mark and highlights. */
    accent: '#f59e0b',
    accentDeep: '#d97706',
    canvas: '#f3f5f8',
    border: '#e6e9ef',
  },
} as const;

/** CSS custom properties for globals.css; set on <html> by the root layout. */
export const brandCssVars: Record<string, string> = {
  '--brand-primary': BRAND.colors.primary,
  '--brand-ink': BRAND.colors.ink,
  '--brand-ink-deep': BRAND.colors.inkDeep,
  '--brand-accent': BRAND.colors.accent,
  '--brand-accent-deep': BRAND.colors.accentDeep,
  '--brand-canvas': BRAND.colors.canvas,
  '--brand-border': BRAND.colors.border,
};

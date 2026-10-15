import type { SubmissionStatus } from '@erp/shared';

/**
 * Nirmaan palette (same as the web app's src/lib/brand.ts). `primary` is Nirmaan blue for links, icons and
 * selection, `primaryDark` the blueprint navy for big figures; `brand` is the same blue for the mark and primary
 * buttons, always with `onBrand` (white) text. "Pending" uses brick orange (`warning`) so it never reads as the brand.
 */
export const colors = {
  primary: '#1E63D6',
  primaryDark: '#0B1F3A',
  primarySoft: '#E6EEFB',
  brand: '#1E63D6',
  brandSoft: '#DCE8FB',
  onBrand: '#FFFFFF',
  accent: '#EA580C',
  accentSoft: '#FFEDD5',
  bg: '#F3F6FA',
  surface: '#FFFFFF',
  border: '#DCE3ED',
  text: '#0F1B2D',
  textMuted: '#5B6779',
  textOnPrimary: '#FFFFFF',
  success: '#1B7F4B',
  successSoft: '#E2F3E9',
  warning: '#C2410C',
  warningSoft: '#FDE9DD',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#7C3AED',
  infoSoft: '#EDE9FE',
  neutral: '#4B5563',
  neutralSoft: '#E5E7EB',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

/** Archivo for headings and the wordmark, loaded in app/_layout.tsx; body text stays on the system font. */
export const fonts = { display: 'Archivo_700Bold', displayHeavy: 'Archivo_800ExtraBold' };

export const typography = {
  h1: { fontSize: 26, fontFamily: fonts.display, color: colors.text },
  h2: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  wordmark: { fontSize: 30, fontFamily: fonts.displayHeavy, letterSpacing: 3, color: colors.text },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
};

/** Minimum touch target height for site use (gloves, sunlight). */
export const touch = { height: 52, heightSm: 44 };

export const statusTone: Record<SubmissionStatus, { fg: string; bg: string }> = {
  DRAFT: { fg: colors.neutral, bg: colors.neutralSoft },
  SUBMITTED: { fg: colors.warning, bg: colors.warningSoft },
  APPROVED: { fg: colors.success, bg: colors.successSoft },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft },
  CHANGES_REQUESTED: { fg: colors.info, bg: colors.infoSoft },
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

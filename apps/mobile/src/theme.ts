import type { SubmissionStatus } from '@erp/shared';

export const colors = {
  primary: '#1D4ED8',
  primaryDark: '#1E3A8A',
  primarySoft: '#DBEAFE',
  accent: '#F97316',
  accentSoft: '#FFEDD5',
  bg: '#F3F4F6',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111827',
  textMuted: '#6B7280',
  textOnPrimary: '#FFFFFF',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#7C3AED',
  infoSoft: '#EDE9FE',
  neutral: '#4B5563',
  neutralSoft: '#E5E7EB',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

export const typography = {
  h1: { fontSize: 26, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
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

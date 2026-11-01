import type { RiskLevel, RiskStatus } from '@erp/shared';
import { colors, toneIcon, type Tone } from '../theme';

/** Each level and status with a shape as well as a colour. */
export const LEVEL_TONE: Record<RiskLevel, Tone> = {
  LOW: { fg: colors.success, bg: colors.successSoft, icon: 'arrow-down-circle-outline' },
  MEDIUM: { fg: colors.warning, bg: colors.warningSoft, icon: 'remove-circle-outline' },
  HIGH: { fg: colors.danger, bg: colors.dangerSoft, icon: 'arrow-up-circle' },
};

export const RISK_STATUS_TONE: Record<RiskStatus, Tone> = {
  OPEN: { fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.alert },
  MONITORING: { fg: colors.primary, bg: colors.primarySoft, icon: toneIcon.watch },
  CLOSED: { fg: colors.neutral, bg: colors.neutralSoft, icon: toneIcon.closed },
};

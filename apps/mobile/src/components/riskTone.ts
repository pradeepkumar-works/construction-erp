import type { RiskLevel, RiskStatus } from '@erp/shared';
import { colors } from '../theme';

export const LEVEL_TONE: Record<RiskLevel, { fg: string; bg: string }> = {
  LOW: { fg: colors.success, bg: colors.successSoft },
  MEDIUM: { fg: colors.warning, bg: colors.warningSoft },
  HIGH: { fg: colors.danger, bg: colors.dangerSoft },
};

export const RISK_STATUS_TONE: Record<RiskStatus, { fg: string; bg: string }> = {
  OPEN: { fg: colors.danger, bg: colors.dangerSoft },
  MONITORING: { fg: colors.primary, bg: colors.primarySoft },
  CLOSED: { fg: colors.neutral, bg: colors.neutralSoft },
};

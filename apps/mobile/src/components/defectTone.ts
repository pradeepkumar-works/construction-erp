import type { DefectPriority, DefectStatus } from '@erp/shared';
import { colors } from '../theme';

export const DEFECT_TONE: Record<DefectPriority, { fg: string; bg: string }> = {
  LOW: { fg: colors.neutral, bg: colors.neutralSoft },
  MEDIUM: { fg: colors.warning, bg: colors.warningSoft },
  HIGH: { fg: colors.danger, bg: colors.dangerSoft },
};

export const DEFECT_STATUS_TONE: Record<DefectStatus, { fg: string; bg: string }> = {
  OPEN: { fg: colors.warning, bg: colors.warningSoft },
  FIXED: { fg: colors.info, bg: colors.infoSoft },
  CLOSED: { fg: colors.success, bg: colors.successSoft },
};

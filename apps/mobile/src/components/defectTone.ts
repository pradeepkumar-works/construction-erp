import type { DefectPriority, DefectStatus } from '@erp/shared';
import { colors, toneIcon, type Tone } from '../theme';

/** Each priority and status with a shape as well as a colour. */
export const DEFECT_TONE: Record<DefectPriority, Tone> = {
  LOW: { fg: colors.neutral, bg: colors.neutralSoft, icon: 'arrow-down-circle-outline' },
  MEDIUM: { fg: colors.warning, bg: colors.warningSoft, icon: 'remove-circle-outline' },
  HIGH: { fg: colors.danger, bg: colors.dangerSoft, icon: 'arrow-up-circle' },
};

export const DEFECT_STATUS_TONE: Record<DefectStatus, Tone> = {
  OPEN: { fg: colors.warning, bg: colors.warningSoft, icon: toneIcon.open },
  FIXED: { fg: colors.info, bg: colors.infoSoft, icon: 'construct-outline' },
  CLOSED: { fg: colors.success, bg: colors.successSoft, icon: toneIcon.done },
};

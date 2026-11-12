import type { DefectPriority, DefectStatus } from '@erp/shared';
import { colors, toneIcon, toneOf, type Tone } from '../theme';

/** Each priority and status with a shape as well as a colour. */
export const DEFECT_TONE: Record<DefectPriority, Tone> = {
  LOW: { fg: colors.neutral, bg: colors.neutralSoft, icon: 'arrow-down-circle-outline' },
  MEDIUM: { fg: colors.warning, bg: colors.warningSoft, icon: 'remove-circle-outline' },
  HIGH: { fg: colors.danger, bg: colors.dangerSoft, icon: 'arrow-up-circle' },
};

export const DEFECT_STATUS_TONE: Record<DefectStatus, Tone> = {
  OPEN: toneOf('defect', 'OPEN', toneIcon.open),
  FIXED: toneOf('defect', 'FIXED', 'construct-outline'),
  CLOSED: toneOf('defect', 'CLOSED', toneIcon.done),
};

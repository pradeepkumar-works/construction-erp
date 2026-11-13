import type { RiskLevel, RiskStatus } from '@erp/shared';
import { colors, toneIcon, toneOf, type Tone } from '../theme';

/** Each level and status with a shape as well as a colour. */
export const LEVEL_TONE: Record<RiskLevel, Tone> = {
  LOW: { fg: colors.success, bg: colors.successSoft, icon: 'arrow-down-circle-outline' },
  MEDIUM: { fg: colors.warning, bg: colors.warningSoft, icon: 'remove-circle-outline' },
  HIGH: { fg: colors.danger, bg: colors.dangerSoft, icon: 'arrow-up-circle' },
};

export const RISK_STATUS_TONE: Record<RiskStatus, Tone> = {
  OPEN: toneOf('risk', 'OPEN', toneIcon.alert),
  MONITORING: toneOf('risk', 'MONITORING', toneIcon.watch),
  CLOSED: toneOf('risk', 'CLOSED'),
};

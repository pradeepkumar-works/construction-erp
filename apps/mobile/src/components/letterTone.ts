import type { LetterStatus } from '@erp/shared';
import { colors, type IconName, type Tone } from '../theme';

/** A letter's status on the phone, by what it means (item 136). */
export const LETTER_STATUS_TONE: Record<LetterStatus, Tone & { icon: IconName }> = {
  DRAFT: { fg: colors.neutral, bg: colors.neutralSoft, icon: 'ellipse-outline' },
  AWAITING_APPROVAL: { fg: colors.warning, bg: colors.warningSoft, icon: 'time-outline' },
  ISSUED: { fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' },
  OPEN: { fg: colors.primary, bg: colors.primarySoft, icon: 'mail-unread-outline' },
  CLOSED: { fg: colors.neutral, bg: colors.neutralSoft, icon: 'lock-closed-outline' },
};

import type { RfiAge, RfiStatus } from '@erp/shared';
import { RFI_STATUS_LABELS } from '@erp/shared';
import { colors, toneIcon } from '../theme';
import type { TranslateVars } from '../i18n/translate';

type Translate = (en: string, vars?: TranslateVars) => string;

type Tone = { text: string; fg: string; bg: string; icon: (typeof toneIcon)[keyof typeof toneIcon] };

/** An RFI's status pill: "N days overdue" in words while late, else its status. */
export function rfiStatus(status: RfiStatus, age: RfiAge, t: Translate): Tone {
  if (status === 'OPEN' && age.overdue) return { text: age.daysOverdue === 1 ? t('1 day overdue') : t('{n} days overdue', { n: age.daysOverdue }), fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.alert };
  if (status === 'OPEN') return { text: t(RFI_STATUS_LABELS.OPEN), fg: colors.primary, bg: colors.primarySoft, icon: toneIcon.waiting };
  if (status === 'ANSWERED') return { text: t(RFI_STATUS_LABELS.ANSWERED), fg: colors.warning, bg: colors.warningSoft, icon: toneIcon.info };
  if (status === 'CLOSED') return { text: t(RFI_STATUS_LABELS.CLOSED), fg: colors.success, bg: colors.successSoft, icon: toneIcon.done };
  return { text: t(RFI_STATUS_LABELS.WITHDRAWN), fg: colors.neutral, bg: colors.neutralSoft, icon: toneIcon.closed };
}

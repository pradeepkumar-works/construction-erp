import type { RfiAge, RfiStatus } from '@erp/shared';
import { RFI_STATUS_LABELS } from '@erp/shared';
import { colors, toneIcon, toneOf } from '../theme';
import type { TranslateVars } from '../i18n/translate';

type Translate = (en: string, vars?: TranslateVars) => string;

type Tone = { text: string; fg: string; bg: string; icon: (typeof toneIcon)[keyof typeof toneIcon] };

/** An RFI's status pill: "N days overdue" in words while late, else its status. */
export function rfiStatus(status: RfiStatus, age: RfiAge, t: Translate): Tone {
  if (status === 'OPEN' && age.overdue) return { text: age.daysOverdue === 1 ? t('1 day overdue') : t('{n} days overdue', { n: age.daysOverdue }), fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.alert };
  const icon = status === 'OPEN' ? toneIcon.waiting : status === 'ANSWERED' ? toneIcon.info : status === 'CLOSED' ? toneIcon.done : toneIcon.closed;
  const { fg, bg } = toneOf('rfi', status);
  return { text: t(RFI_STATUS_LABELS[status]), fg, bg, icon };
}

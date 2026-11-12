import type { LetterStatus } from '@erp/shared';
import { toneOf, type IconName, type Tone } from '../theme';

/** A letter's status on the phone, by what it means (`statusTone('letter', …)`). */
export const LETTER_STATUS_TONE: Record<LetterStatus, Tone & { icon: IconName }> = {
  DRAFT: toneOf('letter', 'DRAFT'),
  AWAITING_APPROVAL: toneOf('letter', 'AWAITING_APPROVAL'),
  ISSUED: toneOf('letter', 'ISSUED'),
  OPEN: toneOf('letter', 'OPEN', 'mail-unread-outline'),
  CLOSED: toneOf('letter', 'CLOSED'),
};

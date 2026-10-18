import type { NcrSeverity, NcrStatus, TestResult } from '@erp/shared';
import { colors, toneIcon, type Tone } from '../theme';

/** Each result, status and severity with a shape as well as a colour (UX item 88). */
export const TEST_RESULT_TONE: Record<TestResult, Tone> = {
  PENDING: { fg: colors.neutral, bg: colors.neutralSoft, icon: toneIcon.waiting },
  PASS: { fg: colors.success, bg: colors.successSoft, icon: toneIcon.done },
  FAIL: { fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.failed },
};

export const NCR_STATUS_TONE: Record<NcrStatus, Tone> = {
  OPEN: { fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.alert },
  ACTION_TAKEN: { fg: colors.info, bg: colors.infoSoft, icon: 'construct-outline' },
  CLOSED: { fg: colors.neutral, bg: colors.neutralSoft, icon: toneIcon.closed },
};

export const SEVERITY_TONE: Record<NcrSeverity, Tone> = {
  MINOR: { fg: colors.warning, bg: colors.warningSoft, icon: 'remove-circle-outline' },
  MAJOR: { fg: colors.danger, bg: colors.dangerSoft, icon: 'arrow-up-circle' },
  CRITICAL: { fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.warning },
};

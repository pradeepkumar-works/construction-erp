import type { NcrSeverity, NcrStatus, TestResult } from '@erp/shared';
import { colors, toneIcon, toneOf, type Tone } from '../theme';

/** Each result, status and severity with a shape as well as a colour. */
export const TEST_RESULT_TONE: Record<TestResult, Tone> = {
  PENDING: toneOf('testResult', 'PENDING'),
  PASS: toneOf('testResult', 'PASS'),
  FAIL: toneOf('testResult', 'FAIL'),
};

export const NCR_STATUS_TONE: Record<NcrStatus, Tone> = {
  OPEN: toneOf('ncr', 'OPEN', toneIcon.alert),
  ACTION_TAKEN: toneOf('ncr', 'ACTION_TAKEN', 'construct-outline'),
  CLOSED: toneOf('ncr', 'CLOSED'),
};

export const SEVERITY_TONE: Record<NcrSeverity, Tone> = {
  MINOR: { fg: colors.warning, bg: colors.warningSoft, icon: 'remove-circle-outline' },
  MAJOR: { fg: colors.danger, bg: colors.dangerSoft, icon: 'arrow-up-circle' },
  CRITICAL: { fg: colors.danger, bg: colors.dangerSoft, icon: toneIcon.warning },
};

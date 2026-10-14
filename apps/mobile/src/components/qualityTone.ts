import type { NcrSeverity, NcrStatus, TestResult } from '@erp/shared';
import { colors } from '../theme';

export const TEST_RESULT_TONE: Record<TestResult, { fg: string; bg: string }> = {
  PENDING: { fg: colors.neutral, bg: colors.neutralSoft },
  PASS: { fg: colors.success, bg: colors.successSoft },
  FAIL: { fg: colors.danger, bg: colors.dangerSoft },
};

export const NCR_STATUS_TONE: Record<NcrStatus, { fg: string; bg: string }> = {
  OPEN: { fg: colors.danger, bg: colors.dangerSoft },
  ACTION_TAKEN: { fg: colors.info, bg: colors.infoSoft },
  CLOSED: { fg: colors.neutral, bg: colors.neutralSoft },
};

export const SEVERITY_TONE: Record<NcrSeverity, { fg: string; bg: string }> = {
  MINOR: { fg: colors.warning, bg: colors.warningSoft },
  MAJOR: { fg: colors.danger, bg: colors.dangerSoft },
  CRITICAL: { fg: colors.danger, bg: colors.dangerSoft },
};

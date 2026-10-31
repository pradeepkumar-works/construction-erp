import type { RoleKey } from './enums';
import { canSeeLeakage } from './leakage';
import { canSeeCashForecast } from './cash-forecast';
import { canSeeAttendanceCheck } from './attendance-check';
import { canManageAi } from './ai';
import { canViewContract } from './permissions';
import { PRODUCT_NAME } from './brand';

/**
 * The checks on the watch list's Other checks strip: each of Nirmaan's own checks that lives on a
 * page of its own, with its headline figure, so one page shows everything the rules and the assistant have found. A role sees
 * a check only when it may open that check's page (the same helper the page uses).
 */
export const INSIGHT_KEYS = ['leakage', 'cashForecast', 'billingReadiness', 'attendanceCheck', 'ai'] as const;
export type InsightKey = (typeof INSIGHT_KEYS)[number];

export const INSIGHT_TITLES: Record<InsightKey, string> = {
  leakage: 'Leakage checks',
  cashForecast: 'Cash forecast',
  billingReadiness: 'Billing readiness',
  attendanceCheck: 'Attendance cross-check',
  ai: `Ask ${PRODUCT_NAME}`,
};

export const INSIGHT_HREFS: Record<InsightKey, string> = {
  leakage: '/leakage',
  cashForecast: '/cash-forecast',
  billingReadiness: '/billing-readiness',
  attendanceCheck: '/attendance-check',
  ai: '/ai-settings',
};

/** Which checks a role gets on the strip, in this order. Ask Nirmaan shows only to those who can switch it on, and only while it is off. */
export const insightKeysFor = (role: RoleKey): InsightKey[] =>
  INSIGHT_KEYS.filter((k) =>
    k === 'leakage' ? canSeeLeakage(role)
    : k === 'cashForecast' ? canSeeCashForecast(role)
    : k === 'billingReadiness' ? canViewContract(role)
    : k === 'attendanceCheck' ? canSeeAttendanceCheck(role)
    : canManageAi(role),
  );

/** One check's headline. The web words it; the API only counts. */
export interface InsightDto {
  key: InsightKey;
  /** Something here needs looking at (flags found, a short week, money late, the assistant off) */
  attention: boolean;
  /** Flags, bills or weeks counted, as `countOf` says */
  count: number | null;
  /** Rupees at risk, unbilled or short; null where the caller may not see values */
  inr: number | null;
  /** A date the headline names: the first short week (cash forecast) */
  date: string | null;
  /** The month the figures cover (`YYYY-MM`), for the monthly checks */
  month: string | null;
  /** Ask Nirmaan only: why it is off */
  aiReason: 'COMPANY_OFF' | 'NOT_CONFIGURED' | 'CAP_REACHED' | 'ROLE_OFF' | 'READ_ONLY' | null;
  /** The check could not be worked out just now */
  failed: boolean;
}

export interface InsightsDto {
  asOf: string;
  checks: InsightDto[];
}

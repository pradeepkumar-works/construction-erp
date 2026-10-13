/** Delay and risk register: scoring and the rules both the API and the forms use. */

/** Probability and impact are rated 1 (very low) to 5 (very high); the score is their product (1 to 25). */
export const RISK_RATINGS = [1, 2, 3, 4, 5] as const;
export const RISK_RATING_LABELS: Record<number, string> = { 1: 'Very low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Very high' };

/** A score at or above this is a high risk: it notifies the project's approvers when raised. */
export const HIGH_RISK_SCORE = 15;
/** At or above this (and below HIGH_RISK_SCORE) is medium. */
export const MEDIUM_RISK_SCORE = 8;

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const riskScore = (probability: number, impact: number): number => probability * impact;
export const riskLevel = (score: number): RiskLevel => (score >= HIGH_RISK_SCORE ? 'HIGH' : score >= MEDIUM_RISK_SCORE ? 'MEDIUM' : 'LOW');

const DAY_MS = 86_400_000;

/**
 * Calendar days lost to a delay, counting both ends: 2026-10-01 to 2026-10-03 is 3 days.
 * An open delay (no end yet) counts to `today`. Dates are YYYY-MM-DD.
 */
export function delayDays(start: string | null | undefined, end: string | null | undefined, today: string): number | null {
  if (!start) return null;
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end || today}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return Math.round((e - s) / DAY_MS) + 1;
}

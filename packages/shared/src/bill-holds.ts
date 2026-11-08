/**
 * Amounts withheld on client RA bills for disputed items (CPWD practice): the engineer holds back an amount on one bill
 * and releases it on later bills as the dispute is settled, wholly or in part; what is never released is lost when the
 * hold is closed. Pure, tested in `apps/api/src/scripts/secured-advance-test.ts`.
 */

import { formatINR } from './numbers';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What is still withheld: the amount less what later bills released and what was written off as lost. */
export const holdBalance = (h: { amount: number | string; released: number | string; lost: number | string }) => round2(Number(h.amount) - Number(h.released) - Number(h.lost)) || 0;

/** What stops a hold from being placed; null when it can be. */
export function holdProblem(h: { description: string; reason: string; amount: number | string }): string | null {
  if (!h.description.trim()) return 'Say what is withheld: the item or the work in dispute';
  if (!h.reason.trim()) return 'Give the reason the engineer withheld it';
  if (!(Number(h.amount) > 0)) return 'Enter the amount withheld, more than 0';
  return null;
}

/**
 * What stops a release of `amount` on bill `billNo` from a hold placed on bill `hold.billNo`; null when it can go.
 * `balance` is what the hold still has withheld without this release.
 */
export function holdReleaseProblem(hold: { billNo: number; closed: boolean; balance: number }, release: { billNo: number; amount: number | string }): string | null {
  if (hold.closed) return 'This hold is closed: what was left of it is lost';
  if (release.billNo <= hold.billNo) return 'An amount is released only on a bill after the one that withheld it';
  if (!(Number(release.amount) > 0)) return 'Enter the amount released, more than 0';
  if (Number(release.amount) > hold.balance + 0.005) return `Only ${formatINR(hold.balance, true)} is still withheld on this hold`;
  return null;
}

/**
 * What stops a hold from being closed with its balance lost; null when it can be. A release waiting on a bill not yet
 * approved could still change, so the hold waits for that bill.
 */
export function holdCloseProblem(hold: { closed: boolean; balance: number; billCertified: boolean; releasedOnOpenBill: boolean }): string | null {
  if (hold.closed) return 'This hold is already closed';
  if (!hold.billCertified) return 'Close a hold once the client has certified the bill that withheld it';
  if (hold.releasedOnOpenBill) return 'A bill not yet approved releases part of this hold: approve or change that bill first';
  if (hold.balance <= 0) return 'Nothing is left withheld on this hold';
  return null;
}

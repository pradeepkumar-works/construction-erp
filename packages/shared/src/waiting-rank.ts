// One order for everything that waits on someone (ARCHITECTURE "Overviews answer first"): My work's cards, Home's Waiting
// for you, the approvals inbox's groups and the watch list's rows. Money at stake first, then how late, then the role's
// own order, so a ₹14 Cr bill never sits under a ₹2 lakh one because the small one is a day older. Pure.

import { toNumber } from './numbers';

/** What an entry that waits weighs: its rupees, how many days it is past its own mark (negative while ahead), its place. */
export interface WaitingWeight {
  amount?: string | number | null;
  daysLate?: number | null;
  /** The entry's place in the role's usual order (lower first); the last tie-break. */
  place?: number;
}

/** Bands of money, so ₹14.2 lakh and ₹14.9 lakh weigh the same and lateness decides between them. */
const BANDS = [1e7, 1e6, 1e5] as const;

/** The money band of an amount: 3 for ₹1 crore or more, 2 for ₹10 lakh or more, 1 for ₹1 lakh or more, else 0. */
export function moneyBand(amount: string | number | null | undefined): number {
  const n = Math.abs(toNumber(amount ?? 0));
  const i = BANDS.findIndex((b) => n >= b);
  return i === -1 ? 0 : BANDS.length - i;
}

/** Compares two waiting entries: the higher money band first, then the later, then the earlier place. */
export function compareWaiting(a: WaitingWeight, b: WaitingWeight): number {
  return (
    moneyBand(b.amount) - moneyBand(a.amount) ||
    (b.daysLate ?? 0) - (a.daysLate ?? 0) ||
    (a.place ?? 0) - (b.place ?? 0)
  );
}

/** Entries in waiting order (a stable sort: equal ones keep the order they came in). */
export function rankWaiting<T>(items: readonly T[], weightOf: (item: T, index: number) => WaitingWeight): T[] {
  return items
    .map((item, i) => ({ item, w: { place: i, ...weightOf(item, i) } }))
    .sort((a, b) => compareWaiting(a.w, b.w))
    .map((x) => x.item);
}

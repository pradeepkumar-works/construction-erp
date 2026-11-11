/**
 * Retention held from a subcontractor and paid back, and back-charges by kind (ARCHITECTURE "Subcontracts", Retention
 * release and back-charges). Money is in rupee strings, as the API serialises it; sums are worked in paise.
 */

/** The `backCharge` master's code for a charge that is none of the listed kinds; it needs a note saying what it was for. */
export const BACK_CHARGE_OTHER = 'other';
/** The most charges one bill carries. */
export const BACK_CHARGES_MAX = 30;

const paise = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const rupees = (p: number): string => (p / 100).toFixed(2);

export interface RetentionBill {
  billNo: number;
  retentionAmount: string;
  retentionReleased: string;
}

/**
 * Retention still held on a work order before bill `beforeBillNo` (every bill when left out): what its bills kept,
 * less what they paid back.
 */
export function retentionHeld(bills: RetentionBill[], beforeBillNo?: number): string {
  const p = bills.filter((b) => beforeBillNo === undefined || b.billNo < beforeBillNo).reduce((s, b) => s + paise(b.retentionAmount) - paise(b.retentionReleased), 0);
  return rupees(Math.max(0, p));
}

/**
 * Why a bill cannot pay back this much retention: more than is held, a negative amount or one in fractions of a paisa,
 * or a release bill that releases nothing. Null when it can.
 */
export function retentionReleaseProblem(release: string | number, held: string | number, releaseBill: boolean): string | null {
  const r = paise(release);
  if (!Number.isFinite(r) || Math.abs(Number(release) * 100 - r) > 1e-6) return 'Enter the retention to release in rupees and paise';
  if (r < 0) return 'The retention to release cannot be negative';
  if (r > paise(held)) return `Only ₹${rupees(paise(held))} of retention is held on this work order`;
  if (releaseBill && r === 0) return 'A retention release bill pays back some retention; enter how much';
  return null;
}

/** Half the held retention, to the paisa (the share commonly paid back on completion, the rest after the defects period). */
export const halfOfHeld = (held: string): string => rupees(Math.floor(paise(held) / 2));

export interface BackChargeInput {
  /** A code of the `backCharge` master */
  kindCode: string;
  amount: string;
  note?: string | null;
}

/** Why these back-charges cannot go on a bill: an unknown kind, an amount that is not a positive sum, "other" with no note, too many. */
export function backChargesProblem(charges: BackChargeInput[], kinds: Set<string>): string | null {
  if (charges.length > BACK_CHARGES_MAX) return `A bill takes at most ${BACK_CHARGES_MAX} back-charges`;
  for (const [i, c] of charges.entries()) {
    const at = `Back-charge ${i + 1}`;
    if (!kinds.has(c.kindCode)) return `${at}: choose what it is for`;
    const p = paise(c.amount);
    if (!Number.isFinite(p) || p <= 0) return `${at}: enter an amount above zero`;
    if (Math.abs(Number(c.amount) * 100 - p) > 1e-6) return `${at}: enter the amount in rupees and paise`;
    if (c.kindCode === BACK_CHARGE_OTHER && !c.note?.trim()) return `${at}: say what the charge is for`;
  }
  return null;
}

/** The charges' total. */
export const backChargesTotal = (charges: { amount: string }[]): string => rupees(charges.reduce((s, c) => s + paise(c.amount), 0));

/** Back-charges summed by kind, largest first: what a work order has charged its subcontractor for. */
export function backChargesByKind(charges: { kindCode: string; amount: string }[]): { kindCode: string; amount: string; count: number }[] {
  const by = new Map<string, { p: number; count: number }>();
  for (const c of charges) {
    const cur = by.get(c.kindCode) ?? { p: 0, count: 0 };
    by.set(c.kindCode, { p: cur.p + paise(c.amount), count: cur.count + 1 });
  }
  return [...by.entries()].sort(([a, x], [b, y]) => y.p - x.p || a.localeCompare(b)).map(([kindCode, v]) => ({ kindCode, amount: rupees(v.p), count: v.count }));
}

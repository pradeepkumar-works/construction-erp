/**
 * Committed cost (ARCHITECTURE "Committed cost"): what the project has bound itself to pay through approved purchase
 * orders and work orders that is not in its actual cost yet. Material is costed when issued and subcontract work when
 * its bill is approved, so an order's commitment is what it still has to deliver or bill. The forecast never ends below
 * it: a head's cost to complete is the larger of its budget for the work left and what is already ordered.
 */
import type { CostHead } from './cost';

export const COMMITMENT_KINDS = ['PO', 'WO'] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

/** Which cost head each kind of order commits. */
export const COMMITMENT_HEAD: Record<CommitmentKind, CostHead> = { PO: 'material', WO: 'subcontract' };

const paise = (v: string | number) => Math.round(Number(v) * 100);
const rupees = (p: number) => p / 100;

export interface OrderLineFact {
  /** Ordered quantity */
  quantity: string;
  /** Rate before GST */
  rate: string;
  /** Received so far (net of returns) */
  received: string;
}

/**
 * A purchase order's undelivered value before GST: each line's quantity still to come at its rate, nothing below zero
 * and nothing once the order is closed.
 */
export function poBalance(lines: OrderLineFact[], closed: boolean): number {
  if (closed) return 0;
  let p = 0;
  for (const l of lines) {
    const left = Number(l.quantity) - Math.max(0, Number(l.received));
    if (left > 0) p += paise(left * Number(l.rate));
  }
  return rupees(p);
}

/** A work order's value (as amended) less the work its approved bills have charged, nothing below zero or once closed. */
export function woBalance(value: string, billed: string, closed: boolean): number {
  if (closed) return 0;
  return rupees(Math.max(0, paise(value) - paise(billed)));
}

/**
 * A head's cost to complete: its budget for the work left, or what is already ordered and not yet in actual cost when
 * that is more. Without a budget it is the commitment alone.
 */
export function costToComplete(budgetLeft: number | null, committed: number): number {
  return rupees(Math.max(paise(budgetLeft ?? 0), paise(committed)));
}

/** How far actual cost and what is ordered on top of it go past a head's budget; null when they stay within it or there is none. */
export function overCommitted(budget: number | null, actual: number, committed: number): number | null {
  if (budget === null) return null;
  const over = paise(actual) + paise(committed) - paise(budget);
  return over > 0 ? rupees(over) : null;
}

/** One approved order that still commits money. */
export interface CommitmentDto {
  kind: CommitmentKind;
  id: string;
  /** PO or WO number */
  number: string;
  date: string;
  vendorName: string;
  /** What it is for: the work order's title, or the PO's first items */
  title: string;
  /** Order value before GST */
  value: string;
  /** Received (PO) or billed (WO) so far, before GST */
  done: string;
  /** Still to deliver or bill */
  balance: string;
}

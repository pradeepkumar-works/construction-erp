/** Bill checks before approval (AI roadmap item 69): plain rules over a bill, its order and what was received or measured. */
export const CHECK_KINDS = ['vendor-bill', 'subcontract-bill', 'expense', 'ra-bill'] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

/** One rule's result. A passing rule is one tick; a failing one is a flag per line or record it found. */
export interface BillCheckDto {
  /** Stable for the same finding: the rule, the line and the figures, so a changed bill is checked afresh. */
  key: string;
  ok: boolean;
  title: string;
  detail: string | null;
  /** The records the flag is about (the GRN, the other bill). */
  links: { label: string; href: string }[];
  /** An approver looked at the flag and accepted it. */
  accepted: { note: string; byName: string; at: string } | null;
}

export interface BillChecksDto {
  kind: CheckKind;
  id: string;
  checks: BillCheckDto[];
  /** Flags not yet accepted. */
  openFlags: number;
  /** One line for the approver: written by the model when Ask Nirmaan is on and there is a flag, else from the rules. */
  summary: string;
  summaryBy: 'ai' | 'rules';
  /** The model's line is not written yet; ask `GET /checks/:kind/:id/summary` for it. */
  aiSummaryPending: boolean;
  /** The user may accept a flag (they can approve this bill, and it waits for approval). */
  canAccept: boolean;
}

export interface BillCheckSummaryDto {
  summary: string;
  summaryBy: 'ai' | 'rules';
}

/** The GSTIN's check character (the 15th), from the first 14 by the GSTN's mod-36 rule; null when they are not valid characters. */
export function gstinCheckChar(first14: string): string | null {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = chars.indexOf(first14[i]);
    if (v < 0) return null;
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return chars[(36 - (sum % 36)) % 36];
}

/** Whether a 15-character GSTIN's last character matches the rest (catches most typing mistakes). */
export const gstinChecksumOk = (gstin: string): boolean => gstin.length === 15 && gstinCheckChar(gstin.slice(0, 14).toUpperCase()) === gstin[14].toUpperCase();

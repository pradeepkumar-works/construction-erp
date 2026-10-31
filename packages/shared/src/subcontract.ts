/** Subcontractor work orders and their bills. */

/** "WO-2026-0003 bill 2", or "WO-2026-0003 bill 5 (final)". */
export const subBillLabel = (woNo: string, billNo: number, isFinal: boolean): string => `${woNo} bill ${billNo}${isFinal ? ' (final)' : ''}`;

/** What a subcontractor bill recovers, in the order the bill shows it. */
export const SUB_BILL_DEDUCTION_LABELS = {
  retention: 'Retention',
  advanceRecovery: 'Advance recovery',
  tds: 'TDS (section 194C)',
  material: 'Material issued',
  excessMaterial: 'Material used over the norm',
  other: 'Other deduction',
} as const;
export type SubBillDeductionKey = keyof typeof SUB_BILL_DEDUCTION_LABELS;

/**
 * TDS under section 194C from the contractor's PAN: 1% for an individual or HUF (fourth letter P or H), 2% for anyone
 * else. Without a PAN the law asks for 20% (section 206AA); the work order shows that as a warning, not a default.
 */
export function contractorTdsPct(pan: string | null | undefined): number {
  const kind = pan?.trim().toUpperCase().charAt(3);
  return kind === 'P' || kind === 'H' ? 1 : 2;
}

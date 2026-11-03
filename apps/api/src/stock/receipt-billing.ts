/**
 * Which goods receipts still wait for a supplier's bill. Bills are matched to order lines, not to receipts, so a
 * line's billed quantity covers its receipts oldest first; a receipt waits while any of its lines has accepted
 * quantity no bill covers yet. An order with one bill can still have later deliveries waiting.
 */
export interface ReceiptLineFact {
  entryId: string;
  /** Receipt date then creation time, so receipts on one day keep their order */
  order: string;
  purchaseOrderLineId: string;
  /** Received less what QA/QC rejected */
  accepted: number;
}

export function receiptsAwaitingBill(lines: ReceiptLineFact[], billedByLine: Map<string, number>): Set<string> {
  const left = new Map(billedByLine);
  const waiting = new Set<string>();
  for (const l of [...lines].sort((a, b) => a.order.localeCompare(b.order))) {
    if (l.accepted <= 0) continue;
    const covered = Math.min(l.accepted, left.get(l.purchaseOrderLineId) ?? 0);
    left.set(l.purchaseOrderLineId, (left.get(l.purchaseOrderLineId) ?? 0) - covered);
    if (l.accepted - covered > 1e-9) waiting.add(l.entryId);
  }
  return waiting;
}

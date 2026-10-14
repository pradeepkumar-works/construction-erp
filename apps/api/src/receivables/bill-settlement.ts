import { Prisma } from '@prisma/client';

const ZERO = new Prisma.Decimal(0);

/** The receipt columns a bill's settlement is added up from. */
export const RECEIPT_SUMS = {
  amount: true,
  tdsAmount: true,
  gstTdsAmount: true,
  retentionAmount: true,
  securityDepositAmount: true,
  advanceRecoveryAmount: true,
  labourCessAmount: true,
  otherDeduction: true,
  receiptDate: true,
} as const;

type ReceiptSums = { [K in Exclude<keyof typeof RECEIPT_SUMS, 'receiptDate'>]: Prisma.Decimal };

/** What the client deducted on one receipt. */
export const deductedOn = (r: Omit<ReceiptSums, 'amount'>) =>
  r.tdsAmount.add(r.gstTdsAmount).add(r.retentionAmount).add(r.securityDepositAmount).add(r.advanceRecoveryAmount).add(r.labourCessAmount).add(r.otherDeduction);

/** Received in the bank, and received plus deducted, over a bill's receipts. */
export function settlement(receipts: ReceiptSums[]) {
  let received = ZERO;
  let settled = ZERO;
  for (const r of receipts) {
    received = received.add(r.amount);
    settled = settled.add(r.amount).add(deductedOn(r));
  }
  return { received, settled };
}

/** Work value + GST: what the client owes on a bill before its own deductions. */
export const invoiceOf = (b: { grossAmount: Prisma.Decimal; gstAmount: Prisma.Decimal }) => b.grossAmount.add(b.gstAmount);

/**
 * Move a bill to PAID once its receipts settle it, or back to CERTIFIED / SENT when a receipt is taken off or the
 * certificate raises the amount. Paid date = the last receipt.
 */
export async function syncBillStage(tx: Prisma.TransactionClient, billId: string) {
  const bill = await tx.raBill.findUniqueOrThrow({ where: { id: billId }, include: { receipts: { select: RECEIPT_SUMS } } });
  if (bill.stage === 'NOT_SENT') return;
  const { settled } = settlement(bill.receipts);
  const paid = bill.receipts.length > 0 && settled.gte(invoiceOf(bill));
  if (paid) {
    const last = bill.receipts.reduce((d, r) => (r.receiptDate > d ? r.receiptDate : d), bill.receipts[0].receiptDate);
    if (bill.stage !== 'PAID' || bill.paidDate?.getTime() !== last.getTime()) await tx.raBill.update({ where: { id: billId }, data: { stage: 'PAID', paidDate: last } });
  } else if (bill.stage === 'PAID') {
    await tx.raBill.update({ where: { id: billId }, data: { stage: bill.certifiedDate ? 'CERTIFIED' : 'SENT', paidDate: null } });
  }
}

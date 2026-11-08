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

/** Work value + price variation + GST: the bill amount with GST, the tax invoice. */
export const invoiceOf = (b: { grossAmount: Prisma.Decimal; pvAmount: Prisma.Decimal; gstAmount: Prisma.Decimal }) => b.grossAmount.add(b.pvAmount).add(b.gstAmount);

/** The bill columns `billOwed` reads. */
export const OWED_SELECT = { grossAmount: true, pvAmount: true, gstAmount: true, securedAdvance: true, securedAdvanceRecovered: true, withheld: true, withheldReleased: true } as const;
export type OwedColumns = { [K in keyof typeof OWED_SELECT]: Prisma.Decimal };

/**
 * What a bill's receipts settle (received plus what the client deducted on them): the invoice, plus the secured advance
 * paid on it and the amounts it released, less the previous advance it recovered and what it withheld. Those four are
 * the bill's own and never a receipt's deductions, so a payment of the full net payable with the bill's deductions
 * settles the bill. The sales voucher debits the client with the same.
 */
export const billOwed = (b: OwedColumns) =>
  invoiceOf(b).add(b.securedAdvance).sub(b.securedAdvanceRecovered).add(b.withheldReleased).sub(b.withheld);

/**
 * Move a bill to PAID once its receipts settle it, or back to CERTIFIED / SENT when a receipt is taken off or the
 * certificate raises the amount. Paid date = the last receipt.
 */
export async function syncBillStage(tx: Prisma.TransactionClient, billId: string) {
  const bill = await tx.raBill.findUniqueOrThrow({ where: { id: billId }, include: { receipts: { select: RECEIPT_SUMS } } });
  if (bill.stage === 'NOT_SENT') return;
  const { settled } = settlement(bill.receipts);
  const paid = bill.receipts.length > 0 && settled.gte(billOwed(bill));
  if (paid) {
    const last = bill.receipts.reduce((d, r) => (r.receiptDate > d ? r.receiptDate : d), bill.receipts[0].receiptDate);
    if (bill.stage !== 'PAID' || bill.paidDate?.getTime() !== last.getTime()) await tx.raBill.update({ where: { id: billId }, data: { stage: 'PAID', paidDate: last } });
  } else if (bill.stage === 'PAID') {
    await tx.raBill.update({ where: { id: billId }, data: { stage: bill.certifiedDate ? 'CERTIFIED' : 'SENT', paidDate: null } });
  }
}

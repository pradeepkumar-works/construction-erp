import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

/** Paid plus deducted at payment, summed. */
const settled = (s: { _sum: { amount: Prisma.Decimal | null; tdsAmount: Prisma.Decimal | null; otherDeduction: Prisma.Decimal | null } }) =>
  (s._sum.amount ?? ZERO).add(s._sum.tdsAmount ?? ZERO).add(s._sum.otherDeduction ?? ZERO);

const SUMS = { _sum: { amount: true, tdsAmount: true, otherDeduction: true } } as const;

/**
 * Advances paid against a purchase order or a work order: payments with no bill, drawn on an approved
 * payment request. `count` is how many such payments there are, so a work order knows whether its advance is on record.
 */
export async function advancePaid(db: Db, order: { purchaseOrderId: string } | { workOrderId: string }, excludePaymentId?: string) {
  const where: Prisma.VendorPaymentWhereInput = { ...order, vendorBillId: null, subcontractBillId: null, ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}) };
  const s = await db.vendorPayment.aggregate({ where, ...SUMS, _count: { _all: true } });
  return { paid: settled(s), count: s._count._all };
}

/** Advance taken off the PO's vendor bills that are not rejected (other than `exceptBillId`). */
export async function advanceAdjusted(db: Db, purchaseOrderId: string, exceptBillId?: string) {
  const s = await db.vendorBill.aggregate({ where: { purchaseOrderId, status: { not: 'REJECTED' }, ...(exceptBillId ? { id: { not: exceptBillId } } : {}) }, _sum: { advanceAdjusted: true } });
  return s._sum.advanceAdjusted ?? ZERO;
}

/** Advance recovered on the work order's bills that are not rejected. */
export async function advanceRecovered(db: Db, workOrderId: string) {
  const s = await db.subcontractBill.aggregate({ where: { workOrderId, status: { not: 'REJECTED' } }, _sum: { advanceRecoveryAmount: true } });
  return s._sum.advanceRecoveryAmount ?? ZERO;
}

/**
 * The advance a work order's bills recover from: what was actually paid against it once any advance payment is on
 * record, else the advance amount written on the order (paid before payment requests existed, or outside Nirmaan).
 */
export async function workOrderAdvanceBase(db: Db, wo: { id: string; advanceAmount: Prisma.Decimal }) {
  const a = await advancePaid(db, { workOrderId: wo.id });
  return a.count > 0 ? a.paid : wo.advanceAmount;
}

/** Advances asked for on the order's payment requests that are submitted or approved (other than `exceptId`). */
export async function advanceRequested(db: Db, order: { purchaseOrderId: string } | { workOrderId: string }, exceptId?: string) {
  const s = await db.paymentRequest.aggregate({ where: { ...order, status: { in: ['SUBMITTED', 'APPROVED'] }, ...(exceptId ? { id: { not: exceptId } } : {}) }, _sum: { amount: true } });
  return s._sum.amount ?? ZERO;
}

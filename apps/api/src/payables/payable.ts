import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;

/** Columns a vendor bill's payable is made of; select them with `VENDOR_BILL_PAYABLE`. */
export const VENDOR_BILL_PAYABLE = { total: true, advanceAdjusted: true, fuelRecovery: true, debitNoteAmount: true } as const;
export const SUB_BILL_PAYABLE = { netPayable: true, debitNoteAmount: true } as const;

/**
 * What a vendor bill asks to be paid: its total less the PO advance taken off, fuel recovered on a hire
 * bill and debit notes that are not cancelled.
 */
export const vendorBillPayable = (b: { total: Decimal; advanceAdjusted: Decimal; fuelRecovery: Decimal; debitNoteAmount: Decimal }) =>
  b.total.sub(b.advanceAdjusted).sub(b.fuelRecovery).sub(b.debitNoteAmount);

/** What a subcontract bill asks to be paid: its net payable less debit notes that are not cancelled. */
export const subBillPayable = (b: { netPayable: Decimal; debitNoteAmount: Decimal }) => b.netPayable.sub(b.debitNoteAmount);

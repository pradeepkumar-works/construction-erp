import { FUND_PURPOSE_LABELS, subBillLabel, type FundPurpose, type PaymentRequestKind } from '@erp/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "13 Oct 2026". Dates are stored as UTC midnight, so the UTC fields are the calendar day. */
export const titleDate = (d: Date): string => `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** "GSB laying: 392 Cum on 13 Oct 2026". */
export const progressTitle = (activity: string, qty: string, unit: string, date: Date) => `${activity}: ${Number(qty)} ${unit} on ${titleDate(date)}`;

/** "DPR for 13 Oct 2026". */
export const dprTitle = (date: Date) => `DPR for ${titleDate(date)}`;

/** "EXC-01 Excavator: 7.5 h on 13 Oct 2026 (2 h breakdown)". Used in the approval queue and notifications. */
export const machineryTitle = (code: string, name: string, worked: string, breakdown: string, date: Date) =>
  `${code} ${name}: ${Number(worked)} h on ${titleDate(date)}${Number(breakdown) > 0 ? ` (${Number(breakdown)} h breakdown)` : ''}`;


/** "EXP-2026-0007: ₹2,832.00 · Hydraulic hose for grader". */
export const expenseTitle = (expenseNo: string, total: string, description: string) =>
  `${expenseNo}: ₹${Number(total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${description.length > 60 ? `${description.slice(0, 57)}...` : description}`;

/** "MB-2026-0003: item 2.1, 1250.5 Cum at Km 14+200 to 14+400". */
export const measurementTitle = (mbNo: string, itemNo: string, qty: string, unit: string, location: string) =>
  `${mbNo}: item ${itemNo}, ${Number(qty)} ${unit} at ${location}`;

/** "RA bill 3: ₹48,25,000.00 of work" (the final bill says so); "O&M bill 6: ₹17,39,000.00 of O&M" (item 131). */
export const billTitle = (billNo: number, isFinal: boolean, gross: string, om = false) =>
  `${om ? 'O&M' : 'RA'} bill ${billNo}${isFinal ? ' (final)' : ''}: ₹${Number(gross).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of ${om ? 'O&M' : 'work'}`;

export const inr = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "PO-2026-0004: ₹2,45,000.00 to Utkal Cement Traders". */
export const poTitle = (poNo: string, total: string, vendor: string) => `${poNo}: ${inr(total)} to ${vendor}`;

/** "Supplier for MR-2026-0012: Steel Traders (L1), ₹4,52,000.00" or "… lowest per item, split, …". */
export const supplierChoiceTitle = (requestNo: string, vendor: string | null, split: boolean, rank: number | null, amount: string) =>
  `Supplier for ${requestNo}: ${split ? 'lowest per item, split' : `${vendor ?? 'a deleted quotation'}${rank ? ` (L${rank})` : ''}`}, ${inr(amount)}`;

/** The rows `supplierChoiceTitle` reads. */
export const SUPPLIER_CHOICE_TITLE = { materialRequest: { select: { requestNo: true } }, quotation: { select: { vendor: { select: { name: true } } } } } as const;

/** "WO-2026-0003: Brickwork, Block A, ₹8,40,000.00 to Mahanadi Builders". */
export const woTitle = (woNo: string, title: string, value: string, vendor: string) => `${woNo}: ${title}, ${inr(value)} to ${vendor}`;

/** "WO-2026-0003 bill 2 of Mahanadi Builders: ₹1,20,000.00 of work". */
export const subBillTitle = (woNo: string, billNo: number, isFinal: boolean, vendor: string, gross: string) =>
  `${woNo} bill ${billNo}${isFinal ? ' (final)' : ''} of ${vendor}: ${inr(gross)} of work`;

/** "VB-2026-0002: invoice UCT/551 of Utkal Cement Traders, ₹1,20,000.00". */
export const vendorBillTitle = (billNo: string, invoiceNo: string, vendor: string, total: string) => `${billNo}: invoice ${invoiceNo} of ${vendor}, ${inr(total)}`;

/** "INS-2026-0004: Reinforcement for slab, at Block A, 2nd floor". */
export const inspectionTitle = (inspectionNo: string, activity: string, location: string) => `${inspectionNo}: ${activity}, at ${location}`;

/** "PR-2026-0003: ₹1,50,000.00 to Utkal Cement Traders against VB-2026-0004". */
export const paymentRequestTitle = (requestNo: string, amount: string, vendor: string, target: string, advance: boolean) =>
  `${requestNo}: ${inr(amount)} to ${vendor} ${advance ? `as an advance on ${target}` : `against ${target}`}`;

/** A fund request (v6 item 107): "PR-2026-0009: ₹50,000.00 for wages, into Ramesh Das's imprest". */
export const fundRequestTitle = (requestNo: string, amount: string, purpose: FundPurpose | null, vendor: string | null, holder: string | null) =>
  `${requestNo}: ${inr(amount)} for ${purpose ? FUND_PURPOSE_LABELS[purpose].toLowerCase() : 'the site'}, ${vendor ? `to ${vendor} on account` : `into ${holder ?? 'the site'}'s imprest`}`;

/** The title of any payment request, loaded with `PAY_REQUEST_TITLE`. */
export const payRequestTitle = (r: {
  requestNo: string;
  amount: { toFixed(n: number): string };
  kind: PaymentRequestKind;
  purpose: FundPurpose | null;
  vendor: { name: string } | null;
  imprest: { holder: { fullName: string } } | null;
  vendorBill: { billNo: string } | null;
  subcontractBill: { billNo: number; isFinal: boolean; workOrder: { woNo: string } } | null;
  purchaseOrder: { poNo: string } | null;
  workOrder: { woNo: string } | null;
}) =>
  r.kind === 'FUND_REQUEST'
    ? fundRequestTitle(r.requestNo, r.amount.toFixed(2), r.purpose, r.vendor?.name ?? null, r.imprest?.holder.fullName ?? null)
    : paymentRequestTitle(
        r.requestNo,
        r.amount.toFixed(2),
        r.vendor?.name ?? '',
        r.vendorBill?.billNo ?? (r.subcontractBill ? subBillLabel(r.subcontractBill.workOrder.woNo, r.subcontractBill.billNo, r.subcontractBill.isFinal) : (r.purchaseOrder?.poNo ?? r.workOrder?.woNo ?? '')),
        r.kind !== 'BILL',
      );

/** What `payRequestTitle` reads of a payment request. */
export const PAY_REQUEST_TITLE = {
  vendor: { select: { name: true } },
  imprest: { select: { holder: { select: { fullName: true } } } },
  vendorBill: { select: { billNo: true } },
  subcontractBill: { select: { billNo: true, isFinal: true, workOrder: { select: { woNo: true } } } },
  purchaseOrder: { select: { poNo: true } },
  workOrder: { select: { woNo: true } },
} as const;

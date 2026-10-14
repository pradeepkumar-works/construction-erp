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

/** "RA bill 3: ₹48,25,000.00 of work" (the final bill says so). */
export const billTitle = (billNo: number, isFinal: boolean, gross: string) =>
  `RA bill ${billNo}${isFinal ? ' (final)' : ''}: ₹${Number(gross).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of work`;

const inr = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "PO-2026-0004: ₹2,45,000.00 to Utkal Cement Traders". */
export const poTitle = (poNo: string, total: string, vendor: string) => `${poNo}: ${inr(total)} to ${vendor}`;

/** "WO-2026-0003: Brickwork, Block A, ₹8,40,000.00 to Mahanadi Builders". */
export const woTitle = (woNo: string, title: string, value: string, vendor: string) => `${woNo}: ${title}, ${inr(value)} to ${vendor}`;

/** "WO-2026-0003 bill 2 of Mahanadi Builders: ₹1,20,000.00 of work". */
export const subBillTitle = (woNo: string, billNo: number, isFinal: boolean, vendor: string, gross: string) =>
  `${woNo} bill ${billNo}${isFinal ? ' (final)' : ''} of ${vendor}: ${inr(gross)} of work`;

/** "VB-2026-0002: invoice UCT/551 of Utkal Cement Traders, ₹1,20,000.00". */
export const vendorBillTitle = (billNo: string, invoiceNo: string, vendor: string, total: string) => `${billNo}: invoice ${invoiceNo} of ${vendor}, ${inr(total)}`;

/** "INS-2026-0004: Reinforcement for slab, at Block A, 2nd floor". */
export const inspectionTitle = (inspectionNo: string, activity: string, location: string) => `${inspectionNo}: ${activity}, at ${location}`;

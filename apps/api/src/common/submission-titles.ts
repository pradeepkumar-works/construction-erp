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

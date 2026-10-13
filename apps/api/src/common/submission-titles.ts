/** "EXC-01 Excavator: 7.5 h on 2026-10-13 (2 h breakdown)". Used in the approval queue and notifications. */
export const machineryTitle = (code: string, name: string, worked: string, breakdown: string, date: string) =>
  `${code} ${name}: ${Number(worked)} h on ${date}${Number(breakdown) > 0 ? ` (${Number(breakdown)} h breakdown)` : ''}`;


/** "EXP-2026-0007: ₹2,832.00 · Hydraulic hose for grader". */
export const expenseTitle = (expenseNo: string, total: string, description: string) =>
  `${expenseNo}: ₹${Number(total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${description.length > 60 ? `${description.slice(0, 57)}...` : description}`;

/** "MB-2026-0003: item 2.1, 1250.5 Cum at Km 14+200 to 14+400". */
export const measurementTitle = (mbNo: string, itemNo: string, qty: string, unit: string, location: string) =>
  `${mbNo}: item ${itemNo}, ${Number(qty)} ${unit} at ${location}`;

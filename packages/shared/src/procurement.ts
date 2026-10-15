/**
 * Small items of v4 item 48: the unit master, financial years for report filters, and the procurement status report
 * (pending deliveries).
 */

/* ---------- unit master ---------- */

/** Units a company starts with; it can add its own and switch any off. */
export const DEFAULT_UNITS: { code: string; name: string }[] = [
  { code: 'Nos', name: 'Numbers' },
  { code: 'Cum', name: 'Cubic metre' },
  { code: 'Sqm', name: 'Square metre' },
  { code: 'Rmt', name: 'Running metre' },
  { code: 'Km', name: 'Kilometre' },
  { code: 'MT', name: 'Metric tonne' },
  { code: 'Kg', name: 'Kilogram' },
  { code: 'Qtl', name: 'Quintal' },
  { code: 'Bag', name: 'Bag (50 kg cement)' },
  { code: 'Ltr', name: 'Litre' },
  { code: 'KL', name: 'Kilolitre' },
  { code: 'Set', name: 'Set' },
  { code: 'Pair', name: 'Pair' },
  { code: 'Roll', name: 'Roll' },
  { code: 'Box', name: 'Box' },
  { code: 'Trip', name: 'Trip (truck load)' },
  { code: 'Brass', name: 'Brass (100 cft)' },
  { code: 'Cft', name: 'Cubic foot' },
  { code: 'Sqft', name: 'Square foot' },
  { code: 'Rft', name: 'Running foot' },
  { code: 'Hr', name: 'Hour' },
  { code: 'Day', name: 'Day' },
  { code: 'Month', name: 'Month' },
  { code: 'LS', name: 'Lump sum' },
];

export interface UnitDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Items in the item master written with this unit */
  itemCount: number;
}

/* ---------- financial years (April to March) ---------- */

export interface FinancialYear {
  /** e.g. FY 2026-27 */
  label: string;
  /** YYYY-04-01 */
  from: string;
  /** YYYY-03-31 of the next year */
  to: string;
}

/** The Indian financial year (1 April to 31 March) a YYYY-MM-DD date falls in. */
export function financialYearOf(date: string): FinancialYear {
  const y = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
  return { label: `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** This financial year and the `count - 1` before it, newest first. */
export function recentFinancialYears(today: string, count = 3): FinancialYear[] {
  const current = financialYearOf(today);
  const start = Number(current.from.slice(0, 4));
  return Array.from({ length: count }, (_, i) => financialYearOf(`${start - i}-04-01`));
}

/* ---------- procurement status ---------- */

/** Where an approved purchase order stands on delivery. */
export type DeliveryState = 'NOT_STARTED' | 'PARTLY_RECEIVED' | 'RECEIVED' | 'CLOSED';
export const DELIVERY_STATE_LABELS: Record<DeliveryState, string> = { NOT_STARTED: 'Nothing received', PARTLY_RECEIVED: 'Partly received', RECEIVED: 'Received', CLOSED: 'Closed short' };

export interface ProcurementStatusLineDto {
  purchaseOrderLineId: string;
  itemName: string;
  unit: string;
  ordered: string;
  received: string;
  pending: string;
  /** Value of what is still to come, at the PO rate before GST */
  pendingValue: string;
}

export interface ProcurementStatusRowDto {
  purchaseOrderId: string;
  poNo: string;
  poDate: string;
  projectId: string;
  projectName: string;
  vendorId: string;
  vendorName: string;
  deliveryBy: string | null;
  state: DeliveryState;
  /** Days past the delivery date with something still to come; 0 when on time or delivered */
  daysLate: number;
  orderValue: string;
  receivedValue: string;
  pendingValue: string;
  /** Share of the order value received, 0 to 100 */
  receivedPct: number;
  lastReceiptOn: string | null;
  /** Receipts against the order still waiting for QA/QC */
  awaitingQc: number;
  lines: ProcurementStatusLineDto[];
}

export interface ProcurementStatusDto {
  rows: ProcurementStatusRowDto[];
  totals: { orders: number; pending: number; late: number; orderValue: string; pendingValue: string };
  byVendor: { vendorId: string; vendorName: string; orders: number; pending: number; late: number; pendingValue: string }[];
}

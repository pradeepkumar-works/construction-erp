/**
 * Ready-mix concrete (v6 item 104): a plant is a project of type PLANT, so its cement, aggregates and admixture are
 * bought, received and counted as any site's. Mix designs say what goes into a cubic metre of each grade; orders (a
 * quote first) say what a customer wants; each truck is a batch with its delivery challan, which issues the materials
 * from the plant's stock and can have cubes taken; bills are raised from delivered challans with GST.
 */

/** Concrete grades by characteristic strength (N/mm² at 28 days). */
export const RMC_GRADES = ['M10', 'M15', 'M20', 'M25', 'M30', 'M35', 'M40', 'M45', 'M50'] as const;
export type RmcGrade = (typeof RMC_GRADES)[number];
/** The strength a grade's cubes must reach at 28 days. */
export const gradeStrength = (grade: string): number | null => {
  const m = /^M(\d{2})$/.exec(grade);
  return m ? Number(m[1]) : null;
};

export const MIX_DESIGN_STATUSES = ['DRAFT', 'APPROVED', 'RETIRED'] as const;
export type MixDesignStatus = (typeof MIX_DESIGN_STATUSES)[number];
export const MIX_DESIGN_STATUS_LABELS: Record<MixDesignStatus, string> = { DRAFT: 'Waiting for approval', APPROVED: 'Approved', RETIRED: 'Retired' };

export const RMC_ORDER_STATUSES = ['QUOTED', 'CONFIRMED', 'CLOSED', 'CANCELLED'] as const;
export type RmcOrderStatus = (typeof RMC_ORDER_STATUSES)[number];
export const RMC_ORDER_STATUS_LABELS: Record<RmcOrderStatus, string> = { QUOTED: 'Quote', CONFIRMED: 'Order', CLOSED: 'Completed', CANCELLED: 'Cancelled' };

export const RMC_BATCH_STATUSES = ['DISPATCHED', 'DELIVERED', 'REJECTED'] as const;
export type RmcBatchStatus = (typeof RMC_BATCH_STATUSES)[number];
export const RMC_BATCH_STATUS_LABELS: Record<RmcBatchStatus, string> = { DISPATCHED: 'On the way', DELIVERED: 'Delivered', REJECTED: 'Turned back' };

export const RMC_INVOICE_STATUSES = ['ISSUED', 'CANCELLED'] as const;
export type RmcInvoiceStatus = (typeof RMC_INVOICE_STATUSES)[number];
export const RMC_INVOICE_STATUS_LABELS: Record<RmcInvoiceStatus, string> = { ISSUED: 'Issued', CANCELLED: 'Cancelled' };

/** GST on ready-mix concrete (HSN 3824 50 10) and on pumping it. */
export const RMC_HSN = '38245010';
export const RMC_GST_RATE = 18;

export interface MixDesignLineDto {
  itemId: string;
  itemName: string;
  unit: string;
  /** Per cubic metre of concrete */
  quantity: string;
}

export interface MixDesignDto {
  id: string;
  plantId: string;
  plantName: string;
  code: string;
  grade: string;
  description: string | null;
  slumpMm: number | null;
  status: MixDesignStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  lines: MixDesignLineDto[];
  /** Material cost of a cubic metre at the items' standard rates, when they have one */
  costPerM3: string | null;
  canEdit: boolean;
  canApprove: boolean;
}

export interface RmcOrderDto {
  id: string;
  orderNo: string;
  plantId: string;
  plantName: string;
  date: string;
  status: RmcOrderStatus;
  clientId: string | null;
  /** An own site supplied from the plant (no GST bill) */
  projectId: string | null;
  customer: string;
  site: string | null;
  mixDesignId: string;
  mixDesignCode: string;
  grade: string;
  quantity: string;
  rate: string;
  /** Per cubic metre pumped; null when the customer pours by themselves */
  pumpRate: string | null;
  pourDate: string | null;
  validUntil: string | null;
  notes: string | null;
  /** Delivered so far, and on the way */
  delivered: string;
  onTheWay: string;
  /** Delivered challans not yet billed */
  unbilled: string;
  value: string;
  canEdit: boolean;
  canConfirm: boolean;
  canDispatch: boolean;
  canClose: boolean;
}

export interface RmcBatchLineDto {
  itemId: string;
  itemName: string;
  unit: string;
  designQty: string;
  actualQty: string;
  /** Actual against design, in % (+ over, − under) */
  variancePct: number | null;
}

export interface RmcBatchDto {
  id: string;
  batchNo: string;
  orderId: string;
  orderNo: string;
  plantId: string;
  plantName: string;
  customer: string;
  site: string | null;
  grade: string;
  mixDesignCode: string;
  date: string;
  dispatchedAt: string;
  quantity: string;
  truck: string | null;
  driver: string | null;
  pumped: boolean;
  slumpMm: number | null;
  status: RmcBatchStatus;
  deliveredAt: string | null;
  receivedBy: string | null;
  note: string | null;
  stockEntryNo: string | null;
  invoiceNo: string | null;
  cubeTestId: string | null;
  cubeTestNo: string | null;
  cubeResult: string | null;
  /** The plant controller's batch number, when the challan was made from its batch report (item 149) */
  plantBatchNo: string | null;
  lines: RmcBatchLineDto[];
  canDeliver: boolean;
  canTakeCubes: boolean;
}

export interface RmcInvoiceDto {
  id: string;
  invoiceNo: string;
  date: string;
  plantId: string;
  plantName: string;
  clientId: string;
  customer: string;
  gstin: string | null;
  orderNo: string | null;
  status: RmcInvoiceStatus;
  quantity: string;
  concrete: string;
  pumping: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
  received: string;
  due: string;
  challans: { batchId: string; batchNo: string; date: string; quantity: string; grade: string }[];
  canCancel: boolean;
  canReceive: boolean;
}

export interface RmcReceiptDto {
  id: string;
  date: string;
  clientId: string;
  customer: string;
  invoiceId: string | null;
  invoiceNo: string | null;
  amount: string;
  mode: string;
  reference: string | null;
}

/** The plant's day: orders to pour, what has gone, by grade, and stock against what the day needs. */
export interface RmcDayDto {
  date: string;
  plantId: string | null;
  orders: RmcOrderDto[];
  batches: RmcBatchDto[];
  byGrade: { grade: string; m3: string; trucks: number }[];
  /** Materials the confirmed orders still need at their designs, against the plant's stock */
  materials: { itemId: string; itemName: string; unit: string; needed: string; inStock: string; short: boolean }[];
}

export interface RmcPlantDto {
  id: string;
  code: string;
  name: string;
}

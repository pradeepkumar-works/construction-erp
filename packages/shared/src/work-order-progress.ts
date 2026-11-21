/**
 * A subcontractor's work order against the daily reports (ARCHITECTURE "Subcontracts", From the DPR to the bill). A DPR
 * line names the work order it was done under; once the DPR is approved that quantity is what the site says the
 * subcontractor did. The bill still pays only what the measurement book holds under the order, so these figures say
 * what is reported and not yet measured (and so not yet billable), and where a bill runs past what the site reported.
 */

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
/** Quantities are kept to three places; a difference this small is rounding. */
const TOLERANCE = 0.0005;

/** One BOQ line of a work order: what the site reported under the order, what its sheets hold and what its bills took. */
export interface WorkOrderProgressLineDto {
  workOrderLineId: string;
  boqItemId: string;
  itemNo: string;
  description: string;
  unit: string;
  /** The order's quantity on the line */
  orderQty: string;
  /** Approved DPR lines (and approved progress entries) that name the order, through activities recording the item's own unit */
  reportedQty: string;
  /** Measurement sheets tagged to the order, all but the rejected ones */
  measuredQty: string;
  /** What the order's bills took, all but the rejected ones */
  billedQty: string;
  /** Reported less measured, never below zero: a sheet can start from these days */
  toMeasureQty: string;
  /** How many approved days make up the reported quantity */
  days: number;
  /** The last approved day reported under the order, YYYY-MM-DD */
  lastReportedOn: string | null;
  /** Activities of the item reported under the order in another unit, so their days are not counted */
  otherUnitActivities: string[];
}

export interface WorkOrderProgressDto {
  workOrderId: string;
  woNo: string;
  projectId: string;
  /** Only days up to this one count, YYYY-MM-DD; null for everything so far */
  upTo: string | null;
  /** Whether any approved day names the order at all: with none, there is nothing to hold a bill against */
  reported: boolean;
  lines: WorkOrderProgressLineDto[];
}

/** What the site reported under the order that no sheet of the order holds yet. */
export const orderToMeasure = (reported: number, measured: number) => round3(Math.max(0, reported - measured));

/**
 * How far a bill takes a line past what the site reported under the order up to the bill's day; null when it does not.
 * Never asked of an order no DPR names (the site may not tag its lines) or of the order's own items.
 */
export function billedPastReported(f: { uptoQty: number; reported: number }): number | null {
  const over = round3(f.uptoQty - f.reported);
  return over > TOLERANCE ? over : null;
}

/** The figures of one line from its three sums. */
export function orderLineProgress(f: { reported: number; measured: number; billed: number }) {
  return { reported: round3(f.reported), measured: round3(f.measured), billed: round3(f.billed), toMeasure: orderToMeasure(f.reported, f.measured) };
}

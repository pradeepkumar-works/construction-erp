/**
 * Material reconciliation: what the work done should have used against what the store issued to site.
 *
 * A norm says how much of a store item one unit of a BOQ item uses (8.2 bags of cement per cum of M25, say) and how
 * much wastage over that is allowed. Theoretical consumption = approved progress on the BOQ item × the norm, summed
 * over the BOQ items that use the item. Consumed = issued to site − returned from site. Transfers to other projects,
 * returns to the supplier and stock adjustments are not consumption.
 */

/** Consumption this far below theoretical is flagged too: progress may be over-reported or issues not recorded. */
export const RECONCILIATION_UNDER_PCT = 5;

export const RECONCILIATION_STATUSES = ['OVER', 'UNDER', 'WITHIN', 'NO_WORK'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  OVER: 'Over allowance',
  UNDER: 'Below theoretical',
  WITHIN: 'Within allowance',
  NO_WORK: 'No work yet',
};

/** What each status asks someone to do, for the page's legend and tooltips. */
export const RECONCILIATION_STATUS_HINTS: Record<ReconciliationStatus, string> = {
  OVER: 'More was used than the work allows, wastage included. Check for wastage, theft or issues booked to the wrong project.',
  UNDER: `Less was used than the work needs (by more than ${RECONCILIATION_UNDER_PCT}%). Check that progress is not over-reported and that every issue is recorded.`,
  WITHIN: 'Consumption is within the norm and its wastage allowance.',
  NO_WORK: 'No approved progress and nothing consumed yet.',
};

export interface MaterialNormDto {
  id: string;
  boqItemId: string;
  boqItemNo: string;
  boqDescription: string;
  boqUnit: string;
  itemId: string;
  itemName: string;
  itemUnit: string;
  /** Item units per unit of the BOQ item, up to six decimals */
  qtyPerUnit: string;
  /** Allowed wastage in % */
  wastagePct: string;
  note: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

/** One BOQ item's share of an item's theoretical consumption. */
export interface ReconciliationLineDto {
  normId: string;
  boqItemId: string;
  itemNo: string;
  description: string;
  unit: string;
  executedQty: string;
  qtyPerUnit: string;
  wastagePct: string;
  theoreticalQty: string;
}

export interface ReconciliationItemDto {
  itemId: string;
  itemName: string;
  unit: string;
  /** Item rate; null when there is none or the viewer may not see cost */
  rate: string | null;
  theoreticalQty: string;
  /** Theoretical plus the allowed wastage */
  allowedQty: string;
  issuedQty: string;
  returnedQty: string;
  /** Issued − returned */
  consumedQty: string;
  /** Consumed − theoretical (positive = used more) */
  varianceQty: string;
  /** Variance over theoretical in %, one decimal; null with no theoretical quantity */
  variancePct: number | null;
  status: ReconciliationStatus;
  /** Consumed beyond the allowed quantity (0 when within) */
  excessQty: string;
  /** excessQty × rate; null without a rate or for viewers without cost */
  excessValue: string | null;
  lines: ReconciliationLineDto[];
}

/** An item issued to site that no norm covers, so it cannot be reconciled yet. */
export interface UnreconciledItemDto {
  itemId: string;
  itemName: string;
  unit: string;
  consumedQty: string;
}

export interface ProjectReconciliationDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Period (inclusive); null from = since the start, to = up to today */
  from: string | null;
  to: string;
  items: ReconciliationItemDto[];
  unreconciled: UnreconciledItemDto[];
  norms: MaterialNormDto[];
  /** BOQ items with approved progress in the period and no norm */
  boqItemsWithoutNorm: number;
  overCount: number;
  underCount: number;
  /** Total excess value; null for viewers without cost */
  excessValue: string | null;
  canEditNorms: boolean;
  canSeeValues: boolean;
}

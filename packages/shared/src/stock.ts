import type { ProjectStatus, StockEntryType } from './enums';

/** Entry number prefix per type: GRN-2026-0001, ISS-2026-0001, ADJ-2026-0001, TRO-, TRI-, RTV-, RFS-. */
export const STOCK_ENTRY_PREFIX: Record<StockEntryType, string> = {
  RECEIPT: 'GRN',
  ISSUE: 'ISS',
  ADJUSTMENT: 'ADJ',
  TRANSFER_OUT: 'TRO',
  TRANSFER_IN: 'TRI',
  RETURN_TO_VENDOR: 'RTV',
  RETURN_FROM_SITE: 'RFS',
};

/** The types the store register had before v4 item 39; older phone builds only know these. */
export const LEGACY_STOCK_ENTRY_TYPES: StockEntryType[] = ['RECEIPT', 'ISSUE', 'ADJUSTMENT'];

/** Days of the stock ageing buckets: up to 30, 31 to 90, 91 to 180, over 180. */
export const STOCK_AGEING_BUCKETS = ['0-30 days', '31-90 days', '91-180 days', 'Over 180 days'] as const;

/** Bucket index for stock received `days` ago. */
export const stockAgeingBucket = (days: number): number => (days <= 30 ? 0 : days <= 90 ? 1 : days <= 180 ? 2 : 3);

/**
 * An item is low when a minimum is set and the balance is below it. A minimum of 0 never alerts.
 * Quantities are decimal strings as the API sends them.
 */
export function isLowStock(balance: string | number, minQty: string | number | null | undefined): boolean {
  if (minQty === null || minQty === undefined || minQty === '') return false;
  const min = Number(minQty);
  return min > 0 && Number(balance) < min;
}

/** True when a stock change takes the balance from at-or-above the minimum to below it (the moment to alert). */
export const crossesBelowMin = (before: string | number, after: string | number, minQty: string | number | null | undefined): boolean =>
  !isLowStock(before, minQty) && isLowStock(after, minQty);

/** GET /stock/stores: a central store or yard (v6 item 106) with what it holds and what is on the road. */
export interface StoreSummaryDto {
  id: string;
  code: string;
  name: string;
  location: string | null;
  status: ProjectStatus;
  /** Items with a balance above zero */
  items: number;
  /** At the item master rate; null when the user may not see stock value */
  value: string | null;
  /** Items below their minimum */
  low: number;
  lastMovement: string | null;
  /** Transfers sent from the store and not yet received at the site */
  outInTransit: number;
  /** Transfers on their way to the store */
  inInTransit: number;
  /** The user keeps this store, so may receive, issue and send from it */
  canKeep: boolean;
}

/** GET /stock/destinations: where a stock keeper can send material, every open site and store of the company. */
export interface StockDestinationDto {
  id: string;
  code: string;
  name: string;
  store: boolean;
}

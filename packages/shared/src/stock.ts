import type { StockEntryType } from './enums';

/** Entry number prefix per type: GRN-2026-0001, ISS-2026-0001, ADJ-2026-0001. */
export const STOCK_ENTRY_PREFIX: Record<StockEntryType, string> = { RECEIPT: 'GRN', ISSUE: 'ISS', ADJUSTMENT: 'ADJ' };

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

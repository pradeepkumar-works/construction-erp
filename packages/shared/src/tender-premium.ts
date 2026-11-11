/**
 * Tender premium (ARCHITECTURE "RA bills", Tender premium): a percentage-rate tender quotes a % above (+) or below (−)
 * the schedule of rates the BOQ is priced at ("4.25% above SOR"). It is kept as `Project.tenderFactor`, 1 + % / 100,
 * the factor a lump-sum contract's unit-rate items are already paid at. On an item-rate contract every item of the
 * BOQ as tendered is billed at its rate × the factor; an item added later by a variation (no original quantity) is
 * billed at the rate the client agreed for it.
 */
import type { ContractModel } from './enums';
import { billsByStages } from './stage-billing';

/** The most a tender is quoted below (−) or above (+) the schedule of rates, in %. */
export const TENDER_PREMIUM_RANGE = { min: -60, max: 100 } as const;

/** Why a tender premium cannot be saved, or null. */
export function tenderPremiumProblem(pct: number | null): string | null {
  if (pct === null) return null;
  if (!Number.isFinite(pct)) return 'Enter the tender premium as a %, for example 4.25 above or -3.5 below';
  if (pct < TENDER_PREMIUM_RANGE.min || pct > TENDER_PREMIUM_RANGE.max) return `Enter a tender premium between ${TENDER_PREMIUM_RANGE.min}% and ${TENDER_PREMIUM_RANGE.max}%`;
  return null;
}

/** 4.25 → "1.0425"; null or 0 → null (billed at the BOQ rates). */
export function factorOfPremium(pct: number | null): string | null {
  if (pct === null || pct === 0) return null;
  return String(Math.round((1 + pct / 100) * 1e6) / 1e6);
}

/** "1.0425" → 4.25; null → null. Three decimals, as tenders quote it. */
export function premiumOfFactor(factor: string | number | null): number | null {
  if (factor === null || factor === '') return null;
  const f = Number(factor);
  if (!Number.isFinite(f) || f === 1) return null;
  return Math.round((f - 1) * 100 * 1000) / 1000;
}

/**
 * Whether a BOQ item's bill rate takes the factor: on an item-rate contract, an item of the BOQ as tendered; on a
 * lump-sum or EPC contract billed by stages, a unit-rate item of the break-up.
 */
export function takesTenderFactor(model: ContractModel, item: { originalQty: number; unitRate: boolean }): boolean {
  return billsByStages(model) ? item.unitRate : item.originalQty > 0;
}

/** "4.25% above the schedule of rates", "3.5% below the schedule of rates". */
export function tenderPremiumWords(pct: number): string {
  return `${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'} the schedule of rates`;
}

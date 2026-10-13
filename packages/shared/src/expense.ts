/** GST arithmetic shared by the API and the expense forms. Amounts are rupees with two decimals. */

/** GST slabs offered in the forms; the API accepts any rate from 0 to 28. */
export const GST_RATES = [0, 5, 12, 18, 28] as const;
export const MAX_GST_RATE = 28;

/** 15-character GSTIN: 2-digit state code, PAN, entity number, Z, check character. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** GST on a taxable amount at a rate (percent), rounded to paise. */
export function gstFor(amount: string | number, rate: string | number): number {
  const a = Number(amount);
  const r = Number(rate);
  if (!Number.isFinite(a) || !Number.isFinite(r)) return 0;
  return round2((a * r) / 100);
}

/** Bills often round GST differently; a typed GST amount is accepted within one rupee of the computed one. */
export const GST_TOLERANCE = 1;

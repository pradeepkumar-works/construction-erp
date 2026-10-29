/**
 * The vendor scorecard at the L1 decision (intelligence quick win Q5): beside each quotation on the comparative
 * statement, how the vendor has delivered over the last year (on time, rejected at the gate) and where its rates sit
 * against the median of the quotations on this statement. Pure; the API counts the deliveries
 * (`QuotationsService.comparative`), the screen and the tests read them through these helpers.
 */

/** Days back a vendor's deliveries count. */
export const VENDOR_RECORD_DAYS = 365;
/** Late on this share of deliveries or more reads as a habit. */
export const VENDOR_LATE_SHARE = 0.25;
/** This share of the quantity rejected at the gate or more reads as a habit. */
export const VENDOR_REJECT_SHARE = 0.05;
/** Rates this far above the statement's median, on average, are worth a word before ordering. */
export const VENDOR_DEAR_PCT = 5;
/** Fewer deliveries say too little to judge by. */
export const VENDOR_MIN_DELIVERIES = 3;

/** A vendor's deliveries on the company's orders over `VENDOR_RECORD_DAYS`. */
export interface VendorRecordDto {
  vendorId: string;
  /** Receipts against its purchase orders */
  deliveries: number;
  /** Of them, received after the order's delivery date */
  late: number;
  /** Quantity rejected at the gate over quantity received, 0 to 1; null with nothing received */
  rejectShare: number | null;
  /** Orders approved in the period */
  orders: number;
}

export const medianOf = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Rates = Record<string, { rate: string; gstRate: string } | null>;
const landed = (r: { rate: string; gstRate: string }) => Number(r.rate) * (1 + Number(r.gstRate) / 100);

/**
 * How far a quotation's landed rates (with GST) sit from the median of the quotations on the statement, in %, averaged
 * over the lines it quoted that at least two quoted; one decimal. Negative is below the median. Null when no such line.
 */
export function rateVsMedian(lines: { rates: Rates }[], quotationId: string): number | null {
  const gaps = lines.flatMap((l) => {
    const mine = l.rates[quotationId];
    const all = Object.values(l.rates).flatMap((r) => (r ? [landed(r)] : []));
    const m = medianOf(all);
    return mine && all.length >= 2 && m && m > 0 ? [((landed(mine) - m) / m) * 100] : [];
  });
  return gaps.length ? Math.round((gaps.reduce((a, g) => a + g, 0) / gaps.length) * 10) / 10 : null;
}

export interface VendorScore {
  /** Too few deliveries to judge, or none */
  thin: boolean;
  lateHabit: boolean;
  rejectHabit: boolean;
  dear: boolean;
  /** Rates against the statement's median, % */
  ratePct: number | null;
}

/** What the scorecard says about a vendor on this statement. */
export function vendorScore(record: VendorRecordDto | undefined, ratePct: number | null): VendorScore {
  const thin = !record || record.deliveries < VENDOR_MIN_DELIVERIES;
  return {
    thin,
    lateHabit: !thin && record!.late / record!.deliveries >= VENDOR_LATE_SHARE,
    rejectHabit: !thin && (record!.rejectShare ?? 0) >= VENDOR_REJECT_SHARE,
    dear: ratePct !== null && ratePct >= VENDOR_DEAR_PCT,
    ratePct,
  };
}

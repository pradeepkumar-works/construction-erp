/**
 * The next bill: on billing readiness, what each project could bill now and what it will be
 * worth by the next bill date at the pace of the last `PACE_DAYS`. Pure; `CashForecastService.readiness` gathers the
 * figures through the measurement and stage billing services.
 */

/** Days of approved work the pace is taken over. */
export const PACE_DAYS = 30;
/** With fewer days than this left in the month, the next bill is the next month's. */
export const MIN_DAYS_TO_BILL = 5;

export interface NextBillDto {
  /** The day the forecast runs to: the month end the next bill would be made up to */
  billBy: string;
  /** Approved measurements in no bill, at BOQ rates */
  measured: number;
  /** Approved work on site no measurement holds yet, at BOQ rates */
  toMeasure: number;
  /** Lump-sum stages done beyond what was billed, at their values */
  stages: number;
  /** measured + toMeasure + stages */
  now: number;
  /** Approved work a day over the last `PACE_DAYS`, at BOQ rates; null with none */
  pacePerDay: number | null;
  /** now + pace × the days to `billBy` */
  atBillBy: number;
}

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The month end the next bill runs to: this month's, or next month's when fewer than `MIN_DAYS_TO_BILL` days are left. */
export function billDateFor(today: string): string {
  const [y, m] = today.split('-').map(Number);
  const end = iso(Date.UTC(y, m, 0));
  return (at(end) - at(today)) / DAY >= MIN_DAYS_TO_BILL ? end : iso(Date.UTC(y, m + 1, 0));
}

/** The next bill from what is billable now and the pace of the last `PACE_DAYS` (rupees, rounded). */
export function nextBill(f: { measured: number; toMeasure: number; stages: number; workLastDays: number; today: string }): NextBillDto {
  const billBy = billDateFor(f.today);
  const now = Math.round(f.measured + f.toMeasure + f.stages);
  const pacePerDay = f.workLastDays > 0 ? Math.round(f.workLastDays / PACE_DAYS) : null;
  const days = Math.max(0, Math.round((at(billBy) - at(f.today)) / DAY));
  return { billBy, measured: Math.round(f.measured), toMeasure: Math.round(f.toMeasure), stages: Math.round(f.stages), now, pacePerDay, atBillBy: now + (pacePerDay ?? 0) * days };
}

/** Lump-sum stages done beyond what was billed: each stage's value × (evidence % − billed %), never below nothing. */
export const stagesUnbilled = (stages: { value: number; evidencePct: number; billedPct: number }[]) =>
  stages.reduce((s, x) => s + (x.value * Math.max(0, x.evidencePct - x.billedPct)) / 100, 0);

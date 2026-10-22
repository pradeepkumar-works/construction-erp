/**
 * Earned value (v6 item 115) as pure functions on calendar days, tested in `src/scripts/earned-value-test.ts`. Planned
 * value comes from each activity's value at BOQ rates spread evenly over its baseline (else planned) days, earned value
 * from the share of the BOQ value done, and both are scaled to the budget at completion, so they compare with actual cost.
 */
const DAY_MS = 86_400_000;
const dayNo = (d: string) => Math.floor(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const fromDayNo = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** An activity's value at BOQ rates over the days it is planned to run (both ends counted). */
export interface PlannedSlice {
  value: number;
  start: string;
  end: string;
}

/** The share (0 to 1) of the planned value that should be done by the end of `date`. */
export function plannedShare(slices: PlannedSlice[], date: string): number {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return 0;
  const d = dayNo(date);
  let done = 0;
  for (const x of slices) {
    const a = dayNo(x.start);
    const b = Math.max(a, dayNo(x.end));
    done += x.value * Math.min(1, Math.max(0, (d - a + 1) / (b - a + 1)));
  }
  return Math.min(1, done / total);
}

/** The last day of each month from `from`'s month to `to`'s, at most `cap` of them. */
export function monthEnds(from: string, to: string, cap = 48): { month: string; end: string }[] {
  const out: { month: string; end: string }[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const last = to.slice(0, 7);
  while (out.length < cap) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (month > last) break;
    out.push({ month, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) });
    m === 12 ? ((y += 1), (m = 1)) : (m += 1);
  }
  return out;
}

/**
 * Earned schedule: the day by which the plan had as much done as is done now (the first day its planned share reaches
 * the earned share), between `start` and `end`. Null when nothing is planned.
 */
export function earnedScheduleDate(slices: PlannedSlice[], earned: number, start: string, end: string): string | null {
  if (!slices.length || slices.every((s) => s.value <= 0)) return null;
  if (earned <= 0) return start;
  let lo = dayNo(start);
  let hi = dayNo(end);
  if (plannedShare(slices, fromDayNo(hi)) < earned) return fromDayNo(hi);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (plannedShare(slices, fromDayNo(mid)) + 1e-9 >= earned) hi = mid;
    else lo = mid + 1;
  }
  return fromDayNo(lo);
}

export interface EvIndices {
  /** EV − PV: negative is behind */
  sv: number;
  /** EV − AC: negative is over cost */
  cv: number;
  spi: number | null;
  cpi: number | null;
  /** BAC / CPI: the cost at completion if the rest costs what the work so far did */
  eac: number | null;
  /** AC + (BAC − EV) / (CPI × SPI): the same when the schedule also drags on cost */
  eacWithSchedule: number | null;
  /** EAC − AC */
  etc: number | null;
  /** BAC − EAC: negative is a forecast overrun */
  vac: number | null;
  /** (BAC − EV) / (BAC − AC): the CPI the rest needs to finish on budget */
  tcpi: number | null;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** The variances, indices and forecasts from planned value, earned value and actual cost to date. */
export function indices({ bac, pv, ev, ac }: { bac: number; pv: number; ev: number; ac: number }): EvIndices {
  const spi = pv > 0 ? round(ev / pv, 2) : null;
  const cpi = ac > 0 && ev > 0 ? round(ev / ac, 2) : null;
  const eac = cpi ? round(bac / (ev / ac), 2) : null;
  const both = cpi && spi ? (ev / ac) * (ev / pv) : null;
  return {
    sv: round(ev - pv, 2),
    cv: round(ev - ac, 2),
    spi,
    cpi,
    eac,
    eacWithSchedule: both ? round(ac + (bac - ev) / both, 2) : null,
    etc: eac !== null ? round(eac - ac, 2) : null,
    vac: eac !== null ? round(bac - eac, 2) : null,
    tcpi: bac - ac > 0 ? round((bac - ev) / (bac - ac), 2) : null,
  };
}

/**
 * The finish the pace so far points to: the planned duration stretched by the schedule performance in time
 * (SPI(t) = earned schedule ÷ time elapsed, both from the start). Null before the start or with nothing earned.
 */
export function forecastFinish(start: string, plannedEnd: string, today: string, earnedOn: string | null): { spiT: number | null; finish: string | null; daysLate: number | null } {
  const elapsed = dayNo(today) - dayNo(start);
  if (!earnedOn || elapsed <= 0) return { spiT: null, finish: null, daysLate: null };
  const es = dayNo(earnedOn) - dayNo(start);
  if (es <= 0) return { spiT: 0, finish: null, daysLate: null };
  const spiT = es / elapsed;
  const duration = dayNo(plannedEnd) - dayNo(start);
  const finish = dayNo(start) + Math.round(duration / spiT);
  return { spiT: round(spiT, 2), finish: fromDayNo(finish), daysLate: finish - dayNo(plannedEnd) };
}

import {
  OM_BENCHMARK_INFO,
  OM_CHEMICAL_TOLERANCE_PCT,
  type OmBenchmark,
  type OmBenchmarkMonthDto,
  type OmBenchmarkSetting,
  type OmChemicalRowDto,
  type OmStaffLineDto,
} from '@erp/shared';
import { Prisma } from '@prisma/client';

/**
 * O&M (ARCHITECTURE "Operation and maintenance"): pure arithmetic over an O&M contract's periods, the daily
 * service levels, staff deployed and treatment chemicals, tested in `src/scripts/om-test.ts`. Dates are YYYY-MM-DD
 * strings and months YYYY-MM; money is rupees to the paisa.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;
const mulDivToPaisa = (a: number, b: number, c = 1) => new Prisma.Decimal(a).mul(b).div(c).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
const round1 = (v: number) => Math.round(v * 10) / 10;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** The first day of the month `n` months after `d`'s month (d is a first of the month). */
export function addMonths(d: string, n: number): string {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7)) - 1 + n;
  return new Date(Date.UTC(y + Math.floor(m / 12), ((m % 12) + 12) % 12, 1)).toISOString().slice(0, 10);
}

/** The last day of a month (YYYY-MM). */
export const lastOf = (month: string) => `${month}-${String(daysIn(month)).padStart(2, '0')}`;

/** The months (YYYY-MM) from `from` to `to`, both days inside them. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = `${from.slice(0, 7)}-01`; d <= to; d = addMonths(d, 1)) out.push(d.slice(0, 7));
  return out;
}

// The contract's periods

/** Instalments a year an O&M contract can be paid in: each must cover whole months. */
export const OM_INSTALMENTS = [1, 2, 3, 4, 6, 12] as const;

export interface OmTerms {
  /** A first of the month */
  startOn: string;
  years: number;
  /** % of the contract value for each year, year 1 first; a year past the list takes the last one */
  yearPcts: number[];
  instalmentsPerYear: number;
  contractValue: number | null;
}

export interface OmPeriod {
  year: number;
  instalment: number;
  label: string;
  from: string;
  to: string;
  yearPct: number;
  /** The instalment before deductions: contract value × year % ÷ instalments a year */
  amount: number;
}

const PART: Record<number, string> = { 2: 'half', 3: 'third', 4: 'quarter', 6: 'two months', 12: 'month' };

/** "Year 2, quarter 3", "Year 1, month 5", "Year 3" */
export function periodLabel(year: number, instalment: number, perYear: number): string {
  return perYear === 1 ? `Year ${year}` : `Year ${year}, ${PART[perYear] ?? 'instalment'} ${instalment}`;
}

/** What is wrong with a contract's terms, in words; null when they hold together. */
export function termsProblem(t: { startOn: string; years: number; yearPcts: number[]; instalmentsPerYear: number; population: number }): string | null {
  if (!t.startOn.endsWith('-01')) return 'O&M starts on the first of a month: choose the first of the month after completion';
  if (!Number.isInteger(t.years) || t.years < 1 || t.years > 15) return 'Give the O&M years as a whole number from 1 to 15';
  if (!(OM_INSTALMENTS as readonly number[]).includes(t.instalmentsPerYear)) return 'Instalments a year must be 1, 2, 3, 4, 6 or 12, so each covers whole months';
  if (t.yearPcts.length !== t.years) return `Give a % of the contract for each of the ${t.years} years`;
  if (t.yearPcts.some((p) => !(p > 0) || p > 25)) return 'Each year’s % of the contract must be more than 0 and at most 25';
  if (!Number.isInteger(t.population) || t.population < 1) return 'Give the population the scheme serves';
  return null;
}

/** Every instalment period of the contract, year 1 first. */
export function omPeriods(t: OmTerms): OmPeriod[] {
  const months = 12 / t.instalmentsPerYear;
  const out: OmPeriod[] = [];
  for (let year = 1; year <= t.years; year++) {
    const yearPct = t.yearPcts[year - 1] ?? t.yearPcts[t.yearPcts.length - 1] ?? 0;
    const amount = t.contractValue ? mulDivToPaisa(t.contractValue, yearPct, 100 * t.instalmentsPerYear) : 0;
    for (let instalment = 1; instalment <= t.instalmentsPerYear; instalment++) {
      const from = addMonths(t.startOn, (year - 1) * 12 + (instalment - 1) * months);
      const to = addDays(addMonths(from, months), -1);
      out.push({ year, instalment, label: periodLabel(year, instalment, t.instalmentsPerYear), from, to, yearPct, amount });
    }
  }
  return out;
}

/** The last day of the contract. */
export const omEndsOn = (t: Pick<OmTerms, 'startOn' | 'years'>) => addDays(addMonths(t.startOn, t.years * 12), -1);

/** The period a day falls in, or null outside the contract. */
export const periodOf = (periods: OmPeriod[], day: string) => periods.find((p) => p.from <= day && day <= p.to) ?? null;

// Service levels

export interface DayReading {
  date: string;
  producedKl: number;
  suppliedKl: number;
  residualChlorine: number | null;
  tailPressureM: number | null;
  complaintsReceived: number;
  complaintsClosed48h: number;
  pumpEfficiencyPct: number | null;
}

/** Litres a person a day. */
export const lpcdOf = (suppliedKl: number, population: number) => (population > 0 ? round1((suppliedKl * 1000) / population) : null);

/** Water produced that did not reach consumers, % of what was produced. */
export const lossPctOf = (producedKl: number, suppliedKl: number) => (producedKl > 0 ? round1(((producedKl - suppliedKl) / producedKl) * 100) : null);

const misses = (key: OmBenchmark, value: number | null, limit: number) => value !== null && (OM_BENCHMARK_INFO[key].direction === 'MIN' ? value < limit : value > limit);

/** A day's reading of each DAY benchmark (null when not taken). */
export function dayValue(key: OmBenchmark, d: DayReading, population: number): number | null {
  if (key === 'LPCD') return lpcdOf(d.suppliedKl, population);
  if (key === 'CHLORINE') return d.residualChlorine;
  if (key === 'PRESSURE') return d.tailPressureM;
  return null;
}

/** The DAY benchmarks a reading misses. A reading not taken misses nothing (the log shows the gap instead). */
export function dayFailures(d: DayReading, settings: OmBenchmarkSetting[], population: number): OmBenchmark[] {
  return settings.filter((s) => OM_BENCHMARK_INFO[s.key].basis === 'DAY' && misses(s.key, dayValue(s.key, d, population), Number(s.limit))).map((s) => s.key);
}

/** The month's figure of a MONTH benchmark (null without readings). */
export function monthValue(key: OmBenchmark, days: DayReading[]): number | null {
  if (key === 'WATER_LOSS') {
    const produced = days.reduce((s, d) => s + d.producedKl, 0);
    return lossPctOf(produced, days.reduce((s, d) => s + d.suppliedKl, 0));
  }
  if (key === 'COMPLAINTS') {
    const received = days.reduce((s, d) => s + d.complaintsReceived, 0);
    return received > 0 ? round1((days.reduce((s, d) => s + Math.min(d.complaintsClosed48h, d.complaintsReceived), 0) / received) * 100) : null;
  }
  if (key === 'PUMP_EFFICIENCY') {
    const readings = days.map((d) => d.pumpEfficiencyPct).filter((v): v is number => v !== null);
    return readings.length ? round1(readings.reduce((s, v) => s + v, 0) / readings.length) : null;
  }
  return null;
}

export interface StaffNorm {
  role: string;
  required: number;
  monthlyPay: number;
}

export interface MonthFigures {
  month: string;
  dueDays: number;
  loggedDays: number;
  missingDays: string[];
  /** The month is over: its MONTH benchmarks are judged */
  complete: boolean;
  benchmarks: (Omit<OmBenchmarkMonthDto, 'limit' | 'penalty'> & { limit: number; penalty: number })[];
  penalty: number;
  staff: (Omit<OmStaffLineDto, 'deduction'> & { deduction: number })[];
  staffDeduction: number;
  staffRecorded: boolean;
}

/**
 * A month of O&M: the days due a reading before today and those missing, each benchmark's failures against what the
 * month allows and the penalty for the rest, and the staff short of the minimum at the monthly pay. A MONTH benchmark is
 * judged only once the month is over; a DAY one counts each day that missed. Staff not recorded deduct nothing.
 */
export function monthFigures(args: {
  month: string;
  /** The contract's first and last day */
  startOn: string;
  endsOn: string;
  today: string;
  days: DayReading[];
  settings: OmBenchmarkSetting[];
  population: number;
  norms: StaffNorm[];
  /** Deployment recorded for the month, by role */
  deployed: Map<string, number>;
}): MonthFigures {
  const { month, startOn, endsOn, today, settings, population } = args;
  const first = `${month}-01`;
  const last = lastOf(month);
  const days = args.days.filter((d) => d.date.startsWith(month) && d.date >= startOn && d.date <= endsOn);
  const logged = new Set(days.map((d) => d.date));
  const due: string[] = [];
  // Today is not over yet: its reading is not due, and a month ending today is not judged until tomorrow.
  for (let d = first > startOn ? first : startOn; d <= last && d <= endsOn && d < today; d = addDays(d, 1)) due.push(d);
  const complete = last < today;
  const benchmarks = settings.map((s) => {
    const info = OM_BENCHMARK_INFO[s.key];
    const limit = Number(s.limit);
    let failures = 0;
    let value: number | null = null;
    const failed: string[] = [];
    if (info.basis === 'DAY') {
      for (const d of days) {
        const v = dayValue(s.key, d, population);
        if (v === null) continue;
        if (value === null || (info.direction === 'MIN' ? v < value : v > value)) value = v;
        if (misses(s.key, v, limit)) failed.push(d.date);
      }
      failures = failed.length;
    } else {
      value = monthValue(s.key, days);
      failures = complete && misses(s.key, value, limit) ? 1 : 0;
    }
    const penalised = Math.max(failures - s.allowedPerMonth, 0);
    return { key: s.key, limit, failures, allowed: s.allowedPerMonth, penalised, penalty: mulDivToPaisa(penalised, Number(s.penalty)), value, days: failed.sort() };
  });
  const staffRecorded = args.deployed.size > 0;
  const staff = args.norms.map((n) => {
    const deployed = args.deployed.has(n.role) ? args.deployed.get(n.role)! : null;
    const short = deployed === null ? 0 : Math.max(n.required - deployed, 0);
    return { role: n.role, required: n.required, deployed, short, deduction: mulDivToPaisa(short, n.monthlyPay) };
  });
  return {
    month,
    dueDays: due.length,
    loggedDays: due.filter((d) => logged.has(d)).length,
    missingDays: due.filter((d) => !logged.has(d)),
    complete,
    benchmarks,
    penalty: round2(benchmarks.reduce((s, b) => s + b.penalty, 0)),
    staff,
    staffDeduction: round2(staff.reduce((s, l) => s + l.deduction, 0)),
    staffRecorded,
  };
}

// The O&M bill

/** What an O&M bill keeps of the figures behind it (`RaBill.omDetail`). */
export interface OmBillDetail {
  label: string;
  from: string;
  to: string;
  yearPct: number;
  instalment: number;
  staff: { month: string; role: string; required: number; deployed: number; short: number; deduction: number }[];
  penalties: { month: string; key: OmBenchmark; failures: number; allowed: number; penalised: number; amount: number }[];
  staffDeduction: number;
  penalty: number;
  /** Days of the period with no reading */
  missingDays: number;
  /** Months of the period with no staff recorded */
  staffNotRecorded: string[];
}

/**
 * A period's bill: the instalment less the pay of staff short of the minimum (the work value the bill claims), and the
 * service level penalties (a deduction, like the client's other recoveries).
 */
export function omBill(period: OmPeriod, months: MonthFigures[]): { gross: number; penalty: number; detail: OmBillDetail } {
  const inPeriod = months.filter((m) => m.month >= period.from.slice(0, 7) && m.month <= period.to.slice(0, 7));
  const staff = inPeriod.flatMap((m) => m.staff.filter((l) => l.short > 0).map((l) => ({ month: m.month, role: l.role, required: l.required, deployed: l.deployed!, short: l.short, deduction: l.deduction })));
  const penalties = inPeriod.flatMap((m) => m.benchmarks.filter((b) => b.penalised > 0).map((b) => ({ month: m.month, key: b.key, failures: b.failures, allowed: b.allowed, penalised: b.penalised, amount: b.penalty })));
  const staffDeduction = round2(staff.reduce((s, l) => s + l.deduction, 0));
  const penalty = round2(penalties.reduce((s, p) => s + p.amount, 0));
  return {
    gross: round2(Math.max(period.amount - staffDeduction, 0)),
    penalty,
    detail: {
      label: period.label,
      from: period.from,
      to: period.to,
      yearPct: period.yearPct,
      instalment: period.amount,
      staff,
      penalties,
      staffDeduction,
      penalty,
      missingDays: inPeriod.reduce((s, m) => s + m.missingDays.length, 0),
      staffNotRecorded: inPeriod.filter((m) => !m.staffRecorded).map((m) => m.month),
    },
  };
}

/** Why a period cannot be billed yet, in words; null when it can. */
export function billProblem(period: OmPeriod | null, billDate: string, billed: { year: number; instalment: number }[], periods: OmPeriod[]): string | null {
  if (!period) return 'There is no such O&M period in the contract';
  if (billed.some((b) => b.year === period.year && b.instalment === period.instalment)) return `${period.label} already has its bill`;
  if (billDate < period.to) return `${period.label} runs to ${period.to}: bill it once it is over`;
  const earlier = periods.find((p) => p.to < period.from && !billed.some((b) => b.year === p.year && b.instalment === p.instalment));
  if (earlier) return `Bill ${earlier.label} first`;
  return null;
}

// Chemicals

/** A treatment chemical's use against its norm per ML of water produced. */
export function chemicalRow(norm: { perMl: number }, producedKl: number, consumedQty: number): Pick<OmChemicalRowDto, 'variancePct' | 'status'> & { producedMl: number; normQty: number } {
  const producedMl = Math.round(producedKl) / 1000;
  const normQty = Math.round(norm.perMl * producedMl * 1000) / 1000;
  if (!(normQty > 0)) return { producedMl, normQty, variancePct: null, status: 'NO_WATER' };
  const variancePct = round1(((consumedQty - normQty) / normQty) * 100);
  return { producedMl, normQty, variancePct, status: variancePct > OM_CHEMICAL_TOLERANCE_PCT ? 'OVER' : variancePct < -OM_CHEMICAL_TOLERANCE_PCT ? 'UNDER' : 'WITHIN' };
}

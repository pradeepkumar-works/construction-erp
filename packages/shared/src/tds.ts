/**
 * TDS (ARCHITECTURE "TDS returns"): the sections a contractor deducts under, their rates and thresholds, the quarters
 * and their due dates, the late fee and interest, what blocks a quarter's return and the rows of the file the Return
 * Preparation Utility (RPU) takes. Pure, so the payment form, the API and the return read the same rules. Money travels
 * as decimal strings and is worked in integer paise through BigInt, never a float; TDS, interest and fees are rounded
 * to the nearest rupee (section 288B).
 */
import type { TdsReturnForm, TdsReturnStatus } from './enums';
import { PAN_PATTERN } from './contract';

// ---------------------------------------------------------------------------------------------------------------------
// Money

/** Integer paise of a decimal string of rupees ("1250.5" → 125050n); null when it is not one. */
export function tdsPaise(amount: string | number): bigint | null {
  const s = String(amount).trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/.exec(s);
  if (!m) return null;
  const p = BigInt(m[2]) * 100n + BigInt((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -p : p;
}

const P = (amount: string | number) => tdsPaise(amount) ?? 0n;

/** Rupees with two decimals from integer paise. */
export function rupeesOfPaise(p: bigint): string {
  const neg = p < 0n;
  const a = neg ? -p : p;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
}

/** num / den rounded half up to a whole number (both positive). */
const roundDiv = (num: bigint, den: bigint) => (num * 2n + den) / (2n * den);

/** Paise rounded to the nearest rupee. */
const toRupee = (p: bigint) => roundDiv(p, 100n) * 100n;

/** A rate in thousandths of a percent ("1" → 1000, "0.1" → 100, "20" → 20000), as rates are kept. */
export type RateMilli = number;

/** "1", "0.1", "20", "1.5" from thousandths of a percent. */
export function rateText(milli: RateMilli): string {
  const whole = Math.trunc(milli / 1000);
  const frac = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

/** Thousandths of a percent from a percent string ("0.1" → 100); null when it is not one. */
export function rateMilliOf(rate: string | number): RateMilli | null {
  const m = /^(\d+)(?:\.(\d{1,3})\d*)?$/.exec(String(rate).trim());
  return m ? Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0') || '0') : null;
}

/** TDS on a base at a rate, rounded to the rupee: "125000" at 1000 (1%) → "1250.00". */
export function tdsOn(base: string, rate: RateMilli): string {
  const b = P(base);
  if (b <= 0n || rate <= 0) return '0.00';
  return rupeesOfPaise(roundDiv(b * BigInt(rate), 10_000_000n) * 100n);
}

// ---------------------------------------------------------------------------------------------------------------------
// Sections

/** Who the deductee is, for the rate: an individual or HUF (PAN's fourth letter P or H), a company (C), or anyone else. */
export type DeducteeKind = 'INDIVIDUAL' | 'COMPANY' | 'OTHER';

/** A PAN, upper-cased and checked; null when missing or malformed. */
export const validPan = (pan: string | null | undefined): string | null => {
  const p = pan?.trim().toUpperCase() ?? '';
  return PAN_PATTERN.test(p) ? p : null;
};

export function deducteeKind(pan: string | null | undefined): DeducteeKind {
  const k = validPan(pan)?.charAt(3);
  return k === 'P' || k === 'H' ? 'INDIVIDUAL' : k === 'C' ? 'COMPANY' : 'OTHER';
}

/** When TDS is due under a section: past one payment, past the year's total, past a month's, or on the excess only. */
export interface TdsThreshold {
  /** Rupees one payment or bill must exceed */
  single?: number;
  /** Rupees the year's payments to the deductee under the section must exceed */
  year?: number;
  /** Rupees a month's payments must exceed (rent) */
  month?: number;
  /** TDS only on the part of the year's purchases above this many rupees (194Q) */
  excessOver?: number;
}

export interface TdsSectionInfo {
  /** As people write it: 194C, 194I(a) */
  name: string;
  label: string;
  form: TdsReturnForm;
  /** The section code the Return Preparation Utility lists */
  code: string;
  /** The rate with a valid PAN, by who the deductee is */
  rate: (kind: DeducteeKind) => RateMilli;
  /** The rate without a PAN (section 206AA): the higher of this and the section's rate */
  noPanRate: RateMilli;
  threshold: TdsThreshold;
  /** What the section covers, for the payment form's ⓘ */
  covers: string;
}

const flat = (r: RateMilli) => () => r;

/**
 * The sections a contractor deducts under, from 1 April 2025 (Finance Act 2025 thresholds). A new section is one line;
 * its key is what a deduction stores.
 */
export const TDS_SECTIONS = {
  '192': { name: '192', label: '192 Salary', form: 'FORM_24Q', code: '92B', rate: flat(0), noPanRate: 20000, threshold: {}, covers: 'Income tax on salaries, worked out on each payslip' },
  '194A': { name: '194A', label: '194A Interest', form: 'FORM_26Q', code: '94A', rate: flat(10000), noPanRate: 20000, threshold: { year: 10000 }, covers: 'Interest other than on securities, paid by a company that is not a bank' },
  '194C': {
    name: '194C',
    label: '194C Contractors',
    form: 'FORM_26Q',
    code: '94C',
    rate: (k) => (k === 'INDIVIDUAL' ? 1000 : 2000),
    noPanRate: 20000,
    threshold: { single: 30000, year: 100000 },
    covers: 'Work contracts, labour and transport: 1% to an individual or HUF, 2% to others',
  },
  '194H': { name: '194H', label: '194H Commission', form: 'FORM_26Q', code: '94H', rate: flat(2000), noPanRate: 20000, threshold: { year: 20000 }, covers: 'Commission and brokerage' },
  '194I_A': { name: '194I(a)', label: '194I(a) Hire of machinery', form: 'FORM_26Q', code: '4IA', rate: flat(2000), noPanRate: 20000, threshold: { month: 50000 }, covers: 'Rent for plant, machinery or equipment hired without an operator' },
  '194I_B': { name: '194I(b)', label: '194I(b) Rent of land or building', form: 'FORM_26Q', code: '4IB', rate: flat(10000), noPanRate: 20000, threshold: { month: 50000 }, covers: 'Rent for land, a building, furniture or fittings' },
  '194J_A': { name: '194J(a)', label: '194J(a) Technical services', form: 'FORM_26Q', code: '4JA', rate: flat(2000), noPanRate: 20000, threshold: { year: 50000 }, covers: 'Fees for technical services' },
  '194J_B': { name: '194J(b)', label: '194J(b) Professional fees', form: 'FORM_26Q', code: '4JB', rate: flat(10000), noPanRate: 20000, threshold: { year: 50000 }, covers: 'Fees for professional services: architects, consultants, lawyers, auditors' },
  '194Q': { name: '194Q', label: '194Q Purchase of goods', form: 'FORM_26Q', code: '94Q', rate: flat(100), noPanRate: 5000, threshold: { excessOver: 5000000 }, covers: 'Goods bought from one seller above 50 lakh in the year, by a buyer whose turnover passed 10 crore' },
} as const satisfies Record<string, TdsSectionInfo>;

export type TdsSection = keyof typeof TDS_SECTIONS;
export const TDS_SECTION_KEYS = Object.keys(TDS_SECTIONS) as TdsSection[];
export const isTdsSection = (s: unknown): s is TdsSection => typeof s === 'string' && s in TDS_SECTIONS;
export const tdsSectionInfo = (s: TdsSection): TdsSectionInfo => TDS_SECTIONS[s];
/** The sections a form's deductions take: 26Q for vendors and contractors, 24Q for salaries. */
export const tdsSectionsOf = (form: TdsReturnForm): TdsSection[] => TDS_SECTION_KEYS.filter((k) => TDS_SECTIONS[k].form === form);
/** 194C, 194I(a), or "Section to confirm" for a deduction whose section is not known yet. */
export const tdsSectionName = (s: string | null | undefined): string => (isTdsSection(s) ? TDS_SECTIONS[s].name : 'Section to confirm');

/** The return's reason code on a deductee row: A a lower deduction certificate (section 197), C the higher rate without a PAN. */
export type TdsReason = 'A' | 'C';

/** A lower deduction certificate under section 197, as the rate needs it. */
export interface LowerTdsCertificate {
  certificateNo: string;
  section: string;
  /** Percent, "0.5" */
  rate: string;
  /** YYYY-MM-DD */
  validFrom: string;
  validTo: string;
  /** Rupees the certificate covers */
  limit: string;
  /** Rupees already paid under it */
  used: string;
}

export interface TdsRateResult {
  rate: RateMilli;
  reason: TdsReason | null;
  certificateNo: string | null;
  /** Why the rate is what it is, in a line */
  why: string;
}

/**
 * The rate a deduction takes: the section's rate for who the deductee is; with no valid PAN the higher of that and the
 * section's no-PAN rate (206AA: 20%, 5% under 194Q); with a lower deduction certificate for the section that is valid on
 * the day and whose limit still covers this amount, the certificate's rate. 192's rate is the payslip's own.
 */
export function tdsRate(section: TdsSection, deductee: { pan: string | null | undefined; certificate?: LowerTdsCertificate | null }, on: string, amount: string): TdsRateResult {
  const info = TDS_SECTIONS[section];
  const pan = validPan(deductee.pan);
  if (!pan) {
    const rate = Math.max(info.rate('OTHER'), info.noPanRate);
    return { rate, reason: 'C', certificateNo: null, why: `No PAN: ${rateText(rate)}% under section 206AA` };
  }
  const c = deductee.certificate;
  if (c && c.section === section && c.validFrom <= on && on <= c.validTo) {
    const certRate = rateMilliOf(c.rate);
    if (certRate !== null && P(c.used) + P(amount) <= P(c.limit)) return { rate: certRate, reason: 'A', certificateNo: c.certificateNo, why: `Lower deduction certificate ${c.certificateNo}: ${rateText(certRate)}%` };
  }
  const rate = info.rate(deducteeKind(pan));
  return { rate, reason: null, certificateNo: null, why: `${info.name} at ${rateText(rate)}%` };
}

export interface ThresholdResult {
  /** Whether TDS is due on this payment */
  due: boolean;
  /** Rupees TDS is worked out on (the excess only under 194Q) */
  base: string;
  /** Rupees paid earlier in the year that took no TDS and now must, because the year's limit is crossed */
  catchUp: string;
  why: string;
}

/**
 * Whether a payment crosses its section's threshold, given what the same deductee was paid under the section earlier
 * in the financial year (and in the month, for rent). Limits are "more than": 30,000 on the dot takes no TDS under
 * 194C. Crossing the year's limit makes TDS due on the earlier payments too (`catchUp`), which the form says.
 */
export function thresholdReached(section: TdsSection, p: { amount: string; yearBefore: string; monthBefore?: string }): ThresholdResult {
  const t: TdsThreshold = TDS_SECTIONS[section].threshold;
  const amount = P(p.amount);
  const before = P(p.yearBefore);
  const R = (n: number) => BigInt(n) * 100n;
  if (t.excessOver !== undefined) {
    const limit = R(t.excessOver);
    const over = (x: bigint) => (x > limit ? x - limit : 0n);
    const base = over(before + amount) - over(before);
    return { due: base > 0n, base: rupeesOfPaise(base), catchUp: '0.00', why: base > 0n ? `Above ${inLakh(t.excessOver)} in the year: TDS on ${rupeesOfPaise(base)}` : `Below ${inLakh(t.excessOver)} in the year` };
  }
  if (t.single === undefined && t.year === undefined && t.month === undefined) return { due: amount > 0n, base: rupeesOfPaise(amount), catchUp: '0.00', why: 'No threshold' };
  const single = t.single !== undefined && amount > R(t.single);
  const yearWas = t.year !== undefined && before > R(t.year);
  const year = t.year !== undefined && before + amount > R(t.year);
  const month = t.month !== undefined && P(p.monthBefore ?? '0') + amount > R(t.month);
  const due = single || year || month;
  // The year's limit crossed by this payment: what was paid before without TDS now takes it too.
  const catchUp = year && !yearWas && !single ? before : 0n;
  const why = !due
    ? `Below ${[t.single !== undefined ? `${inRupees(t.single)} a payment` : null, t.year !== undefined ? `${inRupees(t.year)} a year` : null, t.month !== undefined ? `${inRupees(t.month)} a month` : null].filter(Boolean).join(' and ')}: no TDS`
    : single
      ? `More than ${inRupees(t.single!)} in one payment`
      : year
        ? `More than ${inRupees(t.year!)} in the year`
        : `More than ${inRupees(t.month!)} in the month`;
  return { due, base: rupeesOfPaise(due ? amount : 0n), catchUp: rupeesOfPaise(catchUp), why };
}

const inRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const inLakh = (n: number) => `₹${n / 100000} lakh`;

// ---------------------------------------------------------------------------------------------------------------------
// Quarters and due dates

export interface TdsQuarter {
  /** 2026-27 */
  fy: string;
  quarter: 1 | 2 | 3 | 4;
  /** YYYY-MM-DD, first and last day */
  from: string;
  to: string;
  /** Q2 2026-27 */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The financial-year quarter a day falls in: April to June is Q1. */
export function quarterOf(day: string): TdsQuarter {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  const quarter = (m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4) as TdsQuarter['quarter'];
  return quarterIn(start, quarter);
}

/** Quarter `quarter` of the financial year starting in April of `startYear`. */
export function quarterIn(startYear: number, quarter: TdsQuarter['quarter']): TdsQuarter {
  const fm = 4 + (quarter - 1) * 3;
  const fy = fm > 12 ? startYear + 1 : startYear;
  const firstMonth = ((fm - 1) % 12) + 1;
  const lastMonth = firstMonth + 2;
  const fyText = `${startYear}-${pad((startYear + 1) % 100)}`;
  return { fy: fyText, quarter, from: `${fy}-${pad(firstMonth)}-01`, to: `${fy}-${pad(lastMonth)}-${pad(lastDay(fy, lastMonth))}`, label: `Q${quarter} ${fyText}` };
}

/** The quarter before or after (`step` quarters on). */
export function quarterStep(q: TdsQuarter, step: number): TdsQuarter {
  const n = Number(q.fy.slice(0, 4)) * 4 + (q.quarter - 1) + step;
  return quarterIn(Math.floor(n / 4), ((n % 4) + 1) as TdsQuarter['quarter']);
}

/** The day TDS deducted on `day` must be deposited by: the 7th of the next month, and March's by 30 April. */
export function depositDue(day: string): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  if (m === 3) return `${y}-04-30`;
  return m === 12 ? `${y + 1}-01-07` : `${y}-${pad(m + 1)}-07`;
}

/** The day a quarter's return is due: 31 July, 31 October, 31 January and 31 May (24Q and 26Q alike). */
export function returnDue(q: TdsQuarter): string {
  const start = Number(q.fy.slice(0, 4));
  return [`${start}-07-31`, `${start}-10-31`, `${start + 1}-01-31`, `${start + 1}-05-31`][q.quarter - 1];
}

/** Both of a quarter's due dates: each month's deposit and the return. */
export function dueDates(q: TdsQuarter): { deposits: { month: string; due: string }[]; returnDue: string } {
  const months = [0, 1, 2].map((i) => {
    const m = Number(q.from.slice(5, 7)) + i;
    return `${q.from.slice(0, 4)}-${pad(m)}`;
  });
  return { deposits: months.map((month) => ({ month, due: depositDue(`${month}-01`) })), returnDue: returnDue(q) };
}

const dayNo = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

// ---------------------------------------------------------------------------------------------------------------------
// Late fee and interest

/**
 * Late fee under section 234E for a return filed (or, while not filed, still unfiled on `filedOn`) after its due date:
 * ₹200 a day from the day after the due date, never more than the quarter's TDS.
 */
export function lateFee234E(p: { due: string; filedOn: string; tds: string }): { days: number; fee: string; capped: boolean } {
  const days = Math.max(0, dayNo(p.filedOn) - dayNo(p.due));
  const full = BigInt(days) * 20000n;
  const cap = toRupee(P(p.tds));
  const capped = full > cap;
  return { days, fee: rupeesOfPaise(capped ? cap : full), capped };
}

/**
 * Interest under section 201(1A) on TDS deposited after its due date: 1.5% a month or part of a month from the month
 * of deduction to the month of deposit (both counted), rounded to the rupee. Nothing when deposited in time.
 */
export function interest201(p: { deductedOn: string; depositedOn: string; tds: string }): { months: number; interest: string } {
  if (p.depositedOn <= depositDue(p.deductedOn)) return { months: 0, interest: '0.00' };
  const at = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  const months = at(p.depositedOn) - at(p.deductedOn) + 1;
  return { months, interest: rupeesOfPaise(roundDiv(P(p.tds) * 15n * BigInt(months), 100_000n) * 100n) };
}

/** A challan's interest: the sum over the deductions it covers, each counted from its own month. */
export function challanInterest(depositedOn: string, deductions: { paidOn: string; tdsAmount: string }[]): { interest: string; months: number } {
  let total = 0n;
  let months = 0;
  for (const d of deductions) {
    const i = interest201({ deductedOn: d.paidOn, depositedOn, tds: d.tdsAmount });
    total += P(i.interest);
    months = Math.max(months, i.months);
  }
  return { interest: rupeesOfPaise(total), months };
}

// ---------------------------------------------------------------------------------------------------------------------
// TAN and challans

export const TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;

/** Why a TAN cannot be saved; null when it can. */
export function tanProblem(tan: string | null | undefined): string | null {
  if (!tan?.trim()) return null;
  return TAN_PATTERN.test(tan.trim().toUpperCase()) ? null : 'A TAN is 10 characters: four letters, five digits and a letter, e.g. BBNA01234F';
}

/** Why a challan's bank details cannot be saved; null when they can. */
export function challanProblem(c: { bsrCode: string; challanSerial: string; depositedOn: string }, today: string): string | null {
  if (!/^\d{7}$/.test(c.bsrCode.trim())) return 'The BSR code is the bank branch’s 7 digits, printed on the challan';
  if (!/^\d{1,5}$/.test(c.challanSerial.trim())) return 'The challan serial is up to 5 digits, printed on the challan';
  if (c.depositedOn > today) return 'The deposit date cannot be in the future';
  return null;
}

/** A challan as people quote it: BSR code, date and serial ("0510308 · 05/11/2026 · 00012"). */
export const challanLabel = (c: { bsrCode: string; challanSerial: string; depositedOn: string }) => `${c.bsrCode} · ${ddmmyyyy(c.depositedOn)} · ${c.challanSerial.padStart(5, '0')}`;

/** dd/mm/yyyy, as the utility writes dates. */
export const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

// ---------------------------------------------------------------------------------------------------------------------
// The quarter: what blocks filing, totals and the file

/** One deduction as the return reads it. */
export interface TdsReturnDeduction {
  id: string;
  section: string | null;
  deducteeName: string;
  deducteePan: string | null;
  /** The employee's code on 24Q, the vendor's name on 26Q */
  deducteeRef: string | null;
  paidOn: string;
  amountPaid: string;
  /** Percent, null for one to confirm */
  rate: string | null;
  tdsAmount: string;
  reason: TdsReason | null;
  certificateNo: string | null;
  challanId: string | null;
}

export interface TdsReturnChallan {
  id: string;
  bsrCode: string;
  challanSerial: string;
  depositedOn: string;
  tax: string;
  interest: string;
  fee: string;
  other: string;
  minorHead: string;
}

export type TdsProblemKind = 'NO_TAN' | 'TO_CONFIRM' | 'NOT_DEPOSITED' | 'CHALLAN_MISMATCH' | 'PAN_MISSING' | 'PAN_MISSING_LOW' | 'SHORT';

export interface TdsProblem {
  kind: TdsProblemKind;
  /** Whether it stops the return being filed */
  blocks: boolean;
  deductionId: string | null;
  challanId: string | null;
  text: string;
}

/** What blocks a quarter's return and what only warns, in the order a person fixes them. */
export function returnProblems(p: { tan: string | null; deductions: TdsReturnDeduction[]; challans: TdsReturnChallan[] }): TdsProblem[] {
  const out: TdsProblem[] = [];
  if (!p.tan || tanProblem(p.tan)) out.push({ kind: 'NO_TAN', blocks: true, deductionId: null, challanId: null, text: 'The company’s TAN is missing. Enter it under Admin › Company settings' });
  for (const d of p.deductions) {
    if (!isTdsSection(d.section)) out.push({ kind: 'TO_CONFIRM', blocks: true, deductionId: d.id, challanId: null, text: `${d.deducteeName}: confirm the section of ₹${d.tdsAmount} deducted on ${ddmmyyyy(d.paidOn)}` });
    if (!d.challanId) out.push({ kind: 'NOT_DEPOSITED', blocks: true, deductionId: d.id, challanId: null, text: `${d.deducteeName}: ₹${d.tdsAmount} of ${ddmmyyyy(d.paidOn)} is in no challan. Record its challan` });
    if (!validPan(d.deducteePan)) {
      const atNoPanRate = d.rate !== null && isTdsSection(d.section) && (rateMilliOf(d.rate) ?? 0) >= Math.max(TDS_SECTIONS[d.section].noPanRate, TDS_SECTIONS[d.section].rate('OTHER'));
      out.push(
        atNoPanRate || d.section === '192'
          ? { kind: 'PAN_MISSING', blocks: false, deductionId: d.id, challanId: null, text: `${d.deducteeName} has no PAN: the row goes as PANNOTAVBL. Add their PAN` }
          : { kind: 'PAN_MISSING_LOW', blocks: true, deductionId: d.id, challanId: null, text: `${d.deducteeName} has no PAN, so TDS is due at the higher rate. Add their PAN or deduct the difference` },
      );
    }
    if (d.rate !== null && d.section !== '192') {
      const due = P(tdsOn(d.amountPaid, rateMilliOf(d.rate) ?? 0));
      if (P(d.tdsAmount) + 100n < due) out.push({ kind: 'SHORT', blocks: false, deductionId: d.id, challanId: null, text: `${d.deducteeName}: ₹${d.tdsAmount} is less than ${d.rate}% of ₹${d.amountPaid}` });
    }
  }
  const covered = new Map<string, bigint>();
  for (const d of p.deductions) if (d.challanId) covered.set(d.challanId, (covered.get(d.challanId) ?? 0n) + P(d.tdsAmount));
  for (const c of p.challans) {
    const sum = covered.get(c.id) ?? 0n;
    if (sum !== P(c.tax)) out.push({ kind: 'CHALLAN_MISMATCH', blocks: true, deductionId: null, challanId: c.id, text: `Challan ${challanLabel(c)}: tax ₹${c.tax} but its deductions this quarter come to ₹${rupeesOfPaise(sum)}` });
  }
  return out;
}

export interface TdsSectionTotal {
  section: string | null;
  name: string;
  deductions: number;
  paid: string;
  tds: string;
  deposited: string;
}

/** The quarter's totals by section, in the registry's order, a section to confirm last. */
export function totalsBySection(deductions: Pick<TdsReturnDeduction, 'section' | 'amountPaid' | 'tdsAmount' | 'challanId'>[]): TdsSectionTotal[] {
  const by = new Map<string, { n: number; paid: bigint; tds: bigint; dep: bigint }>();
  for (const d of deductions) {
    const k = isTdsSection(d.section) ? d.section : '';
    const t = by.get(k) ?? { n: 0, paid: 0n, tds: 0n, dep: 0n };
    t.n += 1;
    t.paid += P(d.amountPaid);
    t.tds += P(d.tdsAmount);
    if (d.challanId) t.dep += P(d.tdsAmount);
    by.set(k, t);
  }
  const order = [...TDS_SECTION_KEYS, ''] as string[];
  return [...by.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([k, t]) => ({ section: k || null, name: tdsSectionName(k), deductions: t.n, paid: rupeesOfPaise(t.paid), tds: rupeesOfPaise(t.tds), deposited: rupeesOfPaise(t.dep) }));
}

/** One sheet of the return file: its name, the utility's column heads and the rows. */
export interface TdsFileSheet {
  name: string;
  header: string[];
  rows: string[][];
}

export const RETURN_CHALLAN_HEADER = [
  'Sr. No.',
  'Section code',
  'TDS',
  'Surcharge',
  'Education cess',
  'Interest',
  'Fee',
  'Others',
  'Total amount deposited as per challan',
  'Cheque / DD no. (if any)',
  'BSR code',
  'Date on which tax deposited (dd/mm/yyyy)',
  'Challan serial no.',
  'Minor head of challan',
  'Whether TDS deposited by book entry',
  'Interest to be allocated',
  'Others to be allocated',
] as const;

export const RETURN_DEDUCTEE_HEADER_26Q = [
  'Challan Sr. No.',
  'Sr. No.',
  'Deductee reference no.',
  'Deductee code (01 Company, 02 Other than company)',
  'PAN of the deductee',
  'Name of the deductee',
  'Section code',
  'Date of payment or credit (dd/mm/yyyy)',
  'Amount paid or credited',
  'TDS',
  'Surcharge',
  'Education cess',
  'Total tax deducted',
  'Total tax deposited',
  'Date of deduction (dd/mm/yyyy)',
  'Rate at which deducted',
  'Reason for non-deduction, lower or higher deduction',
  'Certificate no. under section 197',
] as const;

export const RETURN_DEDUCTEE_HEADER_24Q = [
  'Challan Sr. No.',
  'Sr. No.',
  'Employee reference no.',
  'PAN of the employee',
  'Name of the employee',
  'Section code',
  'Date of payment or credit (dd/mm/yyyy)',
  'Taxable amount on which tax deducted',
  'TDS',
  'Surcharge',
  'Education cess',
  'Total tax deducted',
  'Total tax deposited',
  'Date of deduction (dd/mm/yyyy)',
  'Reason for non-deduction or lower deduction',
  'Certificate no. under section 197',
] as const;

/** A PAN the utility takes, or PANNOTAVBL for one missing. */
const panCell = (pan: string | null) => validPan(pan) ?? 'PANNOTAVBL';
const money2 = (s: string) => rupeesOfPaise(P(s));

/**
 * The return file's two sheets for a quarter, in the columns and order of the Return Preparation Utility's challan and
 * deductee (annexure I) grids: the challans numbered 1, 2, … in deposit order, and each deduction under its challan's
 * number. Dates are dd/mm/yyyy; the utility checks the file and makes the FVU. Only for a quarter with nothing
 * blocking: a deduction in no challan has no row to go under.
 */
export function returnRows(form: TdsReturnForm, challans: TdsReturnChallan[], deductions: TdsReturnDeduction[]): { challans: TdsFileSheet; deductees: TdsFileSheet } {
  const ordered = [...challans].sort((a, b) => a.depositedOn.localeCompare(b.depositedOn) || a.bsrCode.localeCompare(b.bsrCode) || a.challanSerial.localeCompare(b.challanSerial));
  const srOf = new Map(ordered.map((c, i) => [c.id, i + 1]));
  const under = (id: string) => deductions.filter((d) => d.challanId === id).sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.deducteeName.localeCompare(b.deducteeName) || a.id.localeCompare(b.id));
  const codeOf = (s: string | null) => (isTdsSection(s) ? TDS_SECTIONS[s].code : '');
  const challanRows = ordered.map((c, i) => {
    const sections = [...new Set(under(c.id).map((d) => codeOf(d.section)))];
    const total = P(c.tax) + P(c.interest) + P(c.fee) + P(c.other);
    return [String(i + 1), sections.length === 1 ? sections[0] : '', money2(c.tax), '0.00', '0.00', money2(c.interest), money2(c.fee), money2(c.other), rupeesOfPaise(total), '', c.bsrCode, ddmmyyyy(c.depositedOn), c.challanSerial.padStart(5, '0'), c.minorHead, 'No', '0.00', '0.00'];
  });
  const rows: string[][] = [];
  for (const c of ordered) {
    under(c.id).forEach((d) => {
      const sr = String(rows.length + 1);
      const common = [panCell(d.deducteePan), d.deducteeName, codeOf(d.section), ddmmyyyy(d.paidOn), money2(d.amountPaid), money2(d.tdsAmount), '0.00', '0.00', money2(d.tdsAmount), money2(d.tdsAmount), ddmmyyyy(d.paidOn)];
      rows.push(
        form === 'FORM_26Q'
          ? [String(srOf.get(c.id)), sr, d.deducteeRef ?? '', deducteeKind(d.deducteePan) === 'COMPANY' ? '01' : '02', ...common, d.rate ?? '', d.reason ?? '', d.certificateNo ?? '']
          : [String(srOf.get(c.id)), sr, d.deducteeRef ?? '', ...common, d.reason === 'A' ? 'A' : '', d.certificateNo ?? ''],
      );
    });
  }
  return {
    challans: { name: 'Challans', header: [...RETURN_CHALLAN_HEADER], rows: challanRows },
    deductees: { name: form === 'FORM_26Q' ? 'Deductees' : 'Employees', header: [...(form === 'FORM_26Q' ? RETURN_DEDUCTEE_HEADER_26Q : RETURN_DEDUCTEE_HEADER_24Q)], rows },
  };
}

/** The file's name: the TAN, the form and the quarter ("BBNA01234F_26Q_Q2_2026-27.xlsx"). */
export const returnFileName = (tan: string | null, form: TdsReturnForm, q: TdsQuarter) => `${tan ?? 'TAN'}_${form === 'FORM_26Q' ? '26Q' : '24Q'}_Q${q.quarter}_${q.fy}.xlsx`;

// ---------------------------------------------------------------------------------------------------------------------
// States and ledgers

/** Where a deduction stands: its section to confirm, waiting for a challan, or deposited. */
export const TDS_DEDUCTION_STATES = ['TO_CONFIRM', 'NOT_DEPOSITED', 'DEPOSITED'] as const;
export type TdsDeductionState = (typeof TDS_DEDUCTION_STATES)[number];
export const tdsDeductionState = (d: { section: string | null; challanId: string | null }): TdsDeductionState => (!isTdsSection(d.section) ? 'TO_CONFIRM' : d.challanId ? 'DEPOSITED' : 'NOT_DEPOSITED');
export const TDS_DEDUCTION_STATE_LABELS: Record<TdsDeductionState, string> = { TO_CONFIRM: 'Section to confirm', NOT_DEPOSITED: 'Not deposited', DEPOSITED: 'Deposited' };

/** Where a quarter's return stands, from its record and the day: not due yet, due, late, filed, or reopened for a correction. */
export const TDS_QUARTER_STATES = ['OPEN', 'DUE', 'LATE', 'FILED', 'REOPENED'] as const;
export type TdsQuarterState = (typeof TDS_QUARTER_STATES)[number];
export function tdsQuarterState(q: TdsQuarter, status: TdsReturnStatus | null, today: string): TdsQuarterState {
  if (status) return status;
  if (today <= q.to) return 'OPEN';
  return today > returnDue(q) ? 'LATE' : 'DUE';
}
export const TDS_QUARTER_STATE_LABELS: Record<TdsQuarterState, string> = { OPEN: 'Quarter running', DUE: 'To file', LATE: 'Late', FILED: 'Filed', REOPENED: 'Reopened for correction' };

/** The TDS payable ledger a section's deductions credit: salaries keep their own; each other section has one. */
export const tdsLedgerKey = (section: string | null | undefined): string => (section === '192' ? 'SALARY_TDS_PAYABLE' : isTdsSection(section) ? `TDS_PAYABLE_${section}` : 'TDS_PAYABLE');

/** The words a writer refuses with when a deduction's quarter is filed. */
export function filedQuarterWords(form: TdsReturnForm, q: TdsQuarter, what: string): string {
  return `${form === 'FORM_26Q' ? '26Q' : '24Q'} for ${q.label} is filed, so ${what} cannot change. Reopen it for a correction under Accounts › TDS returns, or date it after ${ddmmyyyy(q.to)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// API shapes

export interface TdsDeductionDto {
  id: string;
  form: TdsReturnForm;
  section: string | null;
  sectionName: string;
  state: TdsDeductionState;
  source: 'VENDOR_PAYMENT' | 'SUBCONTRACT_BILL' | 'PAYSLIP';
  /** The record it came from, as people name it, and where it opens */
  sourceLabel: string;
  sourceHref: string | null;
  vendorId: string | null;
  employeeId: string | null;
  deducteeName: string;
  deducteePan: string | null;
  deducteeRef: string | null;
  projectName: string | null;
  paidOn: string;
  amountPaid: string;
  rate: string | null;
  tdsAmount: string;
  reason: TdsReason | null;
  certificateNo: string | null;
  challanId: string | null;
  challanLabel: string | null;
  depositDue: string;
  /** Interest under 201(1A): accruing to today while not deposited after its due date, else as deposited */
  interest: string;
  interestMonths: number;
  backfilled: boolean;
  /** Whether accounts may still change its section (a payment's, its quarter not filed, in no challan) */
  canConfirm: boolean;
}

export interface TdsChallanDto {
  id: string;
  form: TdsReturnForm;
  label: string;
  bsrCode: string;
  challanSerial: string;
  depositedOn: string;
  tax: string;
  interest: string;
  fee: string;
  other: string;
  total: string;
  minorHead: string;
  deductions: number;
  /** Interest 201(1A) the deductions it covers owe for a late deposit */
  interestDue: string;
  interestMonths: number;
  late: boolean;
  createdByName: string;
  createdAt: string;
  exportedToTally: boolean;
  /** Whether it can still be deleted (its quarters not filed, not in Tally) */
  canDelete: boolean;
}

export interface TdsChallanDetailDto extends TdsChallanDto {
  items: TdsDeductionDto[];
}

export interface TdsDeducteeDto {
  key: string;
  vendorId: string | null;
  employeeId: string | null;
  name: string;
  pan: string | null;
  deductions: number;
  paid: string;
  tds: string;
  deposited: string;
}

export interface TdsQuarterDto {
  form: TdsReturnForm;
  quarter: TdsQuarter;
  state: TdsQuarterState;
  tan: string | null;
  returnDue: string;
  filedOn: string | null;
  receiptNo: string | null;
  corrections: number;
  reopenNote: string | null;
  totals: { deductions: number; paid: string; tds: string; deposited: string; notDeposited: string; interest: string; lateFee: string; lateDays: number };
  bySection: TdsSectionTotal[];
  deductions: TdsDeductionDto[];
  challans: TdsChallanDto[];
  deductees: TdsDeducteeDto[];
  problems: TdsProblem[];
  can: { record: boolean; file: boolean; reopen: boolean; exportFile: boolean };
}

export interface TdsSuggestDto {
  section: TdsSection;
  rate: string;
  reason: TdsReason | null;
  certificateNo: string | null;
  why: string;
  threshold: ThresholdResult;
  /** Rupees of TDS suggested on the base */
  tds: string;
  /** Rupees paid to the deductee under the section earlier in the financial year */
  yearBefore: string;
}

export interface TdsCertificateDto {
  id: string;
  vendorId: string;
  vendorName: string;
  section: string;
  sectionName: string;
  certificateNo: string;
  rate: string;
  validFrom: string;
  validTo: string;
  limit: string;
  used: string;
}

/** What the Form 16A print needs for one deductee in one quarter. */
export interface TdsStatementDto {
  form: TdsReturnForm;
  quarter: TdsQuarter;
  deductor: { name: string; address: string | null; tan: string | null; pan: string | null };
  deductee: { name: string; pan: string | null; ref: string | null };
  receiptNo: string | null;
  deductions: TdsDeductionDto[];
  challans: TdsChallanDto[];
  total: { paid: string; tds: string; deposited: string };
}

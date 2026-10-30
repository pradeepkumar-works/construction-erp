/**
 * Contract obligations and recoveries (item 167, ARCHITECTURE "Contract obligations and recoveries"). The contract data of a
 * works contract sets deadlines that turn into money: the programme within 15 days of the agreement or 0.20% of the contract
 * is withheld until it comes, the field laboratory within two months or the same, Rs 20,000 a month for each engineer short.
 * Each is an obligation with the date it counts from, its offset, and what missing it costs; a bill deducts what has fallen
 * due by its date, less what earlier bills took, so meeting a withholding obligation releases it on the next bill.
 * Everything here is pure; `ContractObligationsService` loads the rows and the bills.
 */

/** The day an obligation's deadline counts from; DATE is a fixed day of its own. */
export const OBLIGATION_ANCHORS = ['AGREEMENT', 'START', 'COMPLETION', 'HANDOVER', 'DATE'] as const;
export type ObligationAnchor = (typeof OBLIGATION_ANCHORS)[number];
export const OBLIGATION_ANCHOR_LABELS: Record<ObligationAnchor, string> = {
  AGREEMENT: 'Agreement date',
  START: 'Start date',
  COMPLETION: 'Completion date (with extensions)',
  HANDOVER: 'Physical completion (handover)',
  DATE: 'A date of its own',
};

/**
 * What missing the deadline costs. WITHHOLD_PCT holds a % of the contract value from bills while it is not met and gives it
 * back once it is; ONCE_PCT and ONCE_AMOUNT are recovered once and stay; PER_MONTH is an amount for every month or part of a
 * month it stays unmet; NONE is a clock with no money on it.
 */
export const OBLIGATION_PENALTIES = ['NONE', 'WITHHOLD_PCT', 'ONCE_PCT', 'PER_MONTH', 'ONCE_AMOUNT'] as const;
export type ObligationPenalty = (typeof OBLIGATION_PENALTIES)[number];
export const OBLIGATION_PENALTY_LABELS: Record<ObligationPenalty, string> = {
  NONE: 'No money on it',
  WITHHOLD_PCT: '% of the contract withheld until met',
  ONCE_PCT: '% of the contract recovered once',
  PER_MONTH: 'Amount for each month late',
  ONCE_AMOUNT: 'Amount recovered once',
};
/** Penalties whose value is a % of the contract value (the rest are rupees). */
export const PCT_PENALTIES: ObligationPenalty[] = ['WITHHOLD_PCT', 'ONCE_PCT'];

/** Who owes it: we do, or the client (the Engineer certifying the final account, a refund). The client's carry no penalty. */
export const OBLIGATION_PARTIES = ['CONTRACTOR', 'CLIENT'] as const;
export type ObligationParty = (typeof OBLIGATION_PARTIES)[number];
export const OBLIGATION_PARTY_LABELS: Record<ObligationParty, string> = { CONTRACTOR: 'We owe it', CLIENT: 'The client owes it' };

/** Where an obligation stands today. */
export const OBLIGATION_STATES = ['MET', 'MET_LATE', 'WAIVED', 'UPCOMING', 'DUE_SOON', 'OVERDUE', 'NO_DATE'] as const;
export type ObligationState = (typeof OBLIGATION_STATES)[number];
export const OBLIGATION_STATE_LABELS: Record<ObligationState, string> = {
  MET: 'Met',
  MET_LATE: 'Met late',
  WAIVED: 'Waived',
  UPCOMING: 'Upcoming',
  DUE_SOON: 'Due soon',
  OVERDUE: 'Overdue',
  NO_DATE: 'No date yet',
};
/** Tones for the state tags (antd colour names, read by `toneOf`). */
export const OBLIGATION_STATE_COLORS: Record<ObligationState, string> = {
  MET: 'green',
  MET_LATE: 'gold',
  WAIVED: 'default',
  UPCOMING: 'blue',
  DUE_SOON: 'gold',
  OVERDUE: 'red',
  NO_DATE: 'default',
};

/** Days before its deadline an obligation is due soon, and its reminder goes out. */
export const OBLIGATION_SOON_DAYS = 7;

/** One obligation of the standard set, as the two water supply tenders' contract data put them. */
export interface StandardObligation {
  code: string;
  title: string;
  clause: string;
  party: ObligationParty;
  anchor: Exclude<ObligationAnchor, 'DATE'>;
  offsetDays: number;
  offsetMonths: number;
  penalty: ObligationPenalty;
  /** % of the contract value or rupees, by `penalty`; null for NONE */
  penaltyValue: string | null;
}

/**
 * The standard obligations "Add the standard obligations" puts on a contract, each changeable afterwards. Taken from the
 * General Conditions and contract data of a state's turnkey water supply tender (clauses 6, 13, 17 and 36).
 */
export const STANDARD_OBLIGATIONS: StandardObligation[] = [
  { code: 'PROGRAMME', title: 'Submit the construction programme', clause: 'GCC 13.1', party: 'CONTRACTOR', anchor: 'AGREEMENT', offsetDays: 15, offsetMonths: 0, penalty: 'WITHHOLD_PCT', penaltyValue: '0.2' },
  { code: 'FIELD_LAB', title: 'Set up the field laboratory', clause: 'GCC 17.2', party: 'CONTRACTOR', anchor: 'AGREEMENT', offsetDays: 0, offsetMonths: 2, penalty: 'WITHHOLD_PCT', penaltyValue: '0.2' },
  { code: 'TECHNICAL_STAFF', title: 'Deploy the technical staff the bid named', clause: 'GCC 6.1', party: 'CONTRACTOR', anchor: 'START', offsetDays: 0, offsetMonths: 0, penalty: 'PER_MONTH', penaltyValue: '20000' },
  { code: 'FINAL_ACCOUNT', title: 'Send the final account', clause: 'GCC 36.1', party: 'CONTRACTOR', anchor: 'HANDOVER', offsetDays: 21, offsetMonths: 0, penalty: 'NONE', penaltyValue: null },
  { code: 'FINAL_ACCOUNT_CERTIFIED', title: 'Engineer certifies the final account', clause: 'GCC 36.1', party: 'CLIENT', anchor: 'HANDOVER', offsetDays: 66, offsetMonths: 0, penalty: 'NONE', penaltyValue: null },
];

/** The project's days an anchor reads, as YYYY-MM-DD or null when not known yet. */
export type ObligationAnchors = Record<Exclude<ObligationAnchor, 'DATE'>, string | null>;

/** What the rules read of an obligation. */
export interface ObligationTerms {
  party: ObligationParty;
  anchor: ObligationAnchor;
  offsetDays: number;
  offsetMonths: number;
  /** The day itself, for anchor DATE */
  dueOn: string | null;
  penalty: ObligationPenalty;
  penaltyValue: string | null;
  metOn: string | null;
  waived: boolean;
}

const DAY_MS = 86_400_000;
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Whole days from a to b (negative when b is before a). */
export const daysFrom = (a: string, b: string) => Math.round((day(b) - day(a)) / DAY_MS);

/** A day plus whole months (the 31st of a short month becomes its last day) and days. */
export function addMonthsDays(from: string, months: number, days: number): string {
  const d = new Date(day(from));
  if (months) {
    const target = d.getUTCMonth() + months;
    const dom = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(target);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dom, last));
  }
  return iso(d.getTime() + days * DAY_MS);
}

/** The deadline: the anchor's day moved by the offset, the obligation's own day for DATE, null while the anchor is not known. */
export function obligationDue(o: Pick<ObligationTerms, 'anchor' | 'offsetDays' | 'offsetMonths' | 'dueOn'>, anchors: ObligationAnchors): string | null {
  if (o.anchor === 'DATE') return o.dueOn;
  const from = anchors[o.anchor];
  return from ? addMonthsDays(from, o.offsetMonths, o.offsetDays) : null;
}

/** Where it stands on `today`: met (on or before the deadline) or met late, waived, or open and upcoming, due soon, overdue. */
export function obligationState(o: Pick<ObligationTerms, 'metOn' | 'waived'>, due: string | null, today: string): ObligationState {
  if (o.waived) return 'WAIVED';
  if (o.metOn) return due && o.metOn > due ? 'MET_LATE' : 'MET';
  if (!due) return 'NO_DATE';
  if (today > due) return 'OVERDUE';
  return daysFrom(today, due) <= OBLIGATION_SOON_DAYS ? 'DUE_SOON' : 'UPCOMING';
}

/** Months, whole or begun, from the day after the deadline to `until` (0 when `until` is not after it). */
export function monthsLate(due: string, until: string): number {
  if (until <= due) return 0;
  let months = 0;
  while (addMonthsDays(due, months, 0) < until) months += 1;
  return months;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What the obligation costs as of `asOf` (a bill's date): nothing before its deadline, when waived, owed by the client or
 * without a penalty. WITHHOLD_PCT is held only while unmet on that day; ONCE_ stays once incurred, even when met late;
 * PER_MONTH counts the months, whole or begun, from the deadline to the day it was met (or `asOf`).
 */
export function penaltyAsOf(o: ObligationTerms, due: string | null, asOf: string, contractValue: number): number {
  if (!due || o.waived || o.party === 'CLIENT' || o.penalty === 'NONE' || !o.penaltyValue) return 0;
  const value = Number(o.penaltyValue);
  if (!(value > 0) || asOf <= due) return 0;
  const metBy = o.metOn && o.metOn <= asOf ? o.metOn : null;
  const late = !metBy || metBy > due;
  if (!late) return 0;
  switch (o.penalty) {
    case 'WITHHOLD_PCT':
      return metBy ? 0 : round2((contractValue * value) / 100);
    case 'ONCE_PCT':
      return round2((contractValue * value) / 100);
    case 'ONCE_AMOUNT':
      return round2(value);
    case 'PER_MONTH':
      return round2(value * monthsLate(due, metBy ?? asOf));
    default:
      return 0;
  }
}

/** A bill's line for one obligation: what is due as of the bill, what earlier bills took, and this bill's share. */
export interface ObligationBillLine {
  obligationId: string;
  title: string;
  clause: string | null;
  penalty: ObligationPenalty;
  /** What the obligation costs as of the bill's date */
  upto: number;
  /** What earlier bills deducted for it */
  previous: number;
  /** upto − previous: deducted on this bill, negative when it gives back what was withheld */
  amount: number;
}

/**
 * The recovery lines of a bill dated `asOf`: every obligation whose cost as of that day differs from what earlier bills
 * took (one fully taken already has no line). Released withholdings come out negative, as milestone slippage does.
 */
export function billRecoveryLines(
  obligations: (ObligationTerms & { id: string; title: string; clause: string | null; due: string | null })[],
  asOf: string,
  contractValue: number,
  previous: Map<string, number>,
): ObligationBillLine[] {
  const lines: ObligationBillLine[] = [];
  const seen = new Set<string>();
  for (const o of obligations) {
    seen.add(o.id);
    const upto = penaltyAsOf(o, o.due, asOf, contractValue);
    const before = previous.get(o.id) ?? 0;
    const amount = round2(upto - before);
    if (amount !== 0) lines.push({ obligationId: o.id, title: o.title, clause: o.clause, penalty: o.penalty, upto, previous: before, amount });
  }
  return lines;
}

/** What a saved obligation needs: a title, a day for DATE, sensible offsets and a penalty value where it has one. */
export function obligationProblem(o: Pick<ObligationTerms, 'party' | 'anchor' | 'offsetDays' | 'offsetMonths' | 'dueOn' | 'penalty' | 'penaltyValue' | 'metOn'> & { title: string }, today: string): string | null {
  if (!o.title.trim()) return 'Say what has to be done';
  if (o.anchor === 'DATE' && !o.dueOn) return 'Choose the date it is due';
  if (o.offsetDays < 0 || o.offsetDays > 3650 || o.offsetMonths < 0 || o.offsetMonths > 120) return 'Give the time allowed as 0 to 3,650 days and 0 to 120 months';
  if (o.party === 'CLIENT' && o.penalty !== 'NONE') return 'What the client owes carries no penalty on our bills: choose No money on it';
  if (o.penalty !== 'NONE') {
    const v = Number(o.penaltyValue);
    if (!o.penaltyValue || !(v > 0)) return 'Give the penalty, more than 0';
    if (PCT_PENALTIES.includes(o.penalty) && v > 100) return 'A penalty of the contract value is at most 100%';
  }
  if (o.metOn && o.metOn > today) return 'The day it was met cannot be after today';
  return null;
}

/**
 * Security deposit on a bill held to its cap (contract data 30: "5% from each running bill, up to 5% of the final contract
 * amount"): this bill's % of its work value, but no more than the cap less what earlier bills took. The cap is a % of the
 * larger of the contract value and the work billed up to this bill, so a contract that grows keeps its share.
 */
export function cappedSecurityDeposit(thisBill: number, capPct: number | null, contractValue: number, grossUpto: number, earlier: number): number {
  if (capPct === null || capPct === undefined) return thisBill;
  const cap = round2((Math.max(contractValue, grossUpto) * capPct) / 100);
  return round2(Math.max(0, Math.min(thisBill, cap - earlier)));
}

/** Count of obligations by where they stand, and what is held or recovered as of today on our side. */
export function obligationTotals(rows: { state: ObligationState; penaltyToDate: number }[]) {
  return {
    overdue: rows.filter((r) => r.state === 'OVERDUE').length,
    dueSoon: rows.filter((r) => r.state === 'DUE_SOON').length,
    open: rows.filter((r) => ['UPCOMING', 'DUE_SOON', 'OVERDUE', 'NO_DATE'].includes(r.state)).length,
    penaltyToDate: round2(rows.reduce((s, r) => s + r.penaltyToDate, 0)),
  };
}

/** One obligation of a contract as the Contract tab shows it, with its deadline and cost worked out. */
export interface ContractObligationDto {
  id: string;
  code: string | null;
  title: string;
  clause: string | null;
  party: ObligationParty;
  anchor: ObligationAnchor;
  offsetDays: number;
  offsetMonths: number;
  /** The day itself, for anchor DATE */
  dueOn: string | null;
  /** The deadline worked out from the anchor; null while the anchor is not known */
  due: string | null;
  state: ObligationState;
  /** Days past the deadline, when open and overdue or met late */
  daysLate: number | null;
  /** Days to the deadline, when open and not overdue */
  daysLeft: number | null;
  penalty: ObligationPenalty;
  penaltyValue: string | null;
  /** What it costs as of today */
  penaltyToDate: string;
  /** What bills have deducted for it so far (net of what was given back) */
  deducted: string;
  metOn: string | null;
  waived: boolean;
  note: string | null;
}

export interface ContractObligationsDto {
  projectId: string;
  anchors: ObligationAnchors;
  obligations: ContractObligationDto[];
  totals: { overdue: number; dueSoon: number; open: number; penaltyToDate: string };
  /** Standard obligations not on the contract yet (by code) */
  standardMissing: string[];
  canEdit: boolean;
}

/** A bill's recovery line for one obligation, as stored on the bill. */
export interface ObligationBillLineDto {
  obligationId: string;
  title: string;
  clause: string | null;
  penalty: ObligationPenalty;
  upto: string;
  previous: string;
  amount: string;
}

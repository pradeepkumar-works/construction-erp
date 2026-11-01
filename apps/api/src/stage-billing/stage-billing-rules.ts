import { Prisma } from '@prisma/client';
import { siblingWeights, type BillingBasis, type StageTemplate } from '@erp/shared';

/**
 * Stage billing (ARCHITECTURE "Stage billing"): pure arithmetic, tested in `src/scripts/stage-billing-test.ts`.
 * A lump-sum bill pays each component's share of the lump sum by its stages; a stage's % on a bill comes from its
 * evidence (an event, progress, supply or testing), less what earlier bills took.
 */

type D = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const HUNDRED = D(100);
export const round2 = (v: D) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const pctText = (n: number) => `${Math.round(n * 10) / 10}%`;

// The break-up

export interface ComponentInput {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  sharePct: D | null;
  basis: BillingBasis;
}

/**
 * Each stages component's share of the lump sum (its own share, × its parent's for a sub-component), % to 4 places, and
 * its value. Unit-rate components (and anything under one) take no share.
 */
export function componentShares(lumpSum: D, components: ComponentInput[]): Map<string, { sharePct: number; value: D }> {
  const byId = new Map(components.map((c) => [c.id, c]));
  const out = new Map<string, { sharePct: number; value: D }>();
  const shareOf = (c: ComponentInput, depth = 0): number | null => {
    if (c.basis !== 'STAGES' || c.sharePct === null || depth > 5) return null;
    const own = c.sharePct.toNumber();
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (!parent) return own;
    const up = shareOf(parent, depth + 1);
    return up === null ? null : (up * own) / 100;
  };
  for (const c of components) {
    const share = shareOf(c);
    if (share === null) continue;
    out.set(c.id, { sharePct: Math.round(share * 10000) / 10000, value: round2(lumpSum.mul(share).div(100)) });
  }
  return out;
}

/** A stage's value: its component's value × the stage's %. */
export const stageValue = (componentValue: D, stagePct: D) => round2(componentValue.mul(stagePct).div(100));

/** What keeps a break-up from adding up, in words; an empty list bills. */
export function breakupProblems(components: ComponentInput[], stages: { componentId: string; pct: D }[]): string[] {
  const out: string[] = [];
  const sum = (xs: D[]) => xs.reduce((s, x) => s.add(x), ZERO);
  const off = (total: D) => total.sub(100).abs().gt('0.01');
  const top = components.filter((c) => !c.parentId && c.basis === 'STAGES');
  if (top.length) {
    const total = sum(top.map((c) => c.sharePct ?? ZERO));
    if (off(total)) out.push(`The components' shares make ${pctText(total.toNumber())}, not 100%`);
  }
  for (const c of components) {
    const kids = components.filter((k) => k.parentId === c.id);
    const own = stages.filter((s) => s.componentId === c.id);
    if (c.basis !== 'STAGES') {
      if (own.length) out.push(`${c.code} ${c.name} is paid by unit rates, so it takes no stages`);
      continue;
    }
    if (c.sharePct === null) out.push(`${c.code} ${c.name} has no share`);
    if (kids.length) {
      const total = sum(kids.map((k) => k.sharePct ?? ZERO));
      if (kids.some((k) => k.basis === 'STAGES') && off(total)) out.push(`The parts of ${c.code} ${c.name} make ${pctText(total.toNumber())} of it, not 100%`);
      if (own.length) out.push(`${c.code} ${c.name} is split into parts, so its stages go on the parts`);
      continue;
    }
    if (!own.length) out.push(`${c.code} ${c.name} has no stages`);
    else {
      const total = sum(own.map((s) => s.pct));
      if (off(total)) out.push(`The stages of ${c.code} ${c.name} make ${pctText(total.toNumber())}, not 100%`);
    }
  }
  return out;
}

/** The top-level activities a built-in stage reads: those whose name starts with one of its activity names. */
export function matchStageActivities(template: StageTemplate, activities: { id: string; name: string; parentActivityId: string | null }[]): string[] {
  if (!template.activities?.length) return [];
  const names = template.activities.map((n) => n.toLowerCase());
  return activities.filter((a) => !a.parentActivityId && names.some((n) => a.name.toLowerCase().startsWith(n))).map((a) => a.id);
}

/**
 * Shares of siblings from their weights: the given weights scaled to 100, and equal shares for the rest when none is
 * given (the standard break-up from the work breakdown, whose weights are the billing shares on a lump-sum project).
 */
export function sharesFromWeights(weights: (number | null)[]): number[] {
  const w = siblingWeights(weights.map((x) => ({ weightPct: x, value: 1 })));
  const total = w.reduce((s, x) => s + x, 0);
  if (total <= 0) return weights.map(() => Math.round((100 / Math.max(1, weights.length)) * 10000) / 10000);
  const shares = w.map((x) => Math.round(((x * 100) / total) * 10000) / 10000);
  // The last takes the rounding, so they make exactly 100.
  const drift = Math.round((100 - shares.reduce((s, x) => s + x, 0)) * 10000) / 10000;
  if (shares.length) shares[shares.length - 1] = Math.round((shares[shares.length - 1] + drift) * 10000) / 10000;
  return shares;
}

// Evidence: what a stage has earned up to a day, % of the stage

export type StageEvidenceInput =
  | { trigger: 'EVENT'; achievedOn: string | null; evidence: string | null; upTo: string }
  | { trigger: 'PROGRESS'; pct: number; reads: string }
  | { trigger: 'SUPPLY'; received: number | null; scope: number | null; unit: string }
  | { trigger: 'TEST'; tested: number; scope: number; unit: string; reads?: string };

export interface StageEvidence {
  pct: number;
  text: string;
}

const qty = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-IN');

export function stageEvidence(input: StageEvidenceInput, fmtDate: (d: string) => string = (d) => d): StageEvidence {
  switch (input.trigger) {
    case 'EVENT':
      if (input.achievedOn && input.achievedOn <= input.upTo) return { pct: 100, text: `Done on ${fmtDate(input.achievedOn)}${input.evidence ? ` (${input.evidence})` : ''}` };
      return { pct: 0, text: input.achievedOn ? `Recorded for ${fmtDate(input.achievedOn)}, after this date` : 'Not recorded yet' };
    case 'PROGRESS':
      return { pct: round3(clamp(input.pct, 0, 100)), text: `${input.reads}: ${pctText(clamp(input.pct, 0, 100))} done` };
    case 'SUPPLY':
      if (input.scope === null || input.scope <= 0) return { pct: 0, text: 'Set the scope to supply' };
      if (input.received === null) return { pct: 0, text: 'No item linked, or pipe bought by weight with no weight per metre' };
      return { pct: round3(clamp((input.received / input.scope) * 100, 0, 100)), text: `${qty(input.received)} of ${qty(input.scope)} ${input.unit} received` };
    case 'TEST':
      if (input.scope <= 0) return { pct: 0, text: 'Nothing to test yet' };
      return { pct: round3(clamp((input.tested / input.scope) * 100, 0, 100)), text: `${input.reads ? `${input.reads}: ` : ''}${qty(input.tested)} of ${qty(input.scope)} ${input.unit} tested` };
  }
}

/**
 * Received of each item shared by the stages that name it, in proportion to their scope; returns what each stage was
 * supplied (null when it names no item or one that cannot be counted).
 */
export function shareSupply(stages: { id: string; itemIds: string[]; scope: number | null }[], received: Map<string, number | null>): Map<string, number | null> {
  const scopeOfItem = new Map<string, number>();
  for (const s of stages) for (const i of s.itemIds) scopeOfItem.set(i, (scopeOfItem.get(i) ?? 0) + Math.max(0, s.scope ?? 0));
  const out = new Map<string, number | null>();
  for (const s of stages) {
    if (!s.itemIds.length || s.itemIds.some((i) => received.get(i) === null)) {
      out.set(s.id, null);
      continue;
    }
    let got = 0;
    for (const i of s.itemIds) {
      const total = scopeOfItem.get(i) ?? 0;
      const r = received.get(i) ?? 0;
      got += total > 0 ? (r * Math.max(0, s.scope ?? 0)) / total : 0;
    }
    out.set(s.id, round3(got));
  }
  return out;
}

/** Progress of a set of activities: their own % weighed as siblings are (given weights, the rest by value). */
export function progressOfActivities(rows: { pct: number; weightPct: number | null; value: number }[]): number {
  if (!rows.length) return 0;
  const w = siblingWeights(rows.map((r) => ({ weightPct: r.weightPct, value: r.value })));
  const total = w.reduce((s, x) => s + x, 0);
  return total > 0 ? round3(rows.reduce((s, r, i) => s + r.pct * w[i], 0) / total) : 0;
}

// A stage on a bill

export interface StageLineResult {
  suggestedPct: number;
  thisPct: number;
  uptoPct: number;
  prevAmount: D;
  amount: D;
}

/** This bill's % if nothing is claimed by hand: the evidence less what earlier bills took, never below nothing. */
export const suggestedPct = (evidencePct: number, prevPct: number) => round3(clamp(evidencePct - prevPct, 0, 100 - prevPct));

/**
 * A stage's line: this bill's % (the suggestion, or the claim made by hand) and its amount, so that the amounts of all
 * bills add up to the stage's value at 100% (each bill takes up-to-date amount less previous amount).
 */
export function stageLine(value: D, prevPct: number, evidencePct: number, claim?: { pct: number; note: string | null } | null): StageLineResult | { problem: string } {
  const suggested = suggestedPct(evidencePct, prevPct);
  let thisPct = suggested;
  if (claim) {
    const pct = round3(claim.pct);
    if (pct < 0) return { problem: 'A stage cannot be claimed below nothing' };
    if (prevPct + pct > 100.0005) return { problem: `Only ${round3(100 - prevPct)}% of this stage is left to bill` };
    if (pct > suggested + 0.0005 && !claim.note?.trim()) return { problem: `Say why you claim more than the ${suggested}% the evidence gives` };
    thisPct = pct;
  }
  return amounts(value, prevPct, thisPct, suggested);
}

function amounts(value: D, prevPct: number, thisPct: number, suggested: number): StageLineResult {
  const uptoPct = round3(prevPct + thisPct);
  const prevAmount = round2(value.mul(prevPct).div(100));
  return { suggestedPct: suggested, thisPct, uptoPct, prevAmount, amount: round2(value.mul(uptoPct).div(100)).sub(prevAmount) };
}

/** A stage's amount on the client's certificate (the % it passed this bill). */
export function certifiedAmount(value: D, prevPct: number, certifiedPct: number): D {
  return amounts(value, prevPct, certifiedPct, certifiedPct).amount;
}

// Milestone slippage

export interface SlippageInput {
  componentId: string;
  code: string;
  name: string;
  value: D;
  /** Cumulative target by the bill's month, % of the value; null when the grid sets none */
  targetPct: number | null;
  /** Billed up to and including this bill, % of the value */
  actualPct: number;
}

export interface Tier {
  fromPct: number;
  toPct: number | null;
  withheldPct: number;
}

export interface SlippageLine {
  componentId: string;
  code: string;
  name: string;
  targetPct: number;
  actualPct: number;
  behindPct: number;
  tierPct: number;
  withheld: D;
}

export const tierFor = (behindPct: number, tiers: Tier[]) => [...tiers].sort((a, b) => a.fromPct - b.fromPct).find((t) => behindPct >= t.fromPct && (t.toPct === null || behindPct < t.toPct))?.withheldPct ?? 0;

/**
 * What the milestone grid withholds up to a bill: for each component behind its cumulative target, the tier's % of the
 * value of the work not done (target − billed). The bill's deduction is this less what earlier bills withheld, so a
 * component that catches up has its withholding released.
 */
export function slippage(components: SlippageInput[], tiers: Tier[]): { lines: SlippageLine[]; total: D } {
  const lines: SlippageLine[] = [];
  for (const c of components) {
    if (c.targetPct === null || c.targetPct <= 0 || c.actualPct >= c.targetPct - 0.0005) continue;
    const short = c.targetPct - c.actualPct;
    const behindPct = Math.round((short / c.targetPct) * 1000) / 10;
    const tierPct = tierFor(behindPct, tiers);
    const withheld = round2(c.value.mul(short).div(100).mul(tierPct).div(100));
    lines.push({ componentId: c.componentId, code: c.code, name: c.name, targetPct: round3(c.targetPct), actualPct: round3(c.actualPct), behindPct, tierPct, withheld });
  }
  return { lines, total: lines.reduce((s, l) => s.add(l.withheld), ZERO) };
}

/** The target that applies on a day: the grid's last month that has ended by then (a month's target is due at its end). */
export function targetAt(targets: { month: string; pct: number }[], day: string): number | null {
  let best: { month: string; pct: number } | null = null;
  for (const t of targets) {
    const end = monthEnd(t.month);
    if (end <= day && (!best || t.month > best.month)) best = t;
  }
  return best?.pct ?? null;
}

/** Last day of the month of a YYYY-MM-DD date. */
export function monthEnd(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** First days of the months from one date's month to another's, YYYY-MM-DD, at most `max`. */
export function monthsBetween(from: string, to: string, max = 60): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const last = to.slice(0, 7);
  while (out.length < max) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(`${key}-01`);
    if (key >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Share of an activity planned to be done by a day: none before its start, all after its end, in a straight line between. */
export function plannedFraction(start: string | null, end: string | null, day: string): number {
  if (!start || !end) return 0;
  if (day < start) return 0;
  if (day >= end) return 1;
  const s = Date.parse(start);
  const e = Date.parse(end);
  return e > s ? clamp((Date.parse(day) - s) / (e - s), 0, 1) : 1;
}

// Advance recovery in a window

/**
 * Advance recovered on a bill when the contract recovers it between two % of the contract executed: the share of the
 * window the work up to date has passed, less what earlier bills recovered, never more than is still out.
 */
export function windowRecovery(input: { advance: D; contractValue: D; executedUpto: D; fromPct: D; toPct: D; recoveredBefore: D }): D {
  const { advance, contractValue, executedUpto, fromPct, toPct, recoveredBefore } = input;
  if (advance.lte(0) || contractValue.lte(0) || toPct.lte(fromPct)) return ZERO;
  const done = executedUpto.mul(HUNDRED).div(contractValue);
  const share = Prisma.Decimal.min(Prisma.Decimal.max(done.sub(fromPct).div(toPct.sub(fromPct)), ZERO), D(1));
  const due = round2(advance.mul(share));
  const outstanding = Prisma.Decimal.max(advance.sub(recoveredBefore), ZERO);
  return Prisma.Decimal.min(Prisma.Decimal.max(due.sub(recoveredBefore), ZERO), outstanding);
}

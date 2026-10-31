/**
 * Tender bidding's figures, with no database: an item priced from its rate analysis, the rate the bid
 * quotes (the SOR rate with the tender's percentage, or the item's own or built-up rate), the bid's totals against the
 * SOR, the bids ranked L1, L2…, which status a tender may move to, and the checks on a schedule-of-rates row. Tested in
 * src/scripts/tenders-test.ts.
 */
import { Prisma } from '@prisma/client';
import type { TenderBidType, TenderStatus } from '@erp/shared';
import { builtUpRate } from '../reconciliation/reconciliation-rules';
import { daysBetween } from '../warnings/warning-rules';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);
const HUNDRED = new Dec(100);
const r2 = (v: D) => v.toDecimalPlaces(2, Dec.ROUND_HALF_UP);

export interface LineInput {
  kind: 'MATERIAL' | 'LABOUR' | 'EQUIPMENT';
  qtyPerUnit: D;
  wastagePct: D;
  rate: D | null;
}

export interface ItemInput {
  qty: D;
  sorRate: D | null;
  /** Item-rate tenders: the rate entered by hand. */
  ownRate: D | null;
  lines: LineInput[];
}

export interface Terms {
  bidType: TenderBidType;
  /** Percentage tenders: above (+) or below (-) the SOR, in %. */
  pct: D | null;
  overheadPct: D;
  profitPct: D;
}

export interface PricedItem {
  /** Per unit: null without a rate analysis. */
  material: D | null;
  labour: D | null;
  equipment: D | null;
  cost: D | null;
  overheads: D | null;
  profit: D | null;
  builtUpRate: D | null;
  /** Each line's amount for one unit (null without a rate). */
  lineAmounts: (D | null)[];
  unpriced: number;
  quotedRate: D | null;
  quotedAmount: D | null;
  sorAmount: D | null;
}

/** The SOR rate with the percentage on it, to the paisa. */
export const withPct = (rate: D, pct: D) => r2(rate.mul(HUNDRED.plus(pct)).div(HUNDRED));

/**
 * The rate an item is quoted at: on a percentage tender its SOR rate with the tender's percentage (none until both are
 * known); on an item-rate tender the rate entered by hand, else the built-up rate from its analysis.
 */
export function quotedRateOf(t: Terms, sorRate: D | null, ownRate: D | null, builtUp: D | null): D | null {
  if (t.bidType === 'PERCENTAGE') return sorRate && t.pct ? withPct(sorRate, t.pct) : null;
  return ownRate ?? builtUp;
}

/** One bid item: its rate analysis priced with overheads and profit, the rate quoted and the amounts. */
export function priceItem(item: ItemInput, t: Terms): PricedItem {
  const has = item.lines.length > 0;
  const p = builtUpRate(
    item.lines.map((l) => ({ kind: l.kind, qtyPerUnit: l.qtyPerUnit, wastagePct: l.kind === 'MATERIAL' ? l.wastagePct : null, rate: l.rate })),
    t.overheadPct,
    t.profitPct,
    item.sorRate ?? ZERO,
  );
  const builtUp = has ? r2(p.builtUpRate) : null;
  const quotedRate = quotedRateOf(t, item.sorRate, item.ownRate, builtUp);
  return {
    material: has ? p.material : null,
    labour: has ? p.labour : null,
    equipment: has ? p.equipment : null,
    cost: has ? p.cost : null,
    overheads: has ? p.overheads : null,
    profit: has ? p.profit : null,
    builtUpRate: builtUp,
    lineAmounts: p.lines.map((l) => l.amount),
    unpriced: p.unpriced,
    quotedRate,
    quotedAmount: quotedRate ? r2(item.qty.mul(quotedRate)) : null,
    sorAmount: item.sorRate ? r2(item.qty.mul(item.sorRate)) : null,
  };
}

/** `amount` against `base`, in % (e.g. 104 on 100 is "4.00"); null without a base. */
export function pctOver(amount: D | null, base: D | null): string | null {
  if (!amount || !base || base.lte(0)) return null;
  return amount.div(base).minus(1).mul(HUNDRED).toDecimalPlaces(2, Dec.ROUND_HALF_UP).toFixed(2);
}

export interface Totals {
  itemCount: number;
  analysedCount: number;
  sorAmount: D | null;
  costAmount: D;
  overheads: D;
  profit: D;
  builtUpAmount: D;
  quotedAmount: D | null;
  costPct: string | null;
  builtUpPct: string | null;
  quotedPct: string | null;
  margin: D | null;
}

/**
 * The bid's totals. The SOR value is the BOQ at its SOR rates (the client's estimate when no item has one); the quote is
 * the sum of the items' quoted amounts once every item has a rate (a percentage tender without a BOQ quotes its
 * percentage on the estimate). The margin, what the quote leaves over cost and overheads, needs every item analysed.
 */
export function tenderTotals(items: { qty: D; priced: PricedItem }[], t: Terms, estimatedValue: D | null): Totals {
  let sor = ZERO;
  let anySor = false;
  let cost = ZERO;
  let overheads = ZERO;
  let profit = ZERO;
  let quoted = ZERO;
  let allQuoted = items.length > 0;
  let analysed = 0;
  for (const { qty, priced } of items) {
    if (priced.sorAmount) {
      sor = sor.plus(priced.sorAmount);
      anySor = true;
    }
    if (priced.cost) {
      analysed++;
      cost = cost.plus(r2(qty.mul(priced.cost)));
      overheads = overheads.plus(r2(qty.mul(priced.overheads!)));
      profit = profit.plus(r2(qty.mul(priced.profit!)));
    }
    if (priced.quotedAmount) quoted = quoted.plus(priced.quotedAmount);
    else allQuoted = false;
  }
  const sorAmount = anySor ? sor : estimatedValue;
  const quotedAmount = allQuoted ? quoted : items.length === 0 && t.bidType === 'PERCENTAGE' && t.pct && estimatedValue ? withPct(estimatedValue, t.pct) : null;
  const builtUp = cost.plus(overheads).plus(profit);
  const complete = items.length > 0 && analysed === items.length;
  return {
    itemCount: items.length,
    analysedCount: analysed,
    sorAmount,
    costAmount: cost,
    overheads,
    profit,
    builtUpAmount: builtUp,
    quotedAmount,
    costPct: complete ? pctOver(cost, sorAmount) : null,
    builtUpPct: complete ? pctOver(builtUp, sorAmount) : null,
    quotedPct: pctOver(quotedAmount, sorAmount),
    margin: complete && quotedAmount ? quotedAmount.minus(cost).minus(overheads) : null,
  };
}

export interface RankedBid {
  id: string | null;
  name: string;
  amount: D;
  rank: number;
  us: boolean;
}

/** The bids lowest first, ranked L1, L2… (equal bids share a rank); ours is among them once we have quoted. */
export function rankBids(ours: { name: string; amount: D | null }, others: { id: string; name: string; amount: D }[]): RankedBid[] {
  const all = [...others.map((o) => ({ id: o.id as string | null, name: o.name, amount: o.amount, us: false })), ...(ours.amount ? [{ id: null, name: ours.name, amount: ours.amount, us: true }] : [])];
  all.sort((a, b) => a.amount.comparedTo(b.amount) || (a.us === b.us ? a.name.localeCompare(b.name) : a.us ? -1 : 1));
  let rank = 0;
  return all.map((b, i) => {
    if (i === 0 || !b.amount.eq(all[i - 1].amount)) rank = i + 1;
    return { ...b, rank };
  });
}

/** Where a tender may go from each status: forward to its result, or back one step to correct a mistake. */
const MOVES: Record<TenderStatus, TenderStatus[]> = {
  PREPARING: ['SUBMITTED', 'DROPPED', 'CANCELLED'],
  SUBMITTED: ['WON', 'LOST', 'CANCELLED', 'PREPARING'],
  WON: ['SUBMITTED'],
  LOST: ['SUBMITTED'],
  DROPPED: ['PREPARING'],
  CANCELLED: ['PREPARING'],
};

export function moveProblem(from: TenderStatus, to: TenderStatus, hasProject: boolean): string | null {
  if (from === to) return null;
  if (hasProject) return 'This tender is already a project. Its result stays as it is.';
  if (!MOVES[from].includes(to)) {
    if (to === 'WON' || to === 'LOST') return 'Record the bid as submitted before its result.';
    return 'A tender cannot move that way.';
  }
  return null;
}

/** What stops a bid going in: a percentage tender needs its percentage; an item-rate tender a rate on every item. */
export function submitProblem(bidType: TenderBidType, items: { itemNo: string; quotedRate: D | null }[], pct: D | null, quotedAmount: D | null): string | null {
  if (bidType === 'PERCENTAGE' && !pct) return 'Enter the percentage above or below the SOR you are quoting.';
  const missing = items.filter((i) => !i.quotedRate);
  if (missing.length) {
    const names = missing.slice(0, 3).map((i) => i.itemNo).join(', ');
    return bidType === 'PERCENTAGE'
      ? `Give item${missing.length === 1 ? '' : 's'} ${names}${missing.length > 3 ? '…' : ''} an SOR rate, so the percentage prices ${missing.length === 1 ? 'it' : 'them'}.`
      : `Price item${missing.length === 1 ? '' : 's'} ${names}${missing.length > 3 ? '…' : ''}: a rate analysis or a rate of its own.`;
  }
  if (!quotedAmount) return 'Add the bid BOQ, or the estimate for a percentage tender, so the bid has an amount.';
  return null;
}

/** The checks on one schedule-of-rates row from Excel. */
export function sorRowProblem(row: { code: string; description: string; unit: string; rate: string }): string | null {
  if (!row.code.trim()) return 'No item code';
  if (!row.description.trim()) return 'No description';
  if (!row.unit.trim()) return 'No unit';
  const rate = Number(row.rate);
  if (row.rate.trim() === '' || !Number.isFinite(rate)) return 'The rate is not a number';
  if (rate < 0) return 'The rate is below zero';
  if (rate >= 1e13) return 'The rate is too large';
  return null;
}

/** Days left to submit (negative once the date has passed). */
export const daysToSubmit = (submitBy: string, today: string) => daysBetween(today, submitBy);

/** 1 April of the financial year `today` falls in. */
export function fyStart(today: string): string {
  const y = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 4 ? `${y}-04-01` : `${y - 1}-04-01`;
}

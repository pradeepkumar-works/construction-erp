/**
 * Subcontract enquiries' figures (v6 item 111), with no database: a quote's totals over the items it prices, the
 * comparative statement (the lowest rate of each item and whose it is, the spread between the rates, the complete
 * quotes ranked L1, L2… with ties sharing a rank, each against the client's rates), and what stops an award or a
 * change. Tested in src/scripts/comparison-test.ts.
 */
import { Prisma } from '@prisma/client';
import type { ScEnquiryStatus } from '@erp/shared';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);
const HUNDRED = new Dec(100);
const r2 = (v: D) => v.toDecimalPlaces(2, Dec.ROUND_HALF_UP);

export interface CmpItem {
  id: string;
  quantity: D;
  /** The client's rate for a BOQ item; null for the enquiry's own item. */
  clientRate: D | null;
}

export interface CmpQuote {
  id: string;
  /** Null until their rates are in. */
  receivedOn: Date | null;
  gstRate: D;
  /** Rate per item id; an item they did not quote is missing. */
  rates: Map<string, D>;
}

export interface QuoteTotals {
  total: D;
  gst: D;
  totalWithGst: D;
  priced: number;
  complete: boolean;
}

/** A quote over the items it prices: each line rounded to the paisa, then GST on the total. */
export function quoteTotals(items: CmpItem[], q: Pick<CmpQuote, 'gstRate' | 'rates'>): QuoteTotals {
  let total = ZERO;
  let priced = 0;
  for (const it of items) {
    const rate = q.rates.get(it.id);
    if (rate === undefined) continue;
    priced += 1;
    total = total.add(r2(rate.mul(it.quantity)));
  }
  const gst = r2(total.mul(q.gstRate).div(HUNDRED));
  return { total, gst, totalWithGst: total.add(gst), priced, complete: items.length > 0 && priced === items.length };
}

export interface ItemComparison {
  itemId: string;
  lowestRate: D | null;
  lowestQuoteIds: string[];
  /** Highest over lowest, in %: how far apart the rates are. */
  spreadPct: D | null;
}

export interface QuoteComparison extends QuoteTotals {
  quoteId: string;
  received: boolean;
  /** Among the complete quotes received, lowest total first (before GST); ties share a rank. */
  rank: number | null;
  /** Under (+) or over (-) the client's value of the BOQ items it priced, in %. */
  marginPct: D | null;
}

export interface Comparison {
  items: ItemComparison[];
  quotes: QuoteComparison[];
  /** The client's value of the BOQ items asked for (own items have no client rate). */
  clientValue: D | null;
  /** The lowest complete quote(s). */
  lowestIds: string[];
}

/**
 * The comparative statement. Only received quotes count; the lowest rate of an item is found among those that priced
 * it, and only a quote pricing every item is ranked (a partial quote cannot be compared on its total). GST is left out
 * of the ranking: the company takes the credit on a registered subcontractor's bills.
 */
export function compare(items: CmpItem[], quotes: CmpQuote[]): Comparison {
  const received = quotes.filter((q) => q.receivedOn);
  const itemRows: ItemComparison[] = items.map((it) => {
    const rated = received.filter((q) => q.rates.has(it.id)).map((q) => ({ id: q.id, rate: q.rates.get(it.id)! }));
    if (!rated.length) return { itemId: it.id, lowestRate: null, lowestQuoteIds: [], spreadPct: null };
    const low = rated.reduce((m, r) => (r.rate.lt(m) ? r.rate : m), rated[0].rate);
    const high = rated.reduce((m, r) => (r.rate.gt(m) ? r.rate : m), rated[0].rate);
    return {
      itemId: it.id,
      lowestRate: low,
      lowestQuoteIds: rated.filter((r) => r.rate.eq(low)).map((r) => r.id),
      spreadPct: rated.length > 1 && low.gt(0) ? high.sub(low).mul(HUNDRED).div(low).toDecimalPlaces(2, Dec.ROUND_HALF_UP) : null,
    };
  });
  const boq = items.filter((i) => i.clientRate !== null);
  const clientValue = boq.length ? boq.reduce((s, i) => s.add(r2(i.clientRate!.mul(i.quantity))), ZERO) : null;

  const totals = quotes.map((q) => ({ q, t: quoteTotals(items, q) }));
  const ranked = totals.filter(({ q, t }) => q.receivedOn && t.complete).sort((a, b) => a.t.total.comparedTo(b.t.total));
  const rankOf = new Map<string, number>();
  ranked.forEach(({ q, t }, i) => rankOf.set(q.id, i > 0 && t.total.eq(ranked[i - 1].t.total) ? rankOf.get(ranked[i - 1].q.id)! : i + 1));

  const quoteRows: QuoteComparison[] = totals.map(({ q, t }) => {
    // The client's value of just the BOQ items this quote priced, and the quote's own amount on them.
    let client = ZERO;
    let ours = ZERO;
    for (const it of boq) {
      const rate = q.rates.get(it.id);
      if (rate === undefined) continue;
      client = client.add(r2(it.clientRate!.mul(it.quantity)));
      ours = ours.add(r2(rate.mul(it.quantity)));
    }
    return {
      quoteId: q.id,
      received: !!q.receivedOn,
      ...t,
      rank: rankOf.get(q.id) ?? null,
      marginPct: q.receivedOn && client.gt(0) ? client.sub(ours).mul(HUNDRED).div(client).toDecimalPlaces(2, Dec.ROUND_HALF_UP) : null,
    };
  });
  return { items: itemRows, quotes: quoteRows, clientValue, lowestIds: ranked.filter(({ q }) => rankOf.get(q.id) === 1).map(({ q }) => q.id) };
}

/** Why a quote cannot be awarded, or null. Awarding a quote that is not the lowest needs a reason on record. */
export function awardProblem(
  status: ScEnquiryStatus,
  hasWorkOrder: boolean,
  quote: { received: boolean; complete: boolean; rank: number | null } | null,
  note: string | null | undefined,
): string | null {
  if (status === 'CANCELLED') return 'This enquiry was cancelled. Reopen it to award a quote.';
  if (status === 'AWARDED' && hasWorkOrder) return 'This enquiry is already awarded: its work order stands.';
  if (!quote) return 'Choose the quote to award.';
  if (!quote.received) return 'Their rates are not in yet. Enter their quote first.';
  if (!quote.complete) return 'This quote does not price every item. Ask them for the missing rates, or take the items out of the enquiry.';
  if (quote.rank !== 1 && !note?.trim()) return 'This is not the lowest quote. Say why it is chosen.';
  return null;
}

/** The items can change only while the enquiry is open and before any rates are in; after that, change them on a new enquiry. */
export function itemsProblem(status: ScEnquiryStatus, receivedQuotes: number): string | null {
  if (status !== 'OPEN') return 'Only an open enquiry can change.';
  if (receivedQuotes > 0) return 'Quotes are already in against these items. Start a new enquiry to ask for different items.';
  return null;
}

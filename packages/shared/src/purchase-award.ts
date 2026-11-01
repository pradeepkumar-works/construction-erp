import type { ComparativeStatementDto } from './types';

/**
 * Award the lowest rate per item. The comparative statement marks the cheapest
 * landed rate for each line, but a purchase order is raised on one quotation, so splitting a request between the
 * winners meant raising each order by hand. These rules turn a comparative statement into one draft order per
 * winning vendor, and say what the split saves against buying everything from the cheapest single quotation.
 * The arithmetic is pure so the preview on the screen and the orders the API creates are the same.
 */

const num = (v: string | number | null | undefined) => (v == null || v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The landed rate of a quoted line: the rate with its GST, which is what the lowest per item is decided on. */
export const landedRate = (rate: string | number, gstRate: string | number) => num(rate) * (1 + num(gstRate) / 100);

export interface AwardLine {
  materialRequestItemId: string;
  itemName: string;
  specification: string | null;
  unit: string;
  /** What is still to order on the request */
  quantity: number;
  rate: number;
  gstRate: number;
  /** quantity × rate, before GST */
  amount: number;
  /** The next cheapest landed rate for the item, if another vendor quoted it */
  nextLanded: number | null;
}

export interface AwardOrder {
  quotationId: string;
  vendorId: string;
  vendorName: string;
  lines: AwardLine[];
  freight: number;
  subtotal: number;
  gstAmount: number;
  total: number;
}

/** An item the split leaves out, and why. */
export interface AwardLeftOut {
  materialRequestItemId: string;
  itemName: string;
  reason: 'ordered' | 'not quoted';
}

export interface AwardPlan {
  orders: AwardOrder[];
  leftOut: AwardLeftOut[];
  /** The split's own total, with GST and each winner's freight */
  total: number;
  /** The same quantities from the cheapest quotation that prices them all, freight included */
  singleVendor: { quotationId: string; vendorName: string; total: number } | null;
  /** What the split saves against that single order; negative when the split costs more (freight twice over) */
  saving: number | null;
}

/**
 * The split: every item still to order goes to the quotation with the lowest landed rate for it (the earliest
 * quotation on a tie, as the comparative statement marks it), grouped into one order per vendor. A winner's freight
 * is charged once in full, since it is quoted for a delivery, which is why a split can cost more than one order.
 *
 * `toOrder` is the quantity still to order per request item; an item missing from it, or zero, is already ordered.
 */
export function awardLowestPerItem(cs: ComparativeStatementDto, toOrder: Record<string, string | number>): AwardPlan {
  const orders = new Map<string, AwardOrder>();
  const leftOut: AwardLeftOut[] = [];
  for (const line of cs.lines) {
    const quantity = num(toOrder[line.materialRequestItemId]);
    if (quantity <= 0) {
      leftOut.push({ materialRequestItemId: line.materialRequestItemId, itemName: line.itemName, reason: 'ordered' });
      continue;
    }
    const quoted = cs.quotations
      .map((q) => ({ q, r: line.rates[q.id] }))
      .filter((x): x is { q: (typeof cs.quotations)[number]; r: NonNullable<(typeof line.rates)[string]> } => !!x.r)
      .map((x) => ({ ...x, landed: landedRate(x.r.rate, x.r.gstRate) }))
      .sort((a, b) => a.landed - b.landed);
    if (!quoted.length) {
      leftOut.push({ materialRequestItemId: line.materialRequestItemId, itemName: line.itemName, reason: 'not quoted' });
      continue;
    }
    const won = quoted[0];
    let order = orders.get(won.q.id);
    if (!order) {
      order = { quotationId: won.q.id, vendorId: won.q.vendorId, vendorName: won.q.vendorName, lines: [], freight: num(won.q.freight), subtotal: 0, gstAmount: 0, total: 0 };
      orders.set(won.q.id, order);
    }
    const rate = num(won.r.rate);
    const gstRate = num(won.r.gstRate);
    const amount = round2(quantity * rate);
    order.lines.push({
      materialRequestItemId: line.materialRequestItemId,
      itemName: line.itemName,
      specification: line.specification,
      unit: line.unit,
      quantity,
      rate,
      gstRate,
      amount,
      nextLanded: quoted.length > 1 ? quoted[1].landed : null,
    });
    order.subtotal = round2(order.subtotal + amount);
    order.gstAmount = round2(order.gstAmount + (amount * gstRate) / 100);
  }
  // In the order the quotations were taken, so the preview and the orders read like the comparative statement.
  const out = cs.quotations.flatMap((q) => {
    const o = orders.get(q.id);
    if (!o) return [];
    o.total = round2(o.subtotal + o.gstAmount + o.freight);
    return [o];
  });
  const total = round2(out.reduce((t, o) => t + o.total, 0));
  const single = singleVendorFor(cs, out);
  return { orders: out, leftOut, total, singleVendor: single, saving: single ? round2(single.total - total) : null };
}

/** The cheapest single quotation for the awarded items: it must price every one of them. */
function singleVendorFor(cs: ComparativeStatementDto, orders: AwardOrder[]): AwardPlan['singleVendor'] {
  const awarded = orders.flatMap((o) => o.lines);
  if (!awarded.length) return null;
  const byLine = new Map(cs.lines.map((l) => [l.materialRequestItemId, l]));
  let best: AwardPlan['singleVendor'] = null;
  for (const q of cs.quotations) {
    let total = num(q.freight);
    let prices = true;
    for (const a of awarded) {
      const r = byLine.get(a.materialRequestItemId)?.rates[q.id];
      if (!r) {
        prices = false;
        break;
      }
      total += a.quantity * landedRate(r.rate, r.gstRate);
    }
    if (!prices) continue;
    total = round2(total);
    if (!best || total < best.total) best = { quotationId: q.id, vendorName: q.vendorName, total };
  }
  return best;
}

/** Whether the split is worth offering: more than one winner, with something to order. */
export const isSplitWorthwhile = (plan: AwardPlan) => plan.orders.length > 1;

/**
 * Where a delivery goes when the order says nothing: the project's site address,
 * else the place it is in. The purchase order, the enquiry a supplier sees and the order's form all read it from here.
 */
export function siteDeliveryAddress(project: { siteAddress?: string | null; location?: string | null } | null | undefined): string | null {
  return project?.siteAddress?.trim() || project?.location?.trim() || null;
}

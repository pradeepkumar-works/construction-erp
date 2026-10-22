import { Prisma } from '@prisma/client';
import { RMC_GST_RATE } from '@erp/shared';

/**
 * RMC's figures (v6 item 104), with no database: what a truck takes out of the plant's stock at its mix design, how
 * far the weighed quantities strayed, how much more an order may dispatch, a bill's GST, and what the day's orders
 * still need against the plant's stock. Tested in `src/scripts/rmc-test.ts`.
 */
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const q3 = (v: Prisma.Decimal) => v.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
const r2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** A truck may take the order this far past its quantity (the last truck rounds up), and no further. */
export const OVER_DELIVERY_PCT = 10;

export interface DesignLine {
  itemId: string;
  /** Per cubic metre */
  quantity: Prisma.Decimal.Value;
}

/** What a batch of `m3` should weigh out of each material at its design. */
export function batchQuantities(design: DesignLine[], m3: Prisma.Decimal.Value): { itemId: string; designQty: Prisma.Decimal }[] {
  return design.map((l) => ({ itemId: l.itemId, designQty: q3(D(l.quantity).mul(m3)) }));
}

/** The weighed quantity against the design's, in % to one place (+ over, − under); null with no design quantity. */
export function variancePct(designQty: Prisma.Decimal.Value, actualQty: Prisma.Decimal.Value): number | null {
  const d = D(designQty);
  if (d.lte(0)) return null;
  return Math.round(D(actualQty).sub(d).div(d).mul(1000).toNumber()) / 10;
}

/** The batch's weighed quantities: the design's, unless the batcher's printout says otherwise for a material. */
export function actualQuantities(planned: { itemId: string; designQty: Prisma.Decimal }[], weighed: { itemId: string; actualQty: Prisma.Decimal.Value }[] | undefined) {
  const byItem = new Map((weighed ?? []).map((w) => [w.itemId, D(w.actualQty)]));
  return planned.map((p) => ({ ...p, actualQty: q3(byItem.get(p.itemId) ?? p.designQty) }));
}

export interface OrderProgress {
  delivered: Prisma.Decimal;
  onTheWay: Prisma.Decimal;
  unbilled: Prisma.Decimal;
}

/** An order's trucks: delivered, on the way, and delivered but not yet on a bill. Trucks turned back count for none. */
export function orderProgress(batches: { quantity: Prisma.Decimal.Value; status: string; invoiceId: string | null }[]): OrderProgress {
  let delivered = ZERO;
  let onTheWay = ZERO;
  let unbilled = ZERO;
  for (const b of batches) {
    if (b.status === 'DELIVERED') {
      delivered = delivered.add(b.quantity);
      if (!b.invoiceId) unbilled = unbilled.add(b.quantity);
    } else if (b.status === 'DISPATCHED') onTheWay = onTheWay.add(b.quantity);
  }
  return { delivered, onTheWay, unbilled };
}

/** How much more an order may dispatch: its quantity and the allowance past it, less what is delivered or on the way. */
export function dispatchable(ordered: Prisma.Decimal.Value, p: Pick<OrderProgress, 'delivered' | 'onTheWay'>): Prisma.Decimal {
  const cap = D(ordered).mul(100 + OVER_DELIVERY_PCT).div(100);
  const left = cap.sub(p.delivered).sub(p.onTheWay);
  return left.isNegative() ? ZERO : q3(left);
}

export interface InvoiceAmounts {
  quantity: Prisma.Decimal;
  concrete: Prisma.Decimal;
  pumping: Prisma.Decimal;
  taxable: Prisma.Decimal;
  cgst: Prisma.Decimal;
  sgst: Prisma.Decimal;
  igst: Prisma.Decimal;
  total: Prisma.Decimal;
}

/**
 * A bill for delivered challans: concrete at the order's rate, pumping at its pump rate on the trucks pumped, and GST
 * at 18% on both; inter-state as IGST, else split CGST and SGST (CGST rounded down, as the posting service splits it).
 */
export function invoiceAmounts(challans: { quantity: Prisma.Decimal.Value; pumped: boolean }[], rate: Prisma.Decimal.Value, pumpRate: Prisma.Decimal.Value | null, interState: boolean): InvoiceAmounts {
  const quantity = challans.reduce((s, c) => s.add(c.quantity), ZERO);
  const pumpedQty = challans.filter((c) => c.pumped).reduce((s, c) => s.add(c.quantity), ZERO);
  const concrete = r2(quantity.mul(rate));
  const pumping = pumpRate === null ? ZERO : r2(pumpedQty.mul(pumpRate));
  const taxable = concrete.add(pumping);
  const gst = r2(taxable.mul(RMC_GST_RATE).div(100));
  const cgst = interState ? ZERO : gst.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const sgst = interState ? ZERO : gst.sub(cgst);
  const igst = interState ? gst : ZERO;
  return { quantity, concrete, pumping, taxable, cgst, sgst, igst, total: taxable.add(gst) };
}

/** What a bill still waits for: its total less what was received against it. */
export function amountDue(total: Prisma.Decimal.Value, received: Prisma.Decimal.Value[]): Prisma.Decimal {
  const due = received.reduce((s: Prisma.Decimal, r) => s.sub(r), D(total));
  return due.isNegative() ? ZERO : due;
}

/**
 * What the orders still to pour need of each material at their designs, against the plant's stock. An order needs
 * what is left of it after its deliveries and trucks on the way.
 */
export function materialsNeeded(
  orders: { quantity: Prisma.Decimal.Value; delivered: Prisma.Decimal.Value; onTheWay: Prisma.Decimal.Value; design: DesignLine[] }[],
  stock: Map<string, Prisma.Decimal>,
): { itemId: string; needed: Prisma.Decimal; inStock: Prisma.Decimal; short: boolean }[] {
  const need = new Map<string, Prisma.Decimal>();
  for (const o of orders) {
    const left = D(o.quantity).sub(o.delivered).sub(o.onTheWay);
    if (left.lte(0)) continue;
    for (const l of o.design) need.set(l.itemId, (need.get(l.itemId) ?? ZERO).add(D(l.quantity).mul(left)));
  }
  return [...need].map(([itemId, n]) => {
    const inStock = stock.get(itemId) ?? ZERO;
    const needed = q3(n);
    return { itemId, needed, inStock, short: inStock.lt(needed) };
  });
}

/** The quote's value: concrete, and pumping on all of it when the customer wants it pumped (before GST). */
export function orderValue(quantity: Prisma.Decimal.Value, rate: Prisma.Decimal.Value, pumpRate: Prisma.Decimal.Value | null): Prisma.Decimal {
  return r2(D(quantity).mul(rate).add(pumpRate === null ? ZERO : D(quantity).mul(pumpRate)));
}

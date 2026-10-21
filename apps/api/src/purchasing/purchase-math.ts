import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MAX_GST_RATE } from '@erp/shared';

type Decimal = Prisma.Decimal;
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const ZERO = D(0);
export const sum = <T>(rows: T[], f: (r: T) => Decimal) => rows.reduce((s, r) => s.add(f(r)), ZERO);

/** Days from invoice to payment for micro and small enterprises at most (MSMED Act, section 15). */
export const MSME_MAX_PAYMENT_DAYS = 45;
/** Payment days when the PO names none. */
export const DEFAULT_PAYMENT_DAYS = 30;

/**
 * What a PO line still holds against its request line: the ordered quantity, or only what was received once the PO is
 * closed short (the balance is free to order again).
 */
export function orderedOn(l: { quantity: Decimal; purchaseOrder: { closedAt: Date | null }; stockTxns: { quantity: Decimal }[] }): Decimal {
  return l.purchaseOrder.closedAt ? sum(l.stockTxns, (t) => t.quantity) : l.quantity;
}

/**
 * What a request line still needs arranged: requested less what orders hold, what was received without an order and
 * what stock met (an issue here or a transfer in, v5 item 95). Never below zero.
 */
export function toOrderOf(i: {
  quantity: Decimal;
  poLines: Parameters<typeof orderedOn>[0][];
  stockTxns: { quantity: Decimal; purchaseOrderLineId: string | null }[];
  covers: { quantity: Decimal }[];
}): Decimal {
  const received = sum(i.stockTxns.filter((t) => !t.purchaseOrderLineId), (t) => t.quantity);
  return Prisma.Decimal.max(0, i.quantity.sub(sum(i.poLines, orderedOn)).sub(received).sub(sum(i.covers, (c) => c.quantity)));
}

export function parseQty(raw: string, what: string): Decimal {
  const q = parseNum(raw, what);
  if (q.lte(0)) throw new BadRequestException(`${what}: the quantity must be more than zero`);
  if (q.decimalPlaces() > 3) throw new BadRequestException(`${what}: use at most 3 decimals`);
  if (q.gte(1e12)) throw new BadRequestException(`${what}: the quantity is too large`);
  return q;
}

export function parseRate(raw: string, what: string): Decimal {
  const r = parseNum(raw, what);
  if (r.lt(0)) throw new BadRequestException(`${what}: the rate cannot be negative`);
  if (r.decimalPlaces() > 2) throw new BadRequestException(`${what}: the rate can have at most 2 decimals`);
  if (r.gte(1e12)) throw new BadRequestException(`${what}: the rate is too large`);
  return r;
}

export function parseGstRate(raw: string | undefined, what: string): Decimal {
  const g = parseNum(raw || '0', what);
  if (g.lt(0) || g.gt(MAX_GST_RATE)) throw new BadRequestException(`${what}: GST must be between 0 and ${MAX_GST_RATE}%`);
  if (g.decimalPlaces() > 2) throw new BadRequestException(`${what}: GST rate can have at most 2 decimals`);
  return g;
}

export function parseFreight(raw: string | undefined): Decimal {
  const f = parseNum(raw || '0', 'Freight');
  if (f.lt(0)) throw new BadRequestException('Freight cannot be negative');
  if (f.decimalPlaces() > 2) throw new BadRequestException('Freight can have at most 2 decimals');
  return f;
}

function parseNum(raw: string, what: string): Decimal {
  let n: Decimal;
  try {
    n = D(raw);
  } catch {
    throw new BadRequestException(`${what}: "${raw}" is not a number`);
  }
  if (!n.isFinite()) throw new BadRequestException(`${what}: "${raw}" is not a number`);
  return n;
}

/** quantity × rate and GST on it, each rounded to paise. */
export function lineAmounts(quantity: Decimal, rate: Decimal, gstRate: Decimal) {
  const amount = quantity.mul(rate).toDecimalPlaces(2);
  return { amount, gstAmount: amount.mul(gstRate).div(100).toDecimalPlaces(2) };
}

/** Header totals from priced lines and freight (freight carries no GST here; vendors bill it on its own line). */
export function totals(lines: { amount: Decimal; gstAmount: Decimal }[], freight: Decimal) {
  const subtotal = sum(lines, (l) => l.amount);
  const gstAmount = sum(lines, (l) => l.gstAmount);
  return { subtotal, gstAmount, total: subtotal.add(gstAmount).add(freight) };
}

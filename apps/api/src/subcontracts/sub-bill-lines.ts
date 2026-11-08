import { Prisma } from '@prisma/client';

type D = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const round2 = (v: D) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/**
 * A subcontractor bill's lines: per order line, what earlier bills took (their quantity and the amount they paid, each
 * at its own rate) and what this bill takes at the line's rate now. A BOQ line takes the approved measurements up to
 * date less what was billed; an own item the quantity entered on the bill. A line with nothing before and nothing now
 * is left out. Earlier bills are never restated, so an amended rate prices only the work this bill takes.
 */
export function subBillLines(
  orderLines: readonly { id: string; boqItemId: string | null; rate: D }[],
  earlier: readonly { workOrderLineId: string; thisQty: D; amount: D }[],
  measuredUpTo: ReadonlyMap<string, D>,
  ownQty: ReadonlyMap<string, D>,
) {
  const prevQty = new Map<string, D>();
  const prevAmount = new Map<string, D>();
  for (const b of earlier) {
    prevQty.set(b.workOrderLineId, (prevQty.get(b.workOrderLineId) ?? ZERO).add(b.thisQty));
    prevAmount.set(b.workOrderLineId, (prevAmount.get(b.workOrderLineId) ?? ZERO).add(b.amount));
  }
  return orderLines.flatMap((l, i) => {
    const before = prevQty.get(l.id) ?? ZERO;
    const thisQty = l.boqItemId ? (measuredUpTo.get(l.boqItemId) ?? ZERO).sub(before) : (ownQty.get(l.id) ?? ZERO);
    if (before.isZero() && thisQty.isZero()) return [];
    return [{ workOrderLineId: l.id, rate: l.rate, prevQty: before, prevAmount: prevAmount.get(l.id) ?? ZERO, thisQty, uptoQty: before.add(thisQty), amount: round2(thisQty.mul(l.rate)), sortOrder: i }];
  });
}

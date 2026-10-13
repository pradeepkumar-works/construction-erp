import { Prisma } from '@prisma/client';
import { pct } from './serialize';

/**
 * Physical progress of a project: activities weighted by BOQ amount (rate × planned quantity) where they
 * are linked to a BOQ item, else by planned quantity; each activity counts up to 100%.
 */
export function weightedProgress(activities: { plannedQty: Prisma.Decimal; rate: Prisma.Decimal | null; executed: Prisma.Decimal }[]): number {
  let done = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  for (const a of activities) {
    const weight = a.rate ? a.rate.mul(a.plannedQty) : a.plannedQty;
    done = done.add(weight.mul(pct(a.executed, a.plannedQty) / 100));
    total = total.add(weight);
  }
  if (total.lte(0)) return 0;
  return Math.round(done.div(total).mul(100).toNumber() * 10) / 10;
}

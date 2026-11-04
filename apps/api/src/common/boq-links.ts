import { Prisma } from '@prisma/client';
import { lumpSumShares } from '@erp/shared';
import type { PrismaService } from '../prisma/prisma.service';

/** How an activity's approved quantity counts against a BOQ item: `perUnit` of the item for each unit of the activity's. */
export interface ActivityBoq {
  boqItemId: string;
  perUnit: Prisma.Decimal;
  rate: Prisma.Decimal;
}

/**
 * Every activity's BOQ item for these projects: the item it is linked to (one for one), else its share of the lump-sum
 * item its component is priced by (`lumpSumShares`). Executed value is an entry's quantity × `perUnit` × `rate`, so
 * cost, budget, earned value and the BOQ read a lump-sum project's work done the one way.
 */
export async function activityBoqOf(prisma: PrismaService, projectIds: string[]): Promise<Map<string, ActivityBoq>> {
  const out = new Map<string, ActivityBoq>();
  if (!projectIds.length) return out;
  const where = { projectId: { in: projectIds } };
  const [activities, elements, items] = await Promise.all([
    prisma.activity.findMany({ where, select: { id: true, projectId: true, workElementId: true, parentActivityId: true, weightPct: true, plannedQty: true, boqItemId: true } }),
    prisma.workElement.findMany({ where, select: { id: true, projectId: true, parentId: true, weightPct: true } }),
    prisma.boqItem.findMany({ where, select: { id: true, projectId: true, workElementId: true, unit: true, rate: true, originalQty: true, revisedQty: true, _count: { select: { activities: true } } } }),
  ]);
  const rateOf = new Map(items.map((i) => [i.id, i.rate]));
  for (const a of activities) if (a.boqItemId && rateOf.has(a.boqItemId)) out.set(a.id, { boqItemId: a.boqItemId, perUnit: new Prisma.Decimal(1), rate: rateOf.get(a.boqItemId)! });
  for (const projectId of projectIds) {
    const own = items.filter((i) => i.projectId === projectId);
    if (!own.some((i) => i.workElementId && !i._count.activities)) continue;
    const shares = lumpSumShares(
      elements.filter((e) => e.projectId === projectId).map((e) => ({ id: e.id, parentId: e.parentId, weightPct: e.weightPct ? e.weightPct.toNumber() : null })),
      activities
        .filter((a) => a.projectId === projectId)
        .map((a) => {
          const rate = a.boqItemId ? rateOf.get(a.boqItemId) : undefined;
          return {
            id: a.id,
            workElementId: a.workElementId,
            parentActivityId: a.parentActivityId,
            weightPct: a.weightPct ? a.weightPct.toNumber() : null,
            plannedQty: a.plannedQty.toNumber(),
            executedQty: 0,
            value: (rate ? rate.mul(a.plannedQty) : a.plannedQty).toNumber(),
            boqItemId: a.boqItemId,
          };
        }),
      own.map((i) => ({ id: i.id, workElementId: i.workElementId, unit: i.unit, quantity: (i.revisedQty ?? i.originalQty).toNumber(), linked: i._count.activities })),
    );
    for (const [activityId, s] of shares) out.set(activityId, { boqItemId: s.boqItemId, perUnit: new Prisma.Decimal(s.perUnit), rate: rateOf.get(s.boqItemId)! });
  }
  return out;
}

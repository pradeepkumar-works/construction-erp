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
  // One query for the usual project, whose activities are linked to their items one for one; the activities and
  // components are read only for a project with an item that prices a component (a lump sum).
  const items = await prisma.boqItem.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true, workElementId: true, unit: true, rate: true, originalQty: true, revisedQty: true, activities: { select: { id: true } } },
  });
  const rateOf = new Map(items.map((i) => [i.id, i.rate]));
  for (const i of items) for (const a of i.activities) out.set(a.id, { boqItemId: i.id, perUnit: new Prisma.Decimal(1), rate: i.rate });
  const lumpSum = projectIds.filter((p) => items.some((i) => i.projectId === p && i.workElementId && !i.activities.length));
  if (!lumpSum.length) return out;
  const where = { projectId: { in: lumpSum } };
  const [activities, elements] = await Promise.all([
    prisma.activity.findMany({ where, select: { id: true, projectId: true, workElementId: true, parentActivityId: true, weightPct: true, plannedQty: true, boqItemId: true } }),
    prisma.workElement.findMany({ where, select: { id: true, projectId: true, parentId: true, weightPct: true } }),
  ]);
  for (const projectId of lumpSum) {
    const own = items.filter((i) => i.projectId === projectId);
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
      own.map((i) => ({ id: i.id, workElementId: i.workElementId, unit: i.unit, quantity: (i.revisedQty ?? i.originalQty).toNumber(), linked: i.activities.length })),
    );
    for (const [activityId, s] of shares) out.set(activityId, { boqItemId: s.boqItemId, perUnit: new Prisma.Decimal(s.perUnit), rate: rateOf.get(s.boqItemId)! });
  }
  return out;
}

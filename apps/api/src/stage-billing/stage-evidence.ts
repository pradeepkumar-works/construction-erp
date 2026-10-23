import { Prisma } from '@prisma/client';
import { pipeMetres, pipeSizeOf, type StageTrigger } from '@erp/shared';
import { progressRollup } from '../common/progress';
import { stageActivities } from '../pipe-network/pipe-network.service';
import { dateOnly, formatDay, parseDate } from '../common/serialize';
import { progressOfActivities, shareSupply, stageEvidence, type StageEvidence } from './stage-billing-rules';

type Db = Prisma.TransactionClient;

export interface EvidenceStage {
  id: string;
  name: string;
  trigger: StageTrigger;
  activityIds: string[];
  itemIds: string[];
  scopeQty: Prisma.Decimal | null;
  achievedOn: Date | null;
  evidence: string | null;
  component: { workElementId: string | null };
}

export const EVIDENCE_STAGE_SELECT = {
  id: true,
  name: true,
  trigger: true,
  activityIds: true,
  itemIds: true,
  scopeQty: true,
  achievedOn: true,
  evidence: true,
  component: { select: { workElementId: true } },
} satisfies Prisma.BillingStageSelect;

const listNames = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`);

/**
 * What each payment stage of a project has earned up to a day (item 129), % of the stage with the working in words:
 * - EVENT: 100 once its date has come;
 * - PROGRESS: the approved physical % of its activities on that day (of the whole component when it names none);
 * - SUPPLY: pipe or equipment received at the project by that day against the stage's scope, an item named by several
 *   stages shared by their scope (pipe bought by weight in metres);
 * - TEST: pipe of the component's network tested by that day against its length, else the progress of its activities.
 * The service and the demo seed both read it, so a bill prepared today and the seeded history agree.
 */
export async function loadStageEvidence(db: Db, projectId: string, upTo: string, stages?: EvidenceStage[]): Promise<Map<string, StageEvidence>> {
  const rows = stages ?? (await db.billingStage.findMany({ where: { projectId }, select: EVIDENCE_STAGE_SELECT }));
  const day = parseDate(upTo);
  const out = new Map<string, StageEvidence>();
  const needsProgress = rows.some((s) => s.trigger === 'PROGRESS' || s.trigger === 'TEST');
  const testElements = [...new Set(rows.filter((s) => s.trigger === 'TEST' && s.component.workElementId).map((s) => s.component.workElementId!))];

  const [activities, elements, done, segments] = await Promise.all([
    needsProgress
      ? db.activity.findMany({ where: { projectId }, select: { id: true, name: true, workElementId: true, parentActivityId: true, weightPct: true, plannedQty: true, boqItem: { select: { rate: true } } } })
      : [],
    needsProgress ? db.workElement.findMany({ where: { projectId }, select: { id: true, parentId: true, weightPct: true, name: true } }) : [],
    needsProgress ? db.progressEntry.groupBy({ by: ['activityId'], where: { projectId, status: 'APPROVED', date: { lte: day } }, _sum: { quantity: true } }) : [],
    testElements.length ? db.pipeSegment.findMany({ where: { zoneId: { in: testElements }, scope: 'PROPOSED' }, select: { id: true, zoneId: true, lengthM: true } }) : [],
  ]);
  const executed = new Map(done.map((d) => [d.activityId, d._sum.quantity ?? new Prisma.Decimal(0)]));
  const rollup = needsProgress
    ? progressRollup(
        activities.map((a) => ({ id: a.id, plannedQty: a.plannedQty, rate: a.boqItem?.rate ?? null, executed: executed.get(a.id) ?? new Prisma.Decimal(0), workElementId: a.workElementId, parentActivityId: a.parentActivityId, weightPct: a.weightPct })),
        elements,
      )
    : null;
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const progressOf = (s: EvidenceStage): { pct: number; reads: string } => {
    const mine = s.activityIds.map((id) => activityById.get(id)).filter((a): a is (typeof activities)[number] => !!a);
    if (mine.length) {
      const pct = progressOfActivities(mine.map((a) => ({ pct: rollup!.pct.get(a.id) ?? 0, weightPct: a.weightPct ? a.weightPct.toNumber() : null, value: rollup!.value.get(a.id) ?? 0 })));
      return { pct, reads: listNames(mine.map((a) => a.name)) };
    }
    const el = s.component.workElementId;
    return { pct: el ? (rollup!.pct.get(el) ?? 0) : 0, reads: el ? 'The component' : 'No component or activity linked' };
  };

  // Testing on the pipe network: a segment counts its tested metres, or all of it once a passed test covers it.
  const tested = new Map<string, { tested: number; scope: number }>();
  if (segments.length) {
    const { stageOf } = await stageActivities(db, { projectId });
    const testActivities = [...stageOf.entries()].filter(([, v]) => v.stage === 'TEST').map(([k]) => k);
    const [metres, passed] = await Promise.all([
      testActivities.length
        ? db.progressEntry.groupBy({ by: ['pipeSegmentId'], where: { activityId: { in: testActivities }, status: 'APPROVED', date: { lte: day }, pipeSegmentId: { in: segments.map((s) => s.id) } }, _sum: { quantity: true } })
        : [],
      db.pipeTestSegment.findMany({ where: { segmentId: { in: segments.map((s) => s.id) }, qualityTest: { result: 'PASS', sampledOn: { lte: day } } }, select: { segmentId: true } }),
    ]);
    const metresOf = new Map(metres.map((m) => [m.pipeSegmentId, Number(m._sum.quantity ?? 0)]));
    const passedIds = new Set(passed.map((p) => p.segmentId));
    for (const s of segments) {
      const length = Number(s.lengthM);
      const t = tested.get(s.zoneId) ?? { tested: 0, scope: 0 };
      t.scope += length;
      t.tested += passedIds.has(s.id) ? length : Math.min(length, metresOf.get(s.id) ?? 0);
      tested.set(s.zoneId, t);
    }
  }

  // Supply: received at the project by the day, in metres for pipe.
  const supplyStages = rows.filter((s) => s.trigger === 'SUPPLY');
  const supplyItems = [...new Set(supplyStages.flatMap((s) => s.itemIds))];
  const [items, receipts] = supplyItems.length
    ? await Promise.all([
        db.item.findMany({ where: { id: { in: supplyItems } }, select: { id: true, name: true, unit: true, pipeDiameterMm: true, pipeMaterial: true, kgPerMetre: true } }),
        db.stockTxn.groupBy({ by: ['itemId'], where: { projectId, itemId: { in: supplyItems }, type: { in: ['RECEIPT', 'TRANSFER_IN', 'RETURN_TO_VENDOR'] }, date: { lte: day } }, _sum: { quantity: true } }),
      ])
    : [[], []];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const received = new Map<string, number | null>();
  for (const id of supplyItems) {
    const item = itemById.get(id);
    const q = Number(receipts.find((r) => r.itemId === id)?._sum.quantity ?? 0);
    if (!item) received.set(id, null);
    else received.set(id, pipeSizeOf(item) ? pipeMetres(q, item.unit, item.kgPerMetre ? Number(item.kgPerMetre) : null) : q);
  }
  const supplied = shareSupply(
    supplyStages.map((s) => ({ id: s.id, itemIds: s.itemIds, scope: s.scopeQty ? Number(s.scopeQty) : null })),
    received,
  );
  const unitOf = (s: EvidenceStage) => {
    const first = s.itemIds.map((id) => itemById.get(id)).find(Boolean);
    return !first ? '' : pipeSizeOf(first) ? 'm' : first.unit;
  };

  for (const s of rows) {
    switch (s.trigger) {
      case 'EVENT':
        out.set(s.id, stageEvidence({ trigger: 'EVENT', achievedOn: dateOnly(s.achievedOn), evidence: s.evidence, upTo }, formatDay));
        break;
      case 'PROGRESS':
        out.set(s.id, stageEvidence({ trigger: 'PROGRESS', ...progressOf(s) }));
        break;
      case 'SUPPLY':
        out.set(s.id, stageEvidence({ trigger: 'SUPPLY', received: supplied.get(s.id) ?? null, scope: s.scopeQty ? Number(s.scopeQty) : null, unit: unitOf(s) }));
        break;
      case 'TEST': {
        const t = s.component.workElementId ? tested.get(s.component.workElementId) : undefined;
        if (t) out.set(s.id, stageEvidence({ trigger: 'TEST', tested: t.tested, scope: t.scope, unit: 'm', reads: 'Pipe network' }));
        else out.set(s.id, stageEvidence({ trigger: 'PROGRESS', ...progressOf(s) }));
        break;
      }
    }
  }
  return out;
}

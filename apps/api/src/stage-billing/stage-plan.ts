import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_SLIPPAGE_TIERS, STAGE_TEMPLATES, billsByStages, UNIT_RATE_ELEMENT_TYPES, pipeSizeOf, type SlippageLineDto } from '@erp/shared';
import { dateOnly, money } from '../common/serialize';
import { progressRollup } from '../common/progress';
import { EVIDENCE_STAGE_SELECT, loadStageEvidence } from './stage-evidence';
import {
  certifiedAmount,
  componentShares,
  matchStageActivities,
  monthEnd,
  monthsBetween,
  plannedFraction,
  round2,
  round3,
  sharesFromWeights,
  slippage,
  stageLine,
  stageValue,
  targetAt,
  type Tier,
} from './stage-billing-rules';

/*
 * The parts of stage billing (item 129) that the demo seed runs too, so they take a database client and no user: the
 * standard break-up, the grid proposed from the schedule, and what a bill takes from the break-up. `StageBillingService`
 * checks the caller's rights and calls them.
 */

type Db = Prisma.TransactionClient;
type D = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const ZERO = D(0);
export const num = (d: D | null | undefined) => (d ? d.toNumber() : 0);
export const compareCodes = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en', { numeric: true });

export const PROJECT_SELECT = {
  id: true,
  contractModel: true,
  currency: true,
  exchangeRate: true,
  contractValue: true,
  lumpSumValue: true,
  tenderFactor: true,
  advanceRecoveryFromPct: true,
  advanceRecoveryToPct: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.ProjectSelect;

/** What a bill takes from the break-up (item 129): its stage lines, the slippage withheld, and how its measured items are priced. */
export interface BillStagePlan {
  lines: {
    stageId: string;
    stageValue: D;
    prevPct: D;
    suggestedPct: D;
    thisPct: D;
    claimedByHand: boolean;
    note: string | null;
    certifiedPct: D | null;
    amount: D;
    evidenceText: string;
    sortOrder: number;
  }[];
  stageAmount: D;
  stagePrevious: D;
  slippageLines: SlippageLineDto[];
  /** This bill's withholding less what earlier bills withheld (negative releases) */
  slippageWithheld: D;
  /** BOQ items paid by the stages: their measurements are not billed */
  lumpSumBoqItemIds: string[];
  /** BOQ items of unit-rate components: billed at rate × the factor */
  unitRateBoqItemIds: Set<string>;
  tenderFactor: D;
}

/**
 * The standard break-up from the work breakdown, replacing any there is: a component for each component of it (parts
 * for its sub-components), shares from their weights (on a lump-sum project the weights are the billing shares),
 * unit-rate for house connections, road restoration and the HT feeder, and each part's stages from its kind
 * (`STAGE_TEMPLATES`), with the activities each reads and, for pipe, the pipe items and length it is supplied against.
 */
export async function createStandardBreakup(db: Db, organizationId: string, projectId: string) {
  const [elements, activities, segments, stockItems] = await Promise.all([
    db.workElement.findMany({ where: { projectId }, select: { id: true, parentId: true, code: true, name: true, elementType: true, weightPct: true, specs: true, sortOrder: true } }),
    db.activity.findMany({ where: { projectId }, select: { id: true, name: true, workElementId: true, parentActivityId: true } }),
    db.pipeSegment.findMany({ where: { projectId, scope: 'PROPOSED' }, select: { zoneId: true, lengthM: true, diameterMm: true, material: true } }),
    db.item.findMany({ where: { organizationId, txns: { some: { projectId } } }, select: { id: true, name: true, pipeDiameterMm: true, pipeMaterial: true } }),
  ]);
  if (!elements.length) throw new BadRequestException('Lay out the project\'s structure first (Plan › Structure): the break-up is made from its components');
  const pipeItems = stockItems.flatMap((i) => {
    const size = pipeSizeOf(i);
    return size ? [{ id: i.id, ...size }] : [];
  });
  const sorted = [...elements].sort(compareCodes);
  const top = sorted.filter((e) => !e.parentId);
  const isUnitRate = (e: (typeof elements)[number]) => UNIT_RATE_ELEMENT_TYPES.includes(e.elementType);
  const topShares = sharesFromWeights(top.filter((e) => !isUnitRate(e)).map((e) => (e.weightPct ? e.weightPct.toNumber() : null)));

  await db.billingComponent.deleteMany({ where: { projectId } });
  let sort = 0;
  const make = async (e: (typeof elements)[number], parentId: string | null, sharePct: number | null) => {
    const unit = sharePct === null;
    const comp = await db.billingComponent.create({
      data: { organizationId, projectId, parentId, code: e.code, name: e.name, sharePct: unit ? null : D(sharePct), basis: unit ? 'UNIT_RATE' : 'STAGES', workElementId: e.id, sortOrder: sort++ },
    });
    const kids = sorted.filter((k) => k.parentId === e.id);
    if (kids.length) {
      const shares = unit ? kids.map(() => null) : sharesFromWeights(kids.map((k) => (k.weightPct ? k.weightPct.toNumber() : null)));
      for (const [i, k] of kids.entries()) await make(k, comp.id, shares[i]);
      return;
    }
    if (unit) return;
    const own = activities.filter((a) => a.workElementId === e.id);
    const mine = segments.filter((s) => s.zoneId === e.id);
    const specs = (e.specs ?? {}) as { lengthM?: number; diameterMm?: number };
    const sizes = mine.length ? new Set(mine.map((s) => `${s.material}|${s.diameterMm}`)) : null;
    const supplyItems = pipeItems.filter((p) => (sizes ? sizes.has(`${p.material}|${p.diameterMm}`) : specs.diameterMm === p.diameterMm)).map((p) => p.id);
    const scope = mine.length ? mine.reduce((s, x) => s + Number(x.lengthM), 0) : (specs.lengthM ?? null);
    await db.billingStage.createMany({
      data: STAGE_TEMPLATES[e.elementType].map((t, i) => ({
        organizationId,
        projectId,
        componentId: comp.id,
        name: t.name,
        pct: D(t.pct),
        trigger: t.trigger,
        activityIds: matchStageActivities(t, own),
        itemIds: t.trigger === 'SUPPLY' ? supplyItems : [],
        scopeQty: t.trigger === 'SUPPLY' && scope ? D(scope.toFixed(3)) : null,
        sortOrder: i,
      })),
    });
  };
  let i = 0;
  for (const e of top) await make(e, null, isUnitRate(e) ? null : topShares[i++]);
}

/**
 * A grid proposed from the schedule (not saved): each top-level component's planned physical % at each month's end,
 * from its activities' planned dates in a straight line, rounded to whole %.
 */
export async function proposedGrid(db: Db, projectId: string): Promise<{ months: string[]; rows: { componentId: string; targets: number[] }[] }> {
  const [project, components, activities, elements] = await Promise.all([
    db.project.findFirstOrThrow({ where: { id: projectId }, select: { startDate: true, endDate: true } }),
    db.billingComponent.findMany({ where: { projectId, parentId: null, basis: 'STAGES' }, select: { id: true, workElementId: true } }),
    db.activity.findMany({ where: { projectId }, select: { id: true, plannedQty: true, plannedStart: true, plannedEnd: true, workElementId: true, parentActivityId: true, weightPct: true, boqItem: { select: { rate: true } } } }),
    db.workElement.findMany({ where: { projectId }, select: { id: true, parentId: true, weightPct: true } }),
  ]);
  const start = dateOnly(project.startDate);
  const end = dateOnly(project.endDate);
  if (!start || !end) throw new BadRequestException('Set the contract\'s start and completion dates first');
  const months = monthsBetween(start, end);
  const planned = months.map((m) => {
    const day = monthEnd(m);
    return progressRollup(
      activities.map((a) => ({ id: a.id, plannedQty: a.plannedQty, rate: a.boqItem?.rate ?? null, executed: a.plannedQty.mul(plannedFraction(dateOnly(a.plannedStart), dateOnly(a.plannedEnd), day)), workElementId: a.workElementId, parentActivityId: a.parentActivityId, weightPct: a.weightPct })),
      elements,
    );
  });
  return {
    months,
    rows: components.map((c) => {
      let last = 0;
      return {
        componentId: c.id,
        targets: planned.map((r) => {
          last = Math.max(last, Math.round(c.workElementId ? (r.pct.get(c.workElementId) ?? 0) : r.projectPct));
          return last;
        }),
      };
    }),
  };
}

/**
 * What an RA bill takes from the break-up, or null when the project does not bill by stages. Each stage's % comes from
 * its evidence at the bill's measurements date, less what earlier bills took (certified, else claimed), unless the
 * preparer claimed it by hand; the slippage is the grid's withholding at that date less what earlier bills withheld.
 * `certified` re-reads this bill's certified %s (a certificate) instead of re-taking the evidence.
 */
export async function stagePlan(tx: Db, bill: { id: string; projectId: string; billNo: number; measuredUpTo: Date }, opts: { certified?: Map<string, D> } = {}): Promise<BillStagePlan | null> {
  const project = await tx.project.findUniqueOrThrow({ where: { id: bill.projectId }, select: PROJECT_SELECT });
  if (!billsByStages(project.contractModel)) return null;
  const components = await tx.billingComponent.findMany({ where: { projectId: bill.projectId }, include: { stages: { select: { ...EVIDENCE_STAGE_SELECT, pct: true, sortOrder: true, componentId: true }, orderBy: { sortOrder: 'asc' } } } });
  if (!components.length) return null;
  components.sort(compareCodes);
  const upTo = dateOnly(bill.measuredUpTo);
  const lumpSum = project.lumpSumValue ?? project.contractValue ?? ZERO;
  const shares = componentShares(lumpSum, components);
  const leaves = components.filter((c) => c.basis === 'STAGES' && !components.some((k) => k.parentId === c.id));
  const stages = leaves.flatMap((c) => c.stages);
  const [earlier, mine, evidence, tierRows, targets, withheldBefore] = await Promise.all([
    tx.raBillStageLine.findMany({ where: { bill: { projectId: bill.projectId, billNo: { lt: bill.billNo } } }, select: { stageId: true, thisPct: true, certifiedPct: true } }),
    tx.raBillStageLine.findMany({ where: { billId: bill.id } }),
    opts.certified ? Promise.resolve(new Map<string, { pct: number; text: string }>()) : loadStageEvidence(tx, bill.projectId, upTo, stages),
    tx.slippageTier.findMany({ where: { projectId: bill.projectId }, orderBy: { sortOrder: 'asc' } }),
    tx.milestoneTarget.findMany({ where: { projectId: bill.projectId } }),
    tx.raBill.aggregate({ where: { projectId: bill.projectId, billNo: { lt: bill.billNo } }, _sum: { slippageWithheld: true } }),
  ]);
  const prevOf = new Map<string, number>();
  for (const l of earlier) prevOf.set(l.stageId, (prevOf.get(l.stageId) ?? 0) + num(l.certifiedPct ?? l.thisPct));
  const mineOf = new Map(mine.map((l) => [l.stageId, l]));

  const lines: BillStagePlan['lines'] = [];
  let stageAmount = ZERO;
  let stagePrevious = ZERO;
  let sort = 0;
  const uptoOf = new Map<string, number>();
  for (const c of leaves) {
    const share = shares.get(c.id);
    for (const s of c.stages) {
      const value = share ? stageValue(share.value, s.pct) : ZERO;
      const prev = round3(prevOf.get(s.id) ?? 0);
      const old = mineOf.get(s.id);
      let line: { suggestedPct: number; thisPct: number; uptoPct: number; prevAmount: D; amount: D };
      let byHand = false;
      let evidenceText: string;
      let certifiedPct: D | null = null;
      if (opts.certified && old) {
        certifiedPct = opts.certified.get(s.id) ?? old.thisPct;
        const pct = num(certifiedPct);
        line = { suggestedPct: num(old.suggestedPct), thisPct: num(old.thisPct), uptoPct: round3(prev + num(old.thisPct)), prevAmount: round2(value.mul(prev).div(100)), amount: certifiedAmount(value, prev, pct) };
        byHand = old.claimedByHand;
        evidenceText = old.evidenceText;
      } else {
        const ev = evidence.get(s.id) ?? { pct: 0, text: '' };
        evidenceText = ev.text;
        const claimed = old?.claimedByHand ? stageLine(value, prev, ev.pct, { pct: num(old.thisPct), note: old.note }) : null;
        const auto = stageLine(value, prev, ev.pct) as Exclude<ReturnType<typeof stageLine>, { problem: string }>;
        if (claimed && !('problem' in claimed)) {
          line = claimed;
          byHand = true;
        } else line = auto;
      }
      lines.push({
        stageId: s.id,
        stageValue: value,
        prevPct: D(prev),
        suggestedPct: D(line.suggestedPct),
        thisPct: D(line.thisPct),
        claimedByHand: byHand,
        note: byHand ? (old?.note ?? null) : null,
        certifiedPct,
        amount: line.amount,
        evidenceText,
        sortOrder: sort++,
      });
      stageAmount = stageAmount.add(line.amount);
      stagePrevious = stagePrevious.add(line.prevAmount);
      uptoOf.set(s.id, prev + num(certifiedPct ?? D(line.thisPct)));
    }
  }

  // Slippage on the top-level components: billed up to and including this bill against the grid's target.
  const tiers: Tier[] = tierRows.length ? tierRows.map((t) => ({ fromPct: num(t.fromPct), toPct: t.toPct ? num(t.toPct) : null, withheldPct: num(t.withheldPct) })) : DEFAULT_SLIPPAGE_TIERS;
  const leavesUnder = (id: string): typeof leaves => {
    const kids = components.filter((k) => k.parentId === id);
    return kids.length ? kids.flatMap((k) => leavesUnder(k.id)) : leaves.filter((l) => l.id === id);
  };
  const slip = slippage(
    components
      .filter((c) => !c.parentId && c.basis === 'STAGES' && shares.get(c.id))
      .map((c) => {
        const value = shares.get(c.id)!.value;
        let billed = ZERO;
        for (const leaf of leavesUnder(c.id)) {
          const leafValue = shares.get(leaf.id)?.value ?? ZERO;
          for (const s of leaf.stages) billed = billed.add(stageValue(leafValue, s.pct).mul(uptoOf.get(s.id) ?? 0).div(100));
        }
        return {
          componentId: c.id,
          code: c.code,
          name: c.name,
          value,
          targetPct: targetAt(targets.filter((t) => t.componentId === c.id).map((t) => ({ month: dateOnly(t.month), pct: num(t.cumulativePct) })), upTo),
          actualPct: value.gt(0) ? billed.mul(100).div(value).toNumber() : 0,
        };
      }),
    tiers,
  );

  const { unitRateBoqItemIds, lumpSumBoqItemIds } = await boqBasis(tx, bill.projectId, components);

  return {
    lines,
    stageAmount,
    stagePrevious,
    slippageLines: slip.lines.map((l) => ({ ...l, withheld: money(l.withheld) })),
    slippageWithheld: slip.total.sub(withheldBefore._sum.slippageWithheld ?? ZERO),
    lumpSumBoqItemIds,
    unitRateBoqItemIds,
    tenderFactor: project.tenderFactor ?? D(1),
  };
}

/**
 * Which BOQ items a break-up pays by unit rates (those under a unit-rate component, measured and paid at rate × the
 * tender factor) and which by its stages (under a stages component: in the lump sum, their measurements not billed).
 */
export async function boqBasis(db: Db, projectId: string, components?: { basis: 'STAGES' | 'UNIT_RATE'; workElementId: string | null }[]) {
  const [comps, boqItems, elementTree] = await Promise.all([
    components ?? db.billingComponent.findMany({ where: { projectId }, select: { basis: true, workElementId: true } }),
    db.boqItem.findMany({ where: { projectId, workElementId: { not: null } }, select: { id: true, workElementId: true } }),
    db.workElement.findMany({ where: { projectId }, select: { id: true, parentId: true } }),
  ]);
  const under = (rootId: string) => {
    const out = new Set([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of elementTree) if (e.parentId && out.has(e.parentId) && !out.has(e.id)) (out.add(e.id), (grew = true));
    }
    return out;
  };
  const unitEls = new Set(comps.filter((c) => c.basis === 'UNIT_RATE' && c.workElementId).flatMap((c) => [...under(c.workElementId!)]));
  const stageEls = new Set(comps.filter((c) => c.basis === 'STAGES' && c.workElementId).flatMap((c) => [...under(c.workElementId!)]));
  const unitRateBoqItemIds = new Set(boqItems.filter((b) => unitEls.has(b.workElementId!)).map((b) => b.id));
  const lumpSumBoqItemIds = boqItems.filter((b) => !unitRateBoqItemIds.has(b.id) && stageEls.has(b.workElementId!)).map((b) => b.id);
  return { unitRateBoqItemIds, lumpSumBoqItemIds };
}

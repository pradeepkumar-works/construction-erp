import { Prisma } from '@prisma/client';
import { rollUp, type RollupActivity, type RollupElement, type RollupResult } from '@erp/shared';

export interface ProgressActivity {
  id: string;
  plannedQty: Prisma.Decimal;
  rate: Prisma.Decimal | null;
  executed: Prisma.Decimal;
  workElementId?: string | null;
  parentActivityId?: string | null;
  weightPct?: Prisma.Decimal | null;
}

export interface ProgressElement {
  id: string;
  parentId: string | null;
  weightPct: Prisma.Decimal | null;
}

/** The work breakdown roll-up (`rollUp` in @erp/shared) over Prisma rows: values are BOQ amount, else planned quantity. */
export function progressRollup(activities: ProgressActivity[], elements: ProgressElement[] = []): RollupResult {
  const acts: RollupActivity[] = activities.map((a) => ({
    id: a.id,
    workElementId: a.workElementId ?? null,
    parentActivityId: a.parentActivityId ?? null,
    weightPct: a.weightPct ? a.weightPct.toNumber() : null,
    plannedQty: a.plannedQty.toNumber(),
    executedQty: a.executed.toNumber(),
    value: (a.rate ? a.rate.mul(a.plannedQty) : a.plannedQty).toNumber(),
  }));
  const els: RollupElement[] = elements.map((e) => ({ id: e.id, parentId: e.parentId, weightPct: e.weightPct ? e.weightPct.toNumber() : null }));
  return rollUp(els, acts);
}

/**
 * Physical progress of a project: its components by weight, each the weighted progress of what is under it,
 * down to approved quantity ÷ planned on each activity. A project with no breakdown is its activities weighted by BOQ
 * amount (rate × planned quantity) where they are linked to a BOQ item, else by planned quantity; each counts up to 100%.
 */
export function physicalProgress(activities: ProgressActivity[], elements: ProgressElement[] = []): number {
  return progressRollup(activities, elements).projectPct;
}

/**
 * Share of the work planned to be done by `today`, each activity weighted as physical progress weighs it
 * (planned quantity × BOQ rate, or the quantity without a rate) and spread evenly over its planned dates, inclusive.
 * Only activities with both dates count; null when none has them.
 */
export function plannedProgress(
  activities: { plannedQty: string; boqItemId: string | null; plannedStart: string | null; plannedEnd: string | null }[],
  rates: Map<string, Prisma.Decimal>,
  today: string,
): number | null {
  const at = Date.parse(`${today}T00:00:00Z`) + 86_400_000;
  let planned = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  for (const a of activities) {
    if (!a.plannedStart || !a.plannedEnd) continue;
    const qty = new Prisma.Decimal(a.plannedQty);
    const rate = a.boqItemId ? rates.get(a.boqItemId) : undefined;
    const weight = rate ? rate.mul(qty) : qty;
    const start = Date.parse(`${a.plannedStart}T00:00:00Z`);
    const end = Date.parse(`${a.plannedEnd}T00:00:00Z`) + 86_400_000;
    const share = end > start ? Math.min(1, Math.max(0, (at - start) / (end - start))) : at >= end ? 1 : 0;
    planned = planned.add(weight.mul(share));
    total = total.add(weight);
  }
  if (total.lte(0)) return null;
  return Math.round(planned.div(total).mul(1000).toNumber()) / 10;
}

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
 * Physical progress of a project (item 125): its components by weight, each the weighted progress of what is under it,
 * down to approved quantity ÷ planned on each activity. A project with no breakdown is its activities weighted by BOQ
 * amount (rate × planned quantity) where they are linked to a BOQ item, else by planned quantity; each counts up to 100%.
 */
export function physicalProgress(activities: ProgressActivity[], elements: ProgressElement[] = []): number {
  return progressRollup(activities, elements).projectPct;
}

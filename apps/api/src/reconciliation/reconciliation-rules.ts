/**
 * Material reconciliation's arithmetic, with no database (tested in src/scripts/reconciliation-test.ts).
 * See packages/shared/src/reconciliation.ts for the terms.
 */
import { Prisma } from '@prisma/client';
import type { ReconciliationStatus } from '@erp/shared';
import { RECONCILIATION_UNDER_PCT } from '@erp/shared';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);
const HUNDRED = new Dec(100);

export interface NormInput {
  id: string;
  boqItemId: string;
  itemId: string;
  qtyPerUnit: D;
  wastagePct: D;
}

/** Issued to site (a positive quantity) and returned from site (positive) for one item. */
export interface ItemMovement {
  issued: D;
  returned: D;
}

export interface ReconciledLine {
  normId: string;
  boqItemId: string;
  executed: D;
  qtyPerUnit: D;
  wastagePct: D;
  theoretical: D;
  allowance: D;
}

export interface ReconciledItem {
  itemId: string;
  theoretical: D;
  allowed: D;
  issued: D;
  returned: D;
  consumed: D;
  variance: D;
  variancePct: number | null;
  status: ReconciliationStatus;
  excess: D;
  lines: ReconciledLine[];
}

/** The status of one item from its theoretical, allowed and consumed quantities. */
export function reconciliationStatus(theoretical: D, allowed: D, consumed: D): ReconciliationStatus {
  if (theoretical.lte(0)) return consumed.gt(0) ? 'OVER' : 'NO_WORK';
  if (consumed.gt(allowed)) return 'OVER';
  const floor = theoretical.mul(HUNDRED.minus(RECONCILIATION_UNDER_PCT)).div(HUNDRED);
  if (consumed.lt(floor)) return 'UNDER';
  return 'WITHIN';
}

/**
 * Reconcile every item a norm covers. `executed` is approved progress per BOQ item in the period, `movements` the
 * item's issues and returns in the same period. Items come back in the order their first norm was given.
 */
export function reconcile(norms: NormInput[], executed: Map<string, D>, movements: Map<string, ItemMovement>): ReconciledItem[] {
  const byItem = new Map<string, ReconciledLine[]>();
  for (const n of norms) {
    const done = executed.get(n.boqItemId) ?? ZERO;
    const theoretical = done.mul(n.qtyPerUnit).toDecimalPlaces(3);
    const line: ReconciledLine = {
      normId: n.id,
      boqItemId: n.boqItemId,
      executed: done,
      qtyPerUnit: n.qtyPerUnit,
      wastagePct: n.wastagePct,
      theoretical,
      allowance: theoretical.mul(n.wastagePct).div(HUNDRED),
    };
    const lines = byItem.get(n.itemId);
    if (lines) lines.push(line);
    else byItem.set(n.itemId, [line]);
  }
  const out: ReconciledItem[] = [];
  for (const [itemId, lines] of byItem) {
    const theoretical = lines.reduce((s, l) => s.plus(l.theoretical), ZERO);
    const allowed = theoretical.plus(lines.reduce((s, l) => s.plus(l.allowance), ZERO)).toDecimalPlaces(3);
    const m = movements.get(itemId) ?? { issued: ZERO, returned: ZERO };
    const consumed = m.issued.minus(m.returned);
    const variance = consumed.minus(theoretical);
    const status = reconciliationStatus(theoretical, allowed, consumed);
    out.push({
      itemId,
      theoretical,
      allowed,
      issued: m.issued,
      returned: m.returned,
      consumed,
      variance,
      variancePct: theoretical.gt(0) ? Math.round(variance.div(theoretical).mul(1000).toNumber()) / 10 : null,
      status,
      excess: status === 'OVER' ? consumed.minus(allowed) : ZERO,
      lines,
    });
  }
  return out;
}

/** Issues and returns per item from signed stock rows (issues are negative, returns from site positive). */
export function movementsFrom(rows: { itemId: string; type: string; quantity: D }[]): Map<string, ItemMovement> {
  const out = new Map<string, ItemMovement>();
  for (const r of rows) {
    if (r.type !== 'ISSUE' && r.type !== 'RETURN_FROM_SITE') continue;
    const m = out.get(r.itemId) ?? { issued: ZERO, returned: ZERO };
    if (r.type === 'ISSUE') m.issued = m.issued.plus(r.quantity.neg());
    else m.returned = m.returned.plus(r.quantity);
    out.set(r.itemId, m);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Estimate (v5 item 92): a BOQ item's built-up rate from its rate analysis.

export interface EstimateLineInput {
  kind: 'MATERIAL' | 'LABOUR' | 'EQUIPMENT';
  qtyPerUnit: D;
  /** Materials only */
  wastagePct: D | null;
  /** null when no rate is set */
  rate: D | null;
}

export interface PricedLine {
  /** Per unit of the BOQ item, wastage included */
  quantity: D;
  amount: D | null;
}

export interface BuiltUpRate {
  lines: PricedLine[];
  material: D;
  labour: D;
  equipment: D;
  cost: D;
  overheads: D;
  profit: D;
  builtUpRate: D;
  /** BOQ rate − built-up rate */
  margin: D;
  marginPct: number | null;
  unpriced: number;
}

const r2 = (v: D) => v.toDecimalPlaces(2, Dec.ROUND_HALF_UP);

/**
 * Price one BOQ item's lines: each line's quantity (with a material's wastage) × its rate, summed by kind; overheads and
 * profit are both % of that cost. A line without a rate counts as nothing and is reported as unpriced.
 */
export function builtUpRate(lines: EstimateLineInput[], overheadPct: D, profitPct: D, boqRate: D): BuiltUpRate {
  const sums = { MATERIAL: ZERO, LABOUR: ZERO, EQUIPMENT: ZERO };
  let unpriced = 0;
  const priced = lines.map((l) => {
    const quantity = l.wastagePct ? l.qtyPerUnit.mul(HUNDRED.plus(l.wastagePct)).div(HUNDRED) : l.qtyPerUnit;
    if (!l.rate) {
      unpriced++;
      return { quantity: quantity.toDecimalPlaces(6), amount: null };
    }
    const amount = r2(quantity.mul(l.rate));
    sums[l.kind] = sums[l.kind].plus(amount);
    return { quantity: quantity.toDecimalPlaces(6), amount };
  });
  const cost = sums.MATERIAL.plus(sums.LABOUR).plus(sums.EQUIPMENT);
  const overheads = r2(cost.mul(overheadPct).div(HUNDRED));
  const profit = r2(cost.mul(profitPct).div(HUNDRED));
  const rate = cost.plus(overheads).plus(profit);
  const margin = boqRate.minus(rate);
  return {
    lines: priced,
    material: sums.MATERIAL,
    labour: sums.LABOUR,
    equipment: sums.EQUIPMENT,
    cost,
    overheads,
    profit,
    builtUpRate: rate,
    margin,
    marginPct: boqRate.gt(0) ? Math.round(margin.div(boqRate).mul(1000).toNumber()) / 10 : null,
    unpriced,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Wastage (v5 item 92): stock adjustments by reason and item.

export interface AdjustmentRow {
  reason: string | null;
  itemId: string;
  entryId: string;
  quantity: D;
}

export interface WastageGroup {
  reason: string | null;
  itemId: string;
  lost: D;
  gained: D;
  entries: number;
}

/** Adjustment lines grouped by reason and item, opening stock left out; a negative line is lost, a positive one gained. */
export function wastageGroups(rows: AdjustmentRow[]): WastageGroup[] {
  const out = new Map<string, WastageGroup & { ids: Set<string> }>();
  for (const r of rows) {
    if (r.reason === 'OPENING') continue;
    const k = `${r.reason ?? ''}:${r.itemId}`;
    const g = out.get(k) ?? { reason: r.reason, itemId: r.itemId, lost: ZERO, gained: ZERO, entries: 0, ids: new Set<string>() };
    if (r.quantity.isNegative()) g.lost = g.lost.plus(r.quantity.neg());
    else g.gained = g.gained.plus(r.quantity);
    g.ids.add(r.entryId);
    g.entries = g.ids.size;
    out.set(k, g);
  }
  return [...out.values()].map(({ ids: _ids, ...g }) => g);
}

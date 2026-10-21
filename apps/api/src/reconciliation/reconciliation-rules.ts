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

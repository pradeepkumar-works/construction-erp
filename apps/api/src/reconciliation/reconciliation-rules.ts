/**
 * Material reconciliation's arithmetic, with no database (tested in src/scripts/reconciliation-test.ts).
 * See packages/shared/src/reconciliation.ts for the terms.
 */
import { Prisma } from '@prisma/client';
import type { FrontFlag, KitStatus, PipeFlag, PipeMaterial, ReconciliationStatus } from '@erp/shared';
import { ISSUE_WORK_DAYS, RECONCILIATION_UNDER_PCT, USE_ISSUE_DAYS } from '@erp/shared';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);
const HUNDRED = new Dec(100);

export interface NormInput {
  id: string;
  /** A BOQ item's norm; null on an activity's own norm */
  boqItemId: string | null;
  activityId?: string | null;
  itemId: string;
  qtyPerUnit: D;
  wastagePct: D;
}

/** The key a norm's work is counted under: its activity for an activity's own norm, else its BOQ item. */
export const normSource = (n: { boqItemId: string | null; activityId?: string | null }) => (n.activityId ? `a:${n.activityId}` : n.boqItemId!);

/**
 * Approved work per norm source: an activity with norms of its own counts under itself, any other under its
 * BOQ item; work on an activity with neither is left out.
 */
export function executedBySource(rows: { activityId: string; quantity: D }[], boqOf: Map<string, string | null>, ownNorms: Set<string>): Map<string, D> {
  const out = new Map<string, D>();
  for (const r of rows) {
    const key = ownNorms.has(r.activityId) ? `a:${r.activityId}` : boqOf.get(r.activityId);
    if (!key) continue;
    out.set(key, (out.get(key) ?? ZERO).plus(r.quantity));
  }
  return out;
}

/** Issued to site (a positive quantity) and returned from site (positive) for one item. */
export interface ItemMovement {
  issued: D;
  returned: D;
}

export interface ReconciledLine {
  normId: string;
  boqItemId: string | null;
  activityId: string | null;
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
 * Reconcile every item a norm covers. `executed` is approved progress per norm source (`normSource`) in the period, `movements` the
 * item's issues and returns in the same period. Items come back in the order their first norm was given.
 */
export function reconcile(norms: NormInput[], executed: Map<string, D>, movements: Map<string, ItemMovement>): ReconciledItem[] {
  const byItem = new Map<string, ReconciledLine[]>();
  for (const n of norms) {
    const done = executed.get(normSource(n)) ?? ZERO;
    const theoretical = done.mul(n.qtyPerUnit).toDecimalPlaces(3);
    const line: ReconciledLine = {
      normId: n.id,
      boqItemId: n.boqItemId,
      activityId: n.activityId ?? null,
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

// Estimate: a BOQ item's built-up rate from its rate analysis.

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

// Wastage: stock adjustments by reason and item.

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

// Stock against the DPR

const EPS = new Dec('0.001');
const pct1 = (num: D, den: D) => (den.gt(0) ? Math.round(num.div(den).mul(1000).toNumber()) / 10 : null);

/**
 * The work front's word on an item: used on DPR lines beyond what was issued net of returns, or issued and never
 * reported used. Nothing to say until the project reports material on its DPRs.
 */
export function frontFlag(net: D, used: D, reportsUse: boolean): FrontFlag | null {
  if (!reportsUse) return null;
  if (used.gt(net.plus(EPS))) return 'USED_NOT_ISSUED';
  if (net.gt(EPS) && used.lte(0)) return 'NOT_REPORTED';
  return null;
}

export interface BookFigures {
  opening: D;
  received: D;
  closing: D;
}

/**
 * The store's book per item from signed stock rows summed by type: before the period (opening), received in it (receipts
 * and transfers in) and the balance at its end (closing).
 */
export function bookOf(before: { itemId: string; quantity: D }[], during: { itemId: string; type: string; quantity: D }[]): Map<string, BookFigures> {
  const out = new Map<string, BookFigures>();
  const get = (id: string) => {
    const b = out.get(id) ?? { opening: ZERO, received: ZERO, closing: ZERO };
    out.set(id, b);
    return b;
  };
  for (const r of before) {
    const b = get(r.itemId);
    b.opening = b.opening.plus(r.quantity);
    b.closing = b.closing.plus(r.quantity);
  }
  for (const r of during) {
    const b = get(r.itemId);
    if (r.type === 'RECEIPT' || r.type === 'TRANSFER_IN') b.received = b.received.plus(r.quantity);
    b.closing = b.closing.plus(r.quantity);
  }
  return out;
}

/** A norm as it applies to one activity: the activity's own, else its BOQ item's. */
export interface ActivityNormInput {
  activityId: string;
  itemId: string;
  qtyPerUnit: D;
  wastagePct: D;
}

export interface StructureInput {
  norms: ActivityNormInput[];
  /** Each activity's element and planned quantity */
  activities: Map<string, { elementId: string | null; planned: D }>;
  /** Approved on DPR lines in the period, per activity */
  placed: Map<string, D>;
  /** Reported used on approved DPR lines in the period */
  used: { activityId: string; itemId: string; quantity: D }[];
  /** Issued to an element in the period, net of returns (issues positive) */
  issued: { elementId: string; itemId: string; quantity: D }[];
  /**
   * The work front as at the period's end, once DPRs report material: issued to the element from a week before the first
   * such DPR, and everything its lines say was used since. null before.
   */
  front: { issued: { elementId: string; itemId: string; quantity: D }[]; used: { activityId: string; itemId: string; quantity: D }[] } | null;
}

export interface StructureLine {
  activityId: string;
  planned: D;
  placed: D;
  qtyPerUnit: D;
  wastagePct: D;
  used: D;
  achievedPerUnit: D | null;
}

export interface StructureItem {
  itemId: string;
  design: D;
  needed: D;
  allowed: D;
  used: D;
  issued: D;
  atFront: D | null;
  variancePct: number | null;
  status: ReconciliationStatus;
  lines: StructureLine[];
}

/**
 * Per element and normed material: the design need (planned × norm), what the approved DPR lines needed and used, what
 * was issued to the element, and the use achieved per unit of each activity (bags of cement per m³, say). Materials
 * with no norm on the element's activities stay in the project's Materials view.
 */
export function structureRows(input: StructureInput): Map<string, StructureItem[]> {
  const usedOf = new Map<string, D>();
  for (const u of input.used) usedOf.set(`${u.activityId}|${u.itemId}`, (usedOf.get(`${u.activityId}|${u.itemId}`) ?? ZERO).plus(u.quantity));
  const issuedOf = new Map<string, D>();
  for (const i of input.issued) issuedOf.set(`${i.elementId}|${i.itemId}`, (issuedOf.get(`${i.elementId}|${i.itemId}`) ?? ZERO).plus(i.quantity));
  const elementOfActivity = (id: string) => input.activities.get(id)?.elementId ?? null;
  const frontOf = new Map<string, D>();
  for (const i of input.front?.issued ?? []) frontOf.set(`${i.elementId}|${i.itemId}`, (frontOf.get(`${i.elementId}|${i.itemId}`) ?? ZERO).plus(i.quantity));
  for (const u of input.front?.used ?? []) {
    const el = elementOfActivity(u.activityId);
    if (el) frontOf.set(`${el}|${u.itemId}`, (frontOf.get(`${el}|${u.itemId}`) ?? ZERO).minus(u.quantity));
  }

  const byElement = new Map<string, Map<string, StructureItem>>();
  for (const n of input.norms) {
    const a = input.activities.get(n.activityId);
    if (!a?.elementId) continue;
    const items = byElement.get(a.elementId) ?? new Map<string, StructureItem>();
    byElement.set(a.elementId, items);
    const row = items.get(n.itemId) ?? { itemId: n.itemId, design: ZERO, needed: ZERO, allowed: ZERO, used: ZERO, issued: issuedOf.get(`${a.elementId}|${n.itemId}`) ?? ZERO, atFront: ZERO, variancePct: null, status: 'NO_WORK', lines: [] };
    items.set(n.itemId, row);
    const placed = input.placed.get(n.activityId) ?? ZERO;
    const used = usedOf.get(`${n.activityId}|${n.itemId}`) ?? ZERO;
    const needed = placed.mul(n.qtyPerUnit).toDecimalPlaces(3);
    row.design = row.design.plus(a.planned.mul(n.qtyPerUnit).toDecimalPlaces(3));
    row.needed = row.needed.plus(needed);
    row.allowed = row.allowed.plus(needed.mul(HUNDRED.plus(n.wastagePct)).div(HUNDRED).toDecimalPlaces(3));
    row.used = row.used.plus(used);
    row.lines.push({ activityId: n.activityId, planned: a.planned, placed, qtyPerUnit: n.qtyPerUnit, wastagePct: n.wastagePct, used, achievedPerUnit: placed.gt(0) && used.gt(0) ? used.div(placed).toDecimalPlaces(6) : null });
  }
  const out = new Map<string, StructureItem[]>();
  for (const [elementId, items] of byElement) {
    out.set(
      elementId,
      [...items.values()].map((r) => ({
        ...r,
        atFront: input.front ? (frontOf.get(`${elementId}|${r.itemId}`) ?? ZERO) : null,
        variancePct: pct1(r.used.minus(r.needed), r.needed),
        status: reconciliationStatus(r.needed, r.allowed, r.used),
      })),
    );
  }
  return out;
}

/** One pipe size's figures in metres, over the project or one zone. */
export interface PipeFigures {
  scope: number;
  laid: number;
  tested: number;
  /** Reported used on lines laying this size, and what those lines laid */
  used: number;
  laidWithUse: number;
  /** Issued net of returns from site (to the zone, on a zone row) */
  issued: number;
  /** Project row only */
  ordered?: number;
  received?: number;
  inStore?: number;
}

export interface PipeRow {
  wastagePct: number | null;
  allowedWastagePct: number;
  atSite: number;
  balanceToLay: number;
  balanceToBuy: number | null;
  flags: PipeFlag[];
}

const m3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * A pipe size's checks. Cut wastage is what the lines reporting pipe used beyond what they laid; pipe at site
 * not laid is issued less laid less that wastage; to buy is the scope with the allowed wastage less what is already
 * ordered or received. A zone with no issue tied to it cannot be laid above issued.
 */
export function pipeRow(material: PipeMaterial, f: PipeFigures, allowedPct: number, project: boolean, hasIssues: boolean): PipeRow {
  const wastage = f.laidWithUse > 0 ? Math.max(0, f.used - f.laidWithUse) : 0;
  const wastagePct = f.laidWithUse > 0 ? Math.round(((f.used - f.laidWithUse) / f.laidWithUse) * 1000) / 10 : null;
  const flags: PipeFlag[] = [];
  if (hasIssues && f.laid > f.issued + 0.5) flags.push('LAID_ABOVE_ISSUED');
  if (wastagePct !== null && wastagePct > allowedPct) flags.push('WASTAGE_ABOVE');
  const bought = Math.max(f.ordered ?? 0, f.received ?? 0);
  return {
    wastagePct,
    allowedWastagePct: allowedPct,
    atSite: m3(f.issued - f.laid - wastage),
    balanceToLay: m3(Math.max(0, f.scope - f.laid)),
    balanceToBuy: project ? m3(Math.max(0, f.scope * (1 + allowedPct / 100) - bought)) : null,
    flags,
  };
}

export interface KitComponent {
  itemId: string;
  perKit: D;
  wastagePct: D;
  needed: D;
  issued: D;
  used: D;
  difference: D;
  kitsShort: number;
  status: KitStatus;
}

/**
 * A house-connection kit's components against the connections done: needed = done × per kit; short when less was issued
 * (in whole kits), over when more was issued than the need with its wastage.
 */
export function kitRows(done: D, components: { itemId: string; perKit: D; wastagePct: D; issued: D; used: D }[]): KitComponent[] {
  return components.map((c) => {
    const needed = done.mul(c.perKit).toDecimalPlaces(3);
    const allowed = needed.mul(HUNDRED.plus(c.wastagePct)).div(HUNDRED);
    const difference = c.issued.minus(needed);
    const short = difference.lt(EPS.neg());
    const kitsShort = short && c.perKit.gt(0) ? Math.ceil(difference.neg().div(c.perKit).toNumber() - 1e-9) : 0;
    return { ...c, needed, difference, kitsShort, status: short ? 'SHORT' : c.issued.gt(allowed.plus(EPS)) ? 'OVER' : 'OK' };
  });
}

export interface ExceptionUse {
  date: string;
  elementId: string;
  itemId: string;
  quantity: D;
  dprId: string;
}

export interface ExceptionIssue {
  date: string;
  elementId: string;
  itemId: string;
  quantity: D;
  entryId: string;
  entryNo: string;
}

export interface ExceptionEvent {
  kind: 'USE_WITHOUT_ISSUE' | 'ISSUE_WITHOUT_WORK';
  date: string;
  elementId: string;
  itemId: string;
  quantity: D;
  dprId: string | null;
  entryId: string | null;
  entryNo: string | null;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The day-to-day exceptions (R6): a DPR using a material at an element with nothing of it issued there in the
 * USE_ISSUE_DAYS before, and an issue to an element with no approved work there in the ISSUE_WORK_DAYS after (judged
 * only once those days are past `to`). Uses and issues come in the period; `issuesBefore` are the issues of the days
 * before it that may cover an early use; `work` is every day an element had approved work.
 */
export function exceptionEvents(uses: ExceptionUse[], issues: ExceptionIssue[], work: { date: string; elementId: string }[], to: string): ExceptionEvent[] {
  const out: ExceptionEvent[] = [];
  const merged = new Map<string, ExceptionUse>();
  for (const u of uses) {
    const k = `${u.dprId}|${u.elementId}|${u.itemId}`;
    const m = merged.get(k);
    merged.set(k, m ? { ...m, quantity: m.quantity.plus(u.quantity) } : u);
  }
  for (const u of merged.values()) {
    const from = addDays(u.date, -USE_ISSUE_DAYS);
    const covered = issues.some((i) => i.elementId === u.elementId && i.itemId === u.itemId && i.date >= from && i.date <= u.date && i.quantity.gt(0));
    if (!covered) out.push({ kind: 'USE_WITHOUT_ISSUE', date: u.date, elementId: u.elementId, itemId: u.itemId, quantity: u.quantity, dprId: u.dprId, entryId: null, entryNo: null });
  }
  const workDays = new Set(work.map((w) => `${w.elementId}|${w.date}`));
  for (const i of issues) {
    if (i.quantity.lte(0)) continue;
    const until = addDays(i.date, ISSUE_WORK_DAYS);
    if (until > to) continue;
    let worked = false;
    for (let d = i.date; d <= until && !worked; d = addDays(d, 1)) worked = workDays.has(`${i.elementId}|${d}`);
    if (!worked) out.push({ kind: 'ISSUE_WITHOUT_WORK', date: i.date, elementId: i.elementId, itemId: i.itemId, quantity: i.quantity, dprId: null, entryId: i.entryId, entryNo: i.entryNo });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
}

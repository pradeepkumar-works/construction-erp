/**
 * Amending an approved work order (ARCHITECTURE "Subcontracts", Amendments): what may be amended, what each line may
 * become, what the change adds up to, and the order as it stood at each amendment. Quantities have 3 decimals and
 * rupees 2, worked in whole thousandths and paise so no sum drifts.
 */

/** The order an amendment is raised on. */
export interface AmendableOrder {
  woNo: string;
  status: string;
  closedAt: string | null;
  /** A final bill on it is approved */
  finalBillApproved: boolean;
  /** Number of an amendment on it still in draft, waiting or sent back; null when there is none */
  openAmendmentNo: number | null;
}

/** A line of the order as it stands, with what its work already holds it to. */
export interface AmendLineNow {
  id: string;
  boqItemId: string | null;
  description: string;
  quantity: string;
  rate: string;
  /** Up to date on bills that are not rejected */
  billedQty: string;
  /** BOQ items: approved measurements of their work under the order */
  measuredQty: string;
}

/** A line as the amendment proposes it: an existing line by its id, or a new item (no id). */
export interface AmendLineProposed {
  workOrderLineId: string | null;
  boqItemId: string | null;
  description: string;
  quantity: string;
  rate: string;
}

/** An applied amendment's lines, for `workOrderAsOf`: the line it changed, and what the line was before (null for a new item). */
export interface AppliedAmendment {
  amendmentNo: number;
  lines: { workOrderLineId: string | null; qtyBefore: string | null; rateBefore: string | null }[];
}

export interface OrderLineVersion {
  id: string;
  quantity: string;
  rate: string;
  amount: string;
}

const QTY_DP = 3;
const MONEY_DP = 2;

/** A decimal string as a whole number of 10^-dp units (rounded half up past dp). */
function units(raw: string | number, dp: number): bigint {
  const s = String(raw).trim();
  const neg = s.startsWith('-');
  const [whole, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const kept = BigInt((whole || '0') + frac.slice(0, dp).padEnd(dp, '0'));
  const up = Number(frac.charAt(dp) || '0') >= 5 ? 1n : 0n;
  const v = kept + up;
  return neg ? -v : v;
}

function decimal(v: bigint, dp: number): string {
  const neg = v < 0n;
  const s = (neg ? -v : v).toString().padStart(dp + 1, '0');
  return `${neg ? '-' : ''}${s.slice(0, -dp)}.${s.slice(-dp)}`;
}

const qty = (v: string | number) => units(v, QTY_DP);
const paise = (v: string | number) => units(v, MONEY_DP);
const maxOf = (a: bigint, b: bigint) => (a > b ? a : b);

/** Quantity × rate to the paisa, half up, as the work order line's amount. */
export function amendLineAmount(quantity: string | number, rate: string | number): string {
  const p = qty(quantity) * paise(rate);
  const whole = p / 1000n;
  const rest = p % 1000n;
  return decimal(whole + (rest >= 500n ? 1n : rest <= -500n ? -1n : 0n), MONEY_DP);
}

/** The least a line may come down to: what is billed or measured against it already. */
export function amendFloorQty(line: Pick<AmendLineNow, 'billedQty' | 'measuredQty'>): string {
  return decimal(maxOf(qty(line.billedQty), qty(line.measuredQty)), QTY_DP);
}

/** Why an amendment cannot be raised on the order now, or null. */
export function amendmentOpenProblem(order: AmendableOrder): string | null {
  if (order.status !== 'APPROVED') return `${order.woNo} is not approved yet: change it and submit it again instead`;
  if (order.closedAt) return `${order.woNo} is closed`;
  if (order.finalBillApproved) return `The final bill on ${order.woNo} is approved, so the order can no longer change`;
  if (order.openAmendmentNo !== null) return `Amendment ${order.openAmendmentNo} on ${order.woNo} is still open: finish it or delete it first`;
  return null;
}

/**
 * Why a proposed line cannot stand, or null. An existing line keeps at least what is billed or measured against it; a
 * new BOQ line is not one the order (or another new line) already has; every line has a rate above zero, and a new one a
 * quantity above zero.
 */
export function amendmentLineProblem(line: AmendLineProposed, current: readonly AmendLineNow[], proposed: readonly AmendLineProposed[]): string | null {
  const what = line.description || 'A line';
  if (!(paise(line.rate) > 0n)) return `${what}: give a rate above zero`;
  if (qty(line.quantity) < 0n) return `${what}: the quantity cannot be negative`;
  if (line.workOrderLineId) {
    const now = current.find((c) => c.id === line.workOrderLineId);
    if (!now) return `${what} is not a line of this work order`;
    const floor = amendFloorQty(now);
    if (qty(line.quantity) < qty(floor)) return `${what}: ${Number(floor)} is already billed or measured, so the quantity cannot go below it`;
    return null;
  }
  if (!(qty(line.quantity) > 0n)) return `${what}: give the quantity of the new item`;
  if (line.boqItemId) {
    if (current.some((c) => c.boqItemId === line.boqItemId)) return `${what} is on the order already: change its line instead`;
    if (proposed.filter((p) => !p.workOrderLineId && p.boqItemId === line.boqItemId).length > 1) return `${what} is added twice`;
  }
  return null;
}

/** The first problem of a whole proposal, or null. */
export function amendmentLinesProblem(current: readonly AmendLineNow[], proposed: readonly AmendLineProposed[]): string | null {
  const ids = proposed.map((p) => p.workOrderLineId).filter((x): x is string => !!x);
  if (new Set(ids).size !== ids.length) return 'A line of the order is in the amendment twice';
  for (const p of proposed) {
    const problem = amendmentLineProblem(p, current, proposed);
    if (problem) return problem;
  }
  return null;
}

export interface AmendmentSummary {
  valueBefore: string;
  valueAfter: string;
  /** valueAfter less valueBefore */
  change: string;
  /** Existing lines whose quantity or rate changes */
  changed: number;
  added: number;
}

/** What the amendment does to the order: its value before and after, and how many lines change or are added. */
export function amendmentSummary(current: readonly Pick<AmendLineNow, 'id' | 'quantity' | 'rate'>[], proposed: readonly AmendLineProposed[]): AmendmentSummary {
  const before = current.reduce((t, c) => t + paise(amendLineAmount(c.quantity, c.rate)), 0n);
  const kept = new Map(proposed.filter((p) => p.workOrderLineId).map((p) => [p.workOrderLineId!, p]));
  let after = 0n;
  let changed = 0;
  for (const c of current) {
    const p = kept.get(c.id);
    const q = p ? p.quantity : c.quantity;
    const r = p ? p.rate : c.rate;
    if (p && (qty(q) !== qty(c.quantity) || paise(r) !== paise(c.rate))) changed++;
    after += paise(amendLineAmount(q, r));
  }
  const added = proposed.filter((p) => !p.workOrderLineId);
  for (const p of added) after += paise(amendLineAmount(p.quantity, p.rate));
  return { valueBefore: decimal(before, MONEY_DP), valueAfter: decimal(after, MONEY_DP), change: decimal(after - before, MONEY_DP), changed, added: added.length };
}

/**
 * The order's lines as they stood at version `n` (0 is the order as approved, n after amendment n), from its lines now
 * and its applied amendments: each later amendment is undone, newest first, putting back what a line was before it and
 * taking out the items it added.
 */
export function workOrderAsOf(lines: readonly Pick<OrderLineVersion, 'id' | 'quantity' | 'rate'>[], amendments: readonly AppliedAmendment[], n: number): { lines: OrderLineVersion[]; value: string } {
  const at = new Map(lines.map((l) => [l.id, { id: l.id, quantity: l.quantity, rate: l.rate }]));
  for (const a of [...amendments].filter((x) => x.amendmentNo > n).sort((x, y) => y.amendmentNo - x.amendmentNo)) {
    for (const l of a.lines) {
      if (!l.workOrderLineId) continue;
      if (l.qtyBefore === null || l.rateBefore === null) at.delete(l.workOrderLineId);
      else at.set(l.workOrderLineId, { id: l.workOrderLineId, quantity: l.qtyBefore, rate: l.rateBefore });
    }
  }
  const out = lines.filter((l) => at.has(l.id)).map((l) => {
    const v = at.get(l.id)!;
    return { ...v, amount: amendLineAmount(v.quantity, v.rate) };
  });
  return { lines: out, value: decimal(out.reduce((t, l) => t + paise(l.amount), 0n), MONEY_DP) };
}

/** "WO-2026-0003 amendment 2". */
export const woAmendmentLabel = (woNo: string, amendmentNo: number): string => `${woNo} amendment ${amendmentNo}`;

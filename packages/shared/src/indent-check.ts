/**
 * Indent checks (item 170, ARCHITECTURE "Indent checks"): before a project manager approves a material request, each line
 * set against what the site's store holds and what the BOQ allows for the item. The allowance is the project's norms
 * (`MaterialNorm` per BOQ item, `ActivityMaterialNorm` per activity, an activity's own first as in `normSource`) over the
 * whole BOQ, with their wastage; what is left of it is the allowance less what was issued to the work, what the store
 * holds now and what other requests still waiting for approval ask for. Advice only: a request over it can be approved.
 */

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A BOQ item's norm for one material: units of the material per unit of the BOQ item. */
export interface BoqNormFact {
  boqItemId: string;
  boqQty: number;
  qtyPerUnit: number;
  wastagePct: number;
}

/** An activity's own norm for one material, and the activity's planned quantity. */
export interface ActivityNormFact {
  activityId: string;
  boqItemId: string | null;
  plannedQty: number;
  qtyPerUnit: number;
  wastagePct: number;
}

/**
 * What the whole BOQ allows of one material, wastage included, or null when no norm names it. An activity with its own
 * norm takes its planned quantity out of its BOQ item's, so the same work is never counted twice.
 */
export function boqAllowance(boqNorms: BoqNormFact[], activityNorms: ActivityNormFact[]): number | null {
  if (!boqNorms.length && !activityNorms.length) return null;
  const ownPlanned = new Map<string, number>();
  for (const a of activityNorms) if (a.boqItemId) ownPlanned.set(a.boqItemId, (ownPlanned.get(a.boqItemId) ?? 0) + a.plannedQty);
  let total = 0;
  for (const n of boqNorms) total += Math.max(0, n.boqQty - (ownPlanned.get(n.boqItemId) ?? 0)) * n.qtyPerUnit * (1 + n.wastagePct / 100);
  for (const a of activityNorms) total += a.plannedQty * a.qtyPerUnit * (1 + a.wastagePct / 100);
  return r3(total);
}

export interface IndentLineFacts {
  /** What this line asks for */
  requested: number;
  /** What the request's own site holds now */
  onHand: number;
  /** `boqAllowance` for the item; null when the project has no norm for it */
  allowance: number | null;
  /** Issued to the work so far, less what came back from site */
  issued: number;
  /** Other requests of the site for the item still waiting for approval */
  waiting: number;
}

export const INDENT_NOTES = ['STOCK_COVERS', 'STOCK_PART', 'OVER_BOQ', 'NO_NORM', 'WAITING'] as const;
export type IndentNote = (typeof INDENT_NOTES)[number];

export interface IndentLineVerdict {
  /** What the BOQ still allows after what was issued, what the store holds and what others ask for; null without a norm */
  left: number | null;
  /** How far the line goes past `left`; null when within it or without a norm */
  over: number | null;
  /** How much of the line the site's own store can give now */
  fromStock: number;
  notes: IndentNote[];
}

/** The checks on one line of a request: the store first, then the BOQ. */
export function indentLineCheck(f: IndentLineFacts): IndentLineVerdict {
  const stock = Math.max(0, f.onHand);
  const fromStock = r3(Math.min(f.requested, stock));
  const left = f.allowance === null ? null : r3(Math.max(0, f.allowance - f.issued - stock - f.waiting));
  const over = left !== null && f.requested > left ? r3(f.requested - left) : null;
  const notes: IndentNote[] = [];
  if (fromStock > 0) notes.push(fromStock >= f.requested ? 'STOCK_COVERS' : 'STOCK_PART');
  if (f.allowance === null) notes.push('NO_NORM');
  else if (over !== null) notes.push('OVER_BOQ');
  if (f.waiting > 0) notes.push('WAITING');
  return { left, over, fromStock, notes };
}

/** Whether a line needs the approver's eye: past the BOQ, or asked for while the store already holds all of it. */
export const indentLineFlagged = (v: IndentLineVerdict) => v.notes.includes('OVER_BOQ') || v.notes.includes('STOCK_COVERS');

export interface IndentCheckLineDto {
  materialRequestItemId: string;
  itemName: string;
  unit: string;
  /** The item master's own unit where the line names a known item; quantities below are in it */
  itemId: string | null;
  requested: string;
  onHand: string;
  allowance: string | null;
  issued: string;
  waiting: string;
  left: string | null;
  over: string | null;
  fromStock: string;
  notes: IndentNote[];
  flagged: boolean;
}

/** GET /material-requests/:id/check */
export interface IndentCheckDto {
  materialRequestId: string;
  projectId: string;
  lines: IndentCheckLineDto[];
  /** Lines that need the approver's eye */
  flagged: number;
}

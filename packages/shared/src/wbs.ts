/**
 * Work breakdown roll-up (item 125, ARCHITECTURE "Work breakdown"). Pure, so the API, the web and the phone agree:
 *
 * - a leaf activity is approved quantity ÷ planned quantity, 0 to 100;
 * - an activity with sub-activities has no progress of its own: it is the weighted progress of its sub-activities;
 * - a component or sub-component is the weighted progress of its sub-components and activities;
 * - the project is its components (and any activity outside the breakdown) by weight.
 *
 * Weights are shares, %. Among siblings, the ones without a weight share what the others leave of 100 in proportion
 * to their value (BOQ amount, else planned quantity); when none has a weight, all are weighed by value, which for a
 * project with no breakdown is the same as before item 125.
 */
import type { ContractModel, WorkElementLevel, WorkElementType } from './enums';

export interface RollupElement {
  id: string;
  parentId: string | null;
  weightPct: number | null;
}

export interface RollupActivity {
  id: string;
  workElementId: string | null;
  parentActivityId: string | null;
  weightPct: number | null;
  plannedQty: number;
  executedQty: number;
  /** BOQ amount (rate × planned quantity) when linked to a BOQ item, else the planned quantity */
  value: number;
}

export interface RollupResult {
  /** Project progress, %, to one decimal */
  projectPct: number;
  /** Progress of every element and activity by id, %, to one decimal */
  pct: Map<string, number>;
  /** Value under every element and summary activity (sum of its leaves' values) */
  value: Map<string, number>;
  /** Ids of activities that have sub-activities */
  summaries: Set<string>;
}

interface Node {
  id: string;
  weightPct: number | null;
  children: Node[];
  leaf?: RollupActivity;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Progress of one leaf: approved ÷ planned, 0 to 100 (0 with nothing planned). */
export const leafPct = (executed: number, planned: number) => (planned > 0 ? Math.min(100, Math.max(0, (executed / planned) * 100)) : 0);

/**
 * Effective weights of siblings: the given weights, and for the rest a share of what is left of 100 by value (equal
 * shares when their values are all 0). With no weight given at all, every sibling is weighed by value.
 */
export function siblingWeights(items: { weightPct: number | null; value: number }[]): number[] {
  const given = items.filter((i) => i.weightPct !== null && i.weightPct !== undefined);
  const rest = items.filter((i) => i.weightPct === null || i.weightPct === undefined);
  const restValue = rest.reduce((s, i) => s + Math.max(0, i.value), 0);
  if (!given.length) {
    return items.map((i) => (restValue > 0 ? Math.max(0, i.value) : 1));
  }
  const left = Math.max(0, 100 - given.reduce((s, i) => s + Math.max(0, i.weightPct!), 0));
  return items.map((i) => {
    if (i.weightPct !== null && i.weightPct !== undefined) return Math.max(0, i.weightPct);
    if (!left) return 0;
    return restValue > 0 ? (left * Math.max(0, i.value)) / restValue : left / rest.length;
  });
}

export function rollUp(elements: RollupElement[], activities: RollupActivity[]): RollupResult {
  const elementNodes = new Map<string, Node>(elements.map((e) => [e.id, { id: e.id, weightPct: e.weightPct, children: [] }]));
  const activityNodes = new Map<string, Node>(activities.map((a) => [a.id, { id: a.id, weightPct: a.weightPct, children: [], leaf: a }]));
  const root: Node = { id: '', weightPct: null, children: [] };
  for (const e of elements) {
    const parent = e.parentId && e.parentId !== e.id ? elementNodes.get(e.parentId) : undefined;
    (parent ?? root).children.push(elementNodes.get(e.id)!);
  }
  const summaries = new Set<string>();
  for (const a of activities) {
    const node = activityNodes.get(a.id)!;
    const parentActivity = a.parentActivityId && a.parentActivityId !== a.id ? activityNodes.get(a.parentActivityId) : undefined;
    if (parentActivity) {
      parentActivity.children.push(node);
      summaries.add(parentActivity.id);
      continue;
    }
    const element = a.workElementId ? elementNodes.get(a.workElementId) : undefined;
    (element ?? root).children.push(node);
  }

  const pct = new Map<string, number>();
  const value = new Map<string, number>();
  const seen = new Set<Node>();
  // Returns [pct, value]; a node seen twice (a cycle in bad data) counts as empty.
  const walk = (node: Node): [number, number] => {
    if (seen.has(node)) return [0, 0];
    seen.add(node);
    let result: [number, number];
    if (!node.children.length) {
      result = node.leaf ? [leafPct(node.leaf.executedQty, node.leaf.plannedQty), Math.max(0, node.leaf.value)] : [0, 0];
    } else {
      const kids = node.children.map((c) => ({ weightPct: c.weightPct, r: walk(c) }));
      const weights = siblingWeights(kids.map((k) => ({ weightPct: k.weightPct, value: k.r[1] })));
      const total = weights.reduce((s, w) => s + w, 0);
      const done = kids.reduce((s, k, i) => s + weights[i] * k.r[0], 0);
      result = [total > 0 ? done / total : 0, kids.reduce((s, k) => s + k.r[1], 0)];
    }
    if (node.id) {
      pct.set(node.id, round1(result[0]));
      value.set(node.id, result[1]);
    }
    return result;
  };
  const [projectPct] = walk(root);
  return { projectPct: round1(projectPct), pct, value, summaries };
}

// ---------------------------------------------------------------------------------------------------------------------
// What the Structure tab reads


export interface WorkElementDto {
  id: string;
  projectId: string;
  parentId: string | null;
  level: WorkElementLevel;
  code: string;
  name: string;
  elementType: WorkElementType;
  specs: Record<string, number> | null;
  /** Share of its parent or of the project, %; null shares what is left by value */
  weightPct: string | null;
  /** The weight the roll-up used, % of its parent (given or worked out) */
  effectiveWeightPct: number;
  sortOrder: number;
  progressPct: number;
  /** BOQ amount of the items linked to it (and its sub-components) */
  boqAmount: string;
  activityCount: number;
  boqCount: number;
}

export interface StructureActivityDto {
  id: string;
  name: string;
  unit: string;
  workElementId: string | null;
  parentActivityId: string | null;
  weightPct: string | null;
  effectiveWeightPct: number;
  plannedQty: string;
  executedQty: string;
  progressPct: number;
  /** Has sub-activities: its progress is theirs, it takes none of its own */
  isSummary: boolean;
  boqItemNo: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  sortOrder: number;
}

export interface StructureDto {
  projectId: string;
  contractModel: ContractModel;
  progressPct: number;
  elements: WorkElementDto[];
  activities: StructureActivityDto[];
  /** Weights given to components that do not add up to 100 (null when they do, or none is given) */
  componentWeightTotal: number | null;
}

/** The effective weight of every node as a % of its parent, for display. */
export function effectiveWeights(elements: RollupElement[], activities: RollupActivity[], value: Map<string, number>): Map<string, number> {
  const groups = new Map<string, { id: string; weightPct: number | null }[]>();
  const add = (key: string, n: { id: string; weightPct: number | null }) => groups.set(key, [...(groups.get(key) ?? []), n]);
  const elementIds = new Set(elements.map((e) => e.id));
  const activityIds = new Set(activities.map((a) => a.id));
  for (const e of elements) add(e.parentId && elementIds.has(e.parentId) ? `e:${e.parentId}` : 'root', e);
  for (const a of activities) {
    if (a.parentActivityId && activityIds.has(a.parentActivityId)) add(`a:${a.parentActivityId}`, a);
    else add(a.workElementId && elementIds.has(a.workElementId) ? `e:${a.workElementId}` : 'root', a);
  }
  const out = new Map<string, number>();
  for (const siblings of groups.values()) {
    const weights = siblingWeights(siblings.map((s) => ({ weightPct: s.weightPct, value: value.get(s.id) ?? 0 })));
    const total = weights.reduce((s, w) => s + w, 0);
    siblings.forEach((s, i) => out.set(s.id, total > 0 ? round1((weights[i] / total) * 100) : 0));
  }
  return out;
}

/** Outline numbers in order: 2 before 10, 3.2 before 3.10. */
export const compareCodes = (a: string, b: string): number => {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const c = Number.isFinite(na) && Number.isFinite(nb) ? na - nb : pa[i].localeCompare(pb[i]);
    if (c) return c;
  }
  return 0;
};

/** The next free outline number under a parent (or at the top): one past the highest number used there. */
export const nextCode = (parentCode: string | null, taken: string[]): string => {
  const prefix = parentCode ? `${parentCode}.` : '';
  let max = 0;
  for (const c of taken) {
    if (!c.startsWith(prefix)) continue;
    const rest = c.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  let n = max + 1;
  while (taken.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

/** The parent's outline number of an imported row ("3.2" sits under "3"); null at the top. */
export const parentCodeOf = (code: string): string | null => {
  const i = code.lastIndexOf('.');
  return i > 0 ? code.slice(0, i) : null;
};

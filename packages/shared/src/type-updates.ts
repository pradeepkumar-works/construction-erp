/**
 * Bringing a running project up to its type (item 134 part 3, ARCHITECTURE "Project types", Updating projects): what a
 * project of a type would gain from the type's breakdown, its component kinds' steps and its loose activities as they
 * are now. Pure, so the preview the admin reads is the change the API makes.
 *
 * It only ever adds. A component, sub-component or activity is matched by its name (any case, a copy as "Pier 2"), and
 * anything the project already has stays exactly as it is: its quantities, weights, dates and progress. What joins
 * existing work comes in with no weight, so the weights the project set keep their meaning and its progress does not
 * move by itself; a new component's own activities keep their kind's weights inside it.
 */
import type { WorkElementType } from './enums';
import { kindPlan, type ElementActivityLine, type ElementSpecs } from './element-templates';
import type { ComponentKindDef, LaidOutComponent, ProjectTypeDef } from './project-types';
import type { ActivityTemplateItem } from './templates';

/** A component or sub-component the project has. */
export interface UpdateElement {
  id: string;
  parentId: string | null;
  name: string;
  /** null for one made before item 134: its kind is the built-in one of its element type */
  kindCode: string | null;
  elementType: WorkElementType;
  specs: ElementSpecs | null;
}

/** An activity the project has. */
export interface UpdateActivity {
  id: string;
  workElementId: string | null;
  parentActivityId: string | null;
  name: string;
}

/** An activity to add under a component the project has (or a sub-activity under an activity it has). */
export interface AddedActivity {
  /** The component it goes in */
  elementId: string;
  elementName: string;
  /** An activity the project has, when this is its new sub-activity */
  parentActivityId: string | null;
  /** A line of this list, when this is the sub-activity of a new activity */
  parentKey: string | null;
  key: string;
  name: string;
  unit: string;
  /** From the component's specs; null when the planner fills it in */
  qty: number | null;
  /** Inside a new activity only (its share of it); null where it joins what the project has */
  weightPct: number | null;
}

/** A component to add: a new top-level one, or a sub-component under a component the project has. */
export interface AddedComponent extends LaidOutComponent {
  /** The component the project has that a new sub-component goes under */
  parentId: string | null;
  parentName: string | null;
}

/** A stable key for each thing a plan adds, so the admin can leave some of it out: a component, an activity, a loose activity. */
export const componentItemKey = (c: Pick<AddedComponent, 'key'>) => `c:${c.key}`;
export const activityItemKey = (a: Pick<AddedActivity, 'elementId' | 'key'>) => `a:${a.elementId}:${a.key}`;
export const looseItemKey = (name: string) => `l:${norm(name)}`;

/**
 * The plan without what the admin left out. A sub-component goes with its new component, and a sub-activity with its
 * new activity.
 */
export function withoutItems(plan: ProjectUpdatePlan, skip: string[]): ProjectUpdatePlan {
  const out = new Set(skip);
  const components = plan.components.filter((c) => !out.has(componentItemKey(c)) && !(c.parentKey && out.has(componentItemKey({ key: c.parentKey }))));
  const activities = plan.activities.filter((a) => !out.has(activityItemKey(a)) && !(a.parentKey && out.has(activityItemKey({ elementId: a.elementId, key: a.parentKey }))));
  return { components, activities, loose: plan.loose.filter((n) => !out.has(looseItemKey(n))) };
}

export interface ProjectUpdatePlan {
  components: AddedComponent[];
  activities: AddedActivity[];
  /** Loose activities of the type the project does not have, by name */
  loose: string[];
}

export const MAX_UPDATE_PROJECTS = 200;

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The project's components that are copies of a breakdown entry: its name, or its name and a number ("Pier 3"). */
export const copiesOf = <T extends Pick<UpdateElement, 'name'>>(name: string, elements: T[]): T[] => {
  const re = new RegExp(`^${escape(norm(name))}( \\d+)?$`);
  return elements.filter((e) => re.test(norm(e.name)));
};

/**
 * The kind a component was laid out from. One made before item 134, or made by hand, names none, and its activities are
 * the planner's own: a kind's steps are offered only to the components laid out from it.
 */
const kindOf = (e: Pick<UpdateElement, 'kindCode'>, kinds: Map<string, ComponentKindDef>) => (e.kindCode ? kinds.get(e.kindCode) : undefined);

/** The steps of its kind a component lacks (by name), each with its sub-activities, and missing sub-activities of the steps it has. */
function missingSteps(element: UpdateElement, kind: ComponentKindDef, activities: UpdateActivity[]): AddedActivity[] {
  const own = activities.filter((a) => a.workElementId === element.id);
  const top = new Map(own.filter((a) => !a.parentActivityId).map((a) => [norm(a.name), a]));
  const lines = kindPlan(kind, element.specs);
  const out: AddedActivity[] = [];
  const add = (l: ElementActivityLine, parent: { id: string | null; key: string | null }, weighted: boolean): void => {
    out.push({ elementId: element.id, elementName: element.name, parentActivityId: parent.id, parentKey: parent.key, key: l.key, name: l.name, unit: l.unit, qty: l.qty, weightPct: weighted ? l.weightPct : null });
  };
  for (const l of lines.filter((x) => !x.parentKey)) {
    const subs = lines.filter((x) => x.parentKey === l.key);
    const have = top.get(norm(l.name));
    if (!have) {
      add(l, { id: null, key: null }, false);
      for (const s of subs) add(s, { id: null, key: l.key }, true);
      continue;
    }
    const haveSubs = new Set(own.filter((a) => a.parentActivityId === have.id).map((a) => norm(a.name)));
    // An activity the project keeps as one line (no sub-activities) is left alone: splitting it would move its progress.
    if (!haveSubs.size) continue;
    for (const s of subs) if (!haveSubs.has(norm(s.name))) add(s, { id: have.id, key: null }, false);
  }
  return out;
}

/**
 * What a project would gain from its type now (see the file's note). `only` limits it to the components of one kind,
 * for a kind's own Update projects; then the breakdown and loose activities are left out.
 */
export function projectUpdatePlan(
  type: Pick<ProjectTypeDef, 'breakdown' | 'activities'> | null,
  kinds: ComponentKindDef[],
  elements: UpdateElement[],
  activities: UpdateActivity[],
  only?: { kind: string },
): ProjectUpdatePlan {
  const byCode = new Map(kinds.map((k) => [k.code, k]));
  const tops = elements.filter((e) => !e.parentId);
  const components: AddedComponent[] = [];
  const steps: AddedActivity[] = [];

  for (const e of elements) {
    const kind = kindOf(e, byCode);
    if (!kind || (only && kind.code !== only.kind)) continue;
    steps.push(...missingSteps(e, kind, activities));
  }

  if (type && !only) {
    for (const entry of type.breakdown.filter((b) => !b.parentKey)) {
      const kind = byCode.get(entry.kind);
      if (!kind || !kind.active) continue;
      const copies = copiesOf(entry.name, tops);
      const subs = type.breakdown.filter((b) => b.parentKey === entry.key);
      if (!copies.length) {
        for (let i = 1; i <= entry.count; i++) {
          const key = entry.count === 1 ? entry.key : `${entry.key}#${i}`;
          const name = entry.count === 1 ? entry.name : `${entry.name} ${i}`;
          components.push({ key, parentKey: null, parentId: null, parentName: null, kind: kind.code, elementType: kind.elementType, name, specs: entry.specs ?? null, weightPct: null, activities: kindPlan(kind, entry.specs) });
          for (const s of subs) {
            const sk = byCode.get(s.kind);
            if (sk?.active) components.push({ key: `${key}/${s.key}`, parentKey: key, parentId: null, parentName: null, kind: sk.code, elementType: sk.elementType, name: s.name, specs: s.specs ?? null, weightPct: s.weightPct ?? null, activities: kindPlan(sk, s.specs) });
          }
        }
        continue;
      }
      for (const copy of copies) {
        const children = elements.filter((x) => x.parentId === copy.id);
        for (const s of subs) {
          const sk = byCode.get(s.kind);
          if (!sk?.active || copiesOf(s.name, children).length) continue;
          components.push({ key: `${copy.id}/${s.key}`, parentKey: null, parentId: copy.id, parentName: copy.name, kind: sk.code, elementType: sk.elementType, name: s.name, specs: s.specs ?? null, weightPct: null, activities: kindPlan(sk, s.specs) });
        }
      }
    }
  }

  const names = new Set(activities.map((a) => norm(a.name)));
  const loose = type && !only ? type.activities.filter((a: ActivityTemplateItem) => !names.has(norm(a.name))).map((a) => a.name) : [];
  return { components, activities: steps, loose };
}

/** How much a plan adds: components (with sub-components) and activities, counting a new component's own. */
export const planSize = (p: ProjectUpdatePlan) => ({
  components: p.components.length,
  activities: p.activities.length + p.loose.length + p.components.reduce((t, c) => t + c.activities.length, 0),
});

export const planIsEmpty = (p: ProjectUpdatePlan) => !p.components.length && !p.activities.length && !p.loose.length;

/* ---------- API shapes ---------- */

export interface ProjectUpdateRowDto {
  projectId: string;
  code: string;
  name: string;
  status: string;
  /** The type's version the project was made with or last brought up to; null before item 134 */
  typeVersion: number | null;
  plan: ProjectUpdatePlan;
  /** Physical progress now and once the plan is added, % to one decimal: the same unless the project weighs by value alone */
  progressNow: number;
  progressAfter: number;
}

export interface ProjectUpdatesDto {
  /** The type's code, or the kind's for a kind's updates */
  code: string;
  name: string;
  version: number;
  /** Projects with something to add; the rest are up to date */
  rows: ProjectUpdateRowDto[];
  upToDate: number;
}

export interface ApplyUpdatesResultDto {
  projects: number;
  components: number;
  activities: number;
}

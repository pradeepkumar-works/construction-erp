/**
 * Linking activities to BOQ items (finding 11 of the October review). A project's activities come from a template and
 * its BOQ from Excel or a scan, so nothing joins them until someone picks an item for each activity by hand. The BOQ's
 * sections are usually named after the same work, so the links can be offered: pure here, applied only on Confirm.
 */
import { itemSimilarity } from './doc-read';

/** A BOQ item as the matching reads it. */
export interface LinkBoqItem {
  id: string;
  itemNo: string;
  description: string;
  section: string | null;
  unit: string;
  /** Revised where there is one, else original */
  quantity: string;
  /** Activities already linked to it */
  linked: number;
}

export interface LinkActivity {
  id: string;
  name: string;
  unit: string;
  plannedQty: string;
  boqItemId: string | null;
}

export interface BoqLinkSuggestion {
  activityId: string;
  activityName: string;
  boqItemId: string;
  itemNo: string;
  description: string;
  /** The item's unit and quantity, offered for the activity when it has none of its own */
  unit: string;
  quantity: string;
  /** Why this item: the section it is in, or the words of its description */
  reason: 'section' | 'description';
  /** The one item of its section, or the largest of several */
  section: string | null;
  /** How alike the names are, 0 to 1 */
  score: number;
}

/** A name without case, punctuation or the words a BOQ section and an activity spell differently. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(works?|work of|item|items|part|section|schedule|bill of quantities|boq)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** How alike a section's name and an activity's are: the same words, or the words of one inside the other. */
export function nameMatch(a: string, b: string): number {
  const [x, y] = [norm(a), norm(b)];
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  return itemSimilarity(x, y);
}

/** A BOQ item's value, for picking the item that stands for a section. */
const valueOf = (i: LinkBoqItem) => Number(i.quantity) || 0;

/**
 * One suggested BOQ item for each activity with none, best first. An activity matches the section whose name is like
 * its own (the section's largest item stands for it); failing that, the item whose description is most like the
 * activity's name. An item already linked to an activity is not offered again, and nothing under `min` is offered.
 */
export function boqLinkSuggestions(activities: LinkActivity[], items: LinkBoqItem[], min = 0.6): BoqLinkSuggestion[] {
  const free = items.filter((i) => !i.linked);
  const open = activities.filter((a) => !a.boqItemId);
  const bySection = new Map<string, LinkBoqItem[]>();
  for (const i of free) if (i.section) bySection.set(i.section, [...(bySection.get(i.section) ?? []), i]);
  const pairs: (BoqLinkSuggestion & { itemId: string })[] = [];
  for (const a of open) {
    for (const [section, rows] of bySection) {
      const score = nameMatch(section, a.name);
      if (score < min) continue;
      // The section's largest item stands for the section: progress on the activity is measured against it.
      const pick = [...rows].sort((x, y) => valueOf(y) - valueOf(x))[0];
      pairs.push({ ...suggestion(a, pick, 'section', score), itemId: pick.id });
    }
    for (const i of free) {
      const score = nameMatch(i.description, a.name);
      if (score < min) continue;
      pairs.push({ ...suggestion(a, i, 'description', score), itemId: i.id });
    }
  }
  // The same item reached by its section and by its description is one offer, explained by its section.
  const best = new Map<string, (typeof pairs)[number]>();
  for (const p of pairs) {
    const key = `${p.activityId}:${p.itemId}`;
    const had = best.get(key);
    if (!had) best.set(key, p);
    else best.set(key, { ...had, score: Math.max(had.score, p.score), reason: had.reason === 'section' || p.reason === 'section' ? 'section' : 'description' });
  }
  const ranked = [...best.values()].sort((p, q) => q.score - p.score || (p.reason === 'section' ? -1 : 1) - (q.reason === 'section' ? -1 : 1));
  const takenActivity = new Set<string>();
  const takenItem = new Set<string>();
  const out: BoqLinkSuggestion[] = [];
  for (const p of ranked) {
    if (takenActivity.has(p.activityId) || takenItem.has(p.itemId)) continue;
    takenActivity.add(p.activityId);
    takenItem.add(p.itemId);
    const { itemId: _itemId, ...rest } = p;
    out.push(rest);
  }
  return out;
}

function suggestion(a: LinkActivity, i: LinkBoqItem, reason: 'section' | 'description', score: number): BoqLinkSuggestion {
  return {
    activityId: a.id,
    activityName: a.name,
    boqItemId: i.id,
    itemNo: i.itemNo,
    description: i.description,
    unit: i.unit,
    quantity: i.quantity,
    reason,
    section: i.section,
    score: Math.round(score * 100) / 100,
  };
}

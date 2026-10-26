import { itemSimilarity, normUnit } from './doc-read';

/**
 * The item master against free text (finding 3 of the October review): a request or order line names its material in
 * words, and the same cement written three ways is three items to stock, rates and leakage. These rules decide when
 * two names are one item, which master item a typed line is, and which items look like duplicates to merge.
 */

/** An item name as one spelling: case, dots and spacing ignored, "53 Grade" and "53grade" alike ("O.P.C. 53 grade" → "opc 53grade"). */
export const itemKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[.'’"]/g, '')
    .replace(/(\d)\s+(?=[a-z])/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface MasterItemLike {
  id: string;
  name: string;
  unit: string;
  /** Old spellings merged into it, as `itemKey` writes them */
  aliases?: string[];
}

/** Whether a typed name and unit is this item: its name or an old name, the same unit however it is spelt. */
export const isItem = (item: MasterItemLike, name: string, unit: string): boolean => {
  if (normUnit(item.unit) !== normUnit(unit)) return false;
  const key = itemKey(name);
  return !!key && (itemKey(item.name) === key || (item.aliases ?? []).includes(key));
};

/** The master item a typed line is, or null when it is new. An exact name wins over an old name. */
export function masterItemFor<T extends MasterItemLike>(name: string, unit: string, items: T[]): T | null {
  const hits = items.filter((i) => isItem(i, name, unit));
  return hits.find((i) => itemKey(i.name) === itemKey(name)) ?? hits[0] ?? null;
}

/** How alike a name is to an item: its name or its best old name. */
const likeness = (name: string, item: MasterItemLike) => Math.max(itemSimilarity(name, item.name), ...(item.aliases ?? []).map((a) => itemSimilarity(name, a)));

/**
 * Items that may be what a new name means, before it is added as one more ("Cement" → "OPC 53 Grade Cement"): alike
 * by words (a name inside the other counts fully, a different size does not), the same unit first, best first.
 */
export function similarItems<T extends MasterItemLike>(name: string, unit: string | null | undefined, items: T[], limit = 5, min = 0.5): T[] {
  if (!itemKey(name)) return [];
  const same = (i: T) => !!unit && normUnit(unit) === normUnit(i.unit);
  return items
    .map((i) => ({ i, like: likeness(name, i), same: same(i) }))
    .filter((x) => x.like >= min)
    .sort((a, b) => Number(b.same) - Number(a.same) || b.like - a.like || a.i.name.length - b.i.name.length)
    .slice(0, limit)
    .map((x) => x.i);
}

export interface DuplicateCandidate extends MasterItemLike {
  /** How much the item is used (stock movements and lines); the most used is the one kept */
  uses?: number;
}

/**
 * Items that look like one item written more ways, for the one-time merge: the same unit, and the same spelling or one
 * name inside the other ("Cement" in "OPC 53 Grade Cement"). Each group leads with the item to keep (most used, then
 * the fullest name); an item is in one group at most, so "PPC Cement" is not pulled in by way of "Cement", nor later
 * by "cement" having become an old name of "OPC 53 Grade Cement".
 */
export function duplicateGroups<T extends DuplicateCandidate>(items: T[], min = 0.9): { keep: T; merge: T[] }[] {
  const order = [...items].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || b.name.length - a.name.length || a.name.localeCompare(b.name));
  const taken = new Set<string>();
  const out: { keep: T; merge: T[] }[] = [];
  for (const keep of order) {
    if (taken.has(keep.id)) continue;
    const merge = order.filter(
      (o) => o.id !== keep.id && !taken.has(o.id) && normUnit(o.unit) === normUnit(keep.unit) && (isItem(keep, o.name, o.unit) || itemSimilarity(o.name, keep.name) >= min),
    );
    if (!merge.length) continue;
    taken.add(keep.id);
    merge.forEach((m) => taken.add(m.id));
    out.push({ keep, merge });
  }
  return out;
}

/** GET /stock/items/duplicates: a group of items that look like one, the first to keep. */
export interface ItemDuplicateGroupDto {
  keep: ItemMergeEntryDto;
  merge: ItemMergeEntryDto[];
}

export interface ItemMergeEntryDto {
  id: string;
  name: string;
  unit: string;
  /** Stock movements, request and order lines that name it */
  uses: number;
}

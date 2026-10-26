import type { Prisma } from '@prisma/client';
import { itemKey, masterItemFor } from '@erp/shared';

type Db = Pick<Prisma.TransactionClient, 'item'>;

export interface MasterItemRow {
  id: string;
  name: string;
  unit: string;
  aliases: string[];
}

/** The longest word of a name that is letters only ("cement" of "opc 53grade cement"), to narrow the search. */
const searchWord = (key: string) => key.split(' ').filter((w) => /^[a-z]{3,}$/.test(w)).sort((a, b) => b.length - a.length)[0] ?? key.split(' ')[0];

/**
 * The master items a set of typed names may be (finding 3 of the October review): any whose old names hold one of
 * the names, or whose name holds its main word. `masterItemFor` then decides; this only keeps the read small.
 */
export async function masterCandidates(db: Db, organizationId: string, names: string[]): Promise<MasterItemRow[]> {
  const keys = [...new Set(names.map(itemKey).filter(Boolean))];
  if (!keys.length) return [];
  const words = [...new Set(keys.map(searchWord))];
  return db.item.findMany({
    where: { organizationId, OR: [{ aliases: { hasSome: keys } }, ...words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } }))] },
    select: { id: true, name: true, unit: true, aliases: true },
    take: 1000,
  });
}

/**
 * A request or order line names its material as the master has it: "opc 53 grade cement, bag" becomes
 * "OPC 53 Grade Cement, Bags" when that item is in the master (by name or a merged old name). A new name stays as
 * typed, and the item is added when it is first received. Stock, rates and leakage all match lines by name and unit,
 * so one spelling keeps them on one item.
 */
export async function asMasterNames<T extends { itemName: string; unit: string }>(db: Db, organizationId: string, lines: T[]): Promise<T[]> {
  const items = await masterCandidates(db, organizationId, lines.map((l) => l.itemName));
  return lines.map((l) => {
    const name = l.itemName.trim();
    const unit = l.unit.trim();
    const item = masterItemFor(name, unit, items);
    return { ...l, itemName: item?.name ?? name, unit: item?.unit ?? unit };
  });
}

/** The master item a typed name and unit is, or null. */
export async function findMasterItem(db: Db, organizationId: string, name: string, unit: string): Promise<MasterItemRow | null> {
  return masterItemFor(name, unit, await masterCandidates(db, organizationId, [name]));
}

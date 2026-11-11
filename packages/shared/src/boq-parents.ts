/**
 * Parent items in a BOQ (ARCHITECTURE "Reading invoices, challans, drawings, work orders and BOQs", Parent items): a schedule of rates describes the work once on a numbered
 * line with no unit, rate or quantity ("2.8 Earth work in excavation by mechanical means … including disposal of
 * excavated earth, lead up to 50 m and lift up to 1.5 m") and prices it on the lines under it ("2.8.1 All kinds of
 * soil", "(a) Ordinary rock"). The sub-item is the thing billed, so its description carries the parent's words in
 * front of its own; read alone, "All kinds of soil" says nothing of what is being paid for. A short line with no
 * figures ("2 EARTH WORK", "Part B: Concrete") is a heading and becomes the section of the items under it.
 */

/** The fewest words a figureless numbered line has to be a parent's description rather than a heading. */
export const PARENT_MIN_WORDS = 6;

export type BoqLineKind = 'item' | 'parent' | 'heading';

/**
 * What a BOQ line is: an item when it has a unit, rate or quantity; else, with a description, the parent of the items
 * under it when it is numbered and reads as a description (six words or more, not all capitals, not "Part …",
 * "Sub-head …"), or a heading.
 */
export function boqLineKind(l: { itemNo: string; description: string; unit: string; rate: string; qty: string }): BoqLineKind | null {
  if (l.unit.trim() || l.rate.trim() || l.qty.trim()) return 'item';
  const d = l.description.trim();
  if (!d) return null;
  return l.itemNo.trim() && !looksLikeHeading(d) && words(d) >= PARENT_MIN_WORDS ? 'parent' : 'heading';
}

/** "PART B: CONCRETE WORKS", "Sub-head 3 Earthwork", "SCHEDULE A": a heading, not an item's description. */
const looksLikeHeading = (t: string) => /^(part|section|sub[\s-]*head|head|schedule|bill\s+no)\b/i.test(t) || (t.replace(/[^A-Za-z]/g, '').length >= 4 && t === t.toUpperCase());

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const norm = (n: string) => n.trim().replace(/[.\s]+$/, '');
/** "(a)", "a)", "b.", "(iii)": a sub-item's own marker, numbered only under its parent. */
const MARKER = /^\(?([a-z]|[ivx]{1,5})[).]?$/i;

/**
 * Whether an item number is a sub-item of a parent's: "2.8.1" and "2.8(a)" of "2.8", "2.8a" too, and a bare "(a)" or
 * "ii)" under it. "2.81" is not a sub-item of "2.8".
 */
export function isSubItemOf(itemNo: string, parentNo: string): boolean {
  const n = norm(itemNo);
  const p = norm(parentNo);
  if (!p) return false;
  if (!n || MARKER.test(n)) return true;
  if (!n.startsWith(p) || n === p) return false;
  const rest = n.slice(p.length);
  return /^[.\-/]\s*\S/.test(rest) || /^\s*\(/.test(rest) || /^[a-z]{1,4}\)?$/i.test(rest);
}

/** A sub-item's number: its own, or "2.8(a)" for a bare marker, so (a) under 2.8 and (a) under 2.9 stay two items. */
export function subItemNo(itemNo: string, parentNo: string): string {
  const n = norm(itemNo);
  const m = MARKER.exec(n);
  return m ? `${norm(parentNo)}(${m[1].toLowerCase()})` : itemNo.trim();
}

/** The parent's words in front of the sub-item's: "Earth work in excavation …: All kinds of soil". */
export function withParentText(parent: string, own: string): string {
  const p = parent.trim();
  const o = own.trim();
  if (!p) return o;
  if (!o) return p;
  if (o.toLowerCase().startsWith(p.toLowerCase())) return o;
  return `${p}${/[:;,\-–—]$/.test(p) ? ' ' : ': '}${o}`.slice(0, 2000);
}

export interface BoqParentLine {
  itemNo: string;
  description: string;
  unit: string;
  rate: string;
  qty: string;
  section?: string | null;
}

export interface CarriedBoqLine {
  /** Index of the line in the input */
  index: number;
  kind: BoqLineKind;
  itemNo: string;
  /** An item's description with its parent's in front; a parent's or heading's own */
  description: string;
  /** The line's own section, else the heading above it */
  section: string | null;
  /** The parent item it sits under, or null */
  parentNo: string | null;
}

/**
 * Walk a BOQ's lines in order: headings set the section of what follows, a parent's description is carried in front of
 * each sub-item under it (numbered under it, or a bare marker) until an item that is not its own, and a figureless line
 * with no number right after a parent runs its description on.
 */
export function carryParents(lines: BoqParentLine[]): CarriedBoqLine[] {
  const out: CarriedBoqLine[] = [];
  let section: string | null = null;
  let parent: { itemNo: string; text: string; out: CarriedBoqLine } | null = null;
  let underParent = 0;
  lines.forEach((l, index) => {
    if (l.section?.trim()) section = l.section.trim();
    const kind = boqLineKind(l);
    if (!kind) return;
    if (kind === 'heading') {
      const last = out[out.length - 1];
      if (!l.itemNo.trim() && !looksLikeHeading(l.description.trim()) && last && last.kind !== 'heading') {
        // A run-on: more of the parent's words before its first sub-item, else more of the item above.
        if (parent && !underParent) {
          parent.text = `${parent.text} ${l.description.trim()}`.slice(0, 2000);
          parent.out.description = parent.text;
        } else if (last.kind === 'item') last.description = `${last.description} ${l.description.trim()}`.slice(0, 2000);
        return;
      }
      parent = null;
      section = l.description.trim().slice(0, 120);
      out.push({ index, kind, itemNo: l.itemNo.trim(), description: l.description.trim(), section, parentNo: null });
      return;
    }
    if (kind === 'parent') {
      const row: CarriedBoqLine = { index, kind, itemNo: l.itemNo.trim(), description: l.description.trim(), section, parentNo: null };
      parent = { itemNo: row.itemNo, text: row.description, out: row };
      underParent = 0;
      out.push(row);
      return;
    }
    if (parent && isSubItemOf(l.itemNo, parent.itemNo)) {
      underParent++;
      const itemNo = l.itemNo.trim() ? subItemNo(l.itemNo, parent.itemNo) : `${parent.itemNo}.${underParent}`;
      out.push({ index, kind, itemNo, description: withParentText(parent.text, l.description), section, parentNo: parent.itemNo });
      return;
    }
    parent = null;
    out.push({ index, kind, itemNo: l.itemNo.trim(), description: l.description.trim(), section, parentNo: null });
  });
  return out;
}

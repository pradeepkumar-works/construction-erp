/**
 * DPR credibility checks (intelligence quick win Q3), pure: work with no crew, work whose material was never issued,
 * figures and crews copied day after day, and a photo that came with an earlier report. `DprChecksService` loads the
 * report and its history; tested in `src/scripts/intelligence-test.ts`.
 */
import type { DprCheckDto } from '@erp/shared';
import { DPR_COPY_DAYS, DPR_CREW_COPY_DAYS, DPR_ISSUE_DAYS, DPR_PHOTO_MIN_BYTES } from '@erp/shared';

export interface CheckLine {
  id: string;
  activityId: string;
  activityName: string;
  unit: string;
  quantity: number;
  /** Heads on the line's own crew */
  crew: number;
  machines: number;
  /** Items the line says it used */
  usedItemIds: string[];
}

export interface CheckReport {
  id: string;
  date: string;
  /** Heads on the day's crew */
  crew: number;
  machines: number;
  /** "Mason:4|Helper:6", the day's crew category by category, sorted; empty when none */
  crewKey: string;
  lines: CheckLine[];
}

/** An earlier report of the same project, newest first */
export interface EarlierReport {
  id: string;
  date: string;
  crewKey: string;
  lines: { activityId: string; quantity: number }[];
}

export interface CheckPhoto {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface EarlierPhoto extends CheckPhoto {
  dprId: string;
  date: string;
}

/** The day's crew as one comparable string. */
export const crewKeyOf = (crew: { category: string; count: number }[]) =>
  crew
    .filter((c) => c.count > 0)
    .map((c) => `${c.category.trim().toLowerCase()}:${c.count}`)
    .sort()
    .join('|');

const qty = (v: number) => (Math.round(v * 1000) / 1000).toLocaleString('en-IN');
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ref = (r: { id: string; date: string }) => ({ label: `DPR of ${day(r.date)}`, href: `/dpr/${r.id}` });

/**
 * Work with no one to do it: when the day names no crew and no machine, one check for the report; when the report books
 * crews line by line, each line with work and none of its own.
 */
export function noCrew(r: CheckReport): DprCheckDto[] {
  const working = r.lines.filter((l) => l.quantity > 0);
  if (!working.length) return [];
  if (r.crew === 0 && r.machines === 0 && working.every((l) => l.crew === 0 && l.machines === 0))
    return [{ kind: 'NO_CREW', lineId: null, text: `${plural(working.length, 'line')} of work and no crew or machine on the day`, refs: [] }];
  if (!r.lines.some((l) => l.crew > 0 || l.machines > 0)) return [];
  return working
    .filter((l) => l.crew === 0 && l.machines === 0)
    .map((l) => ({ kind: 'NO_CREW' as const, lineId: l.id, text: `${l.activityName}: ${qty(l.quantity)} ${l.unit} with no crew or machine, while the other lines name theirs`, refs: [] }));
}

/**
 * Work whose material never left the store: a line on an activity with norms, where none of the items the norms need
 * was issued on the project in the `DPR_ISSUE_DAYS` up to the report and the line says it used none of them.
 */
export function noMaterial(r: CheckReport, needs: Map<string, { itemId: string; name: string }[]>, issued: Set<string>): DprCheckDto[] {
  return r.lines.flatMap((l) => {
    const items = needs.get(l.activityId) ?? [];
    if (l.quantity <= 0 || !items.length) return [];
    if (items.some((i) => issued.has(i.itemId) || l.usedItemIds.includes(i.itemId))) return [];
    const names = items.slice(0, 3).map((i) => i.name.toLowerCase());
    return [{ kind: 'NO_MATERIAL' as const, lineId: l.id, text: `${l.activityName}: ${qty(l.quantity)} ${l.unit}, and no ${names.join(' or ')} issued in the ${DPR_ISSUE_DAYS} days to this report`, refs: [] }];
  });
}

/**
 * Figures copied from the day before: a line whose quantity on its activity is the same as on the `DPR_COPY_DAYS − 1`
 * reports just before it, and a day's crew the same, category by category, on the `DPR_CREW_COPY_DAYS − 1` before it.
 */
export function copied(r: CheckReport, earlier: EarlierReport[]): DprCheckDto[] {
  const out: DprCheckDto[] = [];
  const seen = new Set<string>();
  for (const l of r.lines) {
    if (l.quantity <= 0 || seen.has(l.activityId)) continue;
    seen.add(l.activityId);
    const run: EarlierReport[] = [];
    for (const e of earlier) {
      const same = e.lines.find((x) => x.activityId === l.activityId);
      if (!same || Math.abs(same.quantity - l.quantity) > 1e-6) break;
      run.push(e);
    }
    if (run.length + 1 >= DPR_COPY_DAYS)
      out.push({ kind: 'COPIED', lineId: l.id, text: `${l.activityName}: ${qty(l.quantity)} ${l.unit}, the same as on the ${plural(run.length, 'report')} before`, refs: run.slice(0, 3).map(ref) });
  }
  if (r.crewKey) {
    const run: EarlierReport[] = [];
    for (const e of earlier) {
      if (e.crewKey !== r.crewKey) break;
      run.push(e);
    }
    if (run.length + 1 >= DPR_CREW_COPY_DAYS)
      out.push({ kind: 'CREW_COPIED', lineId: null, text: `The crew is the same, trade by trade, as on the ${plural(run.length, 'report')} before`, refs: run.slice(0, 3).map(ref) });
  }
  return out;
}

/**
 * A photo that came with an earlier report: an image of the same type and the same size to the byte, at least
 * `DPR_PHOTO_MIN_BYTES`. Two different photos almost never match to the byte; the same file sent again always does.
 */
export function reusedPhotos(mine: CheckPhoto[], earlier: EarlierPhoto[]): DprCheckDto[] {
  return mine.flatMap((p) => {
    if (!p.mimeType.startsWith('image/') || p.size < DPR_PHOTO_MIN_BYTES) return [];
    const match = earlier.find((e) => e.size === p.size && e.mimeType === p.mimeType && e.id !== p.id);
    return match ? [{ kind: 'PHOTO_REUSED' as const, lineId: null, text: `${p.fileName} is the same file as ${match.fileName} on the report of ${day(match.date)}`, refs: [ref({ id: match.dprId, date: match.date })] }] : [];
  });
}

/** Every check on a report, in the order an approver reads them. */
export const dprChecks = (r: CheckReport, earlier: EarlierReport[], needs: Map<string, { itemId: string; name: string }[]>, issued: Set<string>, mine: CheckPhoto[], earlierPhotos: EarlierPhoto[]): DprCheckDto[] => [
  ...noCrew(r),
  ...noMaterial(r, needs, issued),
  ...copied(r, earlier),
  ...reusedPhotos(mine, earlierPhotos),
];

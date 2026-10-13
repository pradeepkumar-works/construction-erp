import type { ManpowerLine } from './types';

export interface AttendanceLineInput {
  contractor: string;
  category: string;
  count: number;
}

const key = (s: string) => s.trim().toLowerCase();

/**
 * Clean up attendance lines before saving: trim names, drop zero / blank rows and merge rows with the same
 * contractor and trade (case-insensitive, first spelling wins). Order follows first appearance.
 */
export function normalizeAttendanceLines<T extends AttendanceLineInput>(lines: T[]): AttendanceLineInput[] {
  const merged = new Map<string, AttendanceLineInput>();
  for (const l of lines) {
    const contractor = l.contractor.trim();
    const category = l.category.trim();
    const count = Math.trunc(Number(l.count) || 0);
    if (!contractor || !category || count <= 0) continue;
    const k = `${key(contractor)}\u0000${key(category)}`;
    const prev = merged.get(k);
    if (prev) prev.count += count;
    else merged.set(k, { contractor, category, count });
  }
  return [...merged.values()];
}

/** Head count per trade across contractors, in first-appearance order: the DPR's manpower lines. */
export function attendanceToManpower(lines: AttendanceLineInput[]): ManpowerLine[] {
  const byCategory = new Map<string, ManpowerLine>();
  for (const l of lines) {
    const k = key(l.category);
    const prev = byCategory.get(k);
    if (prev) prev.count += l.count;
    else byCategory.set(k, { category: l.category.trim(), count: l.count });
  }
  return [...byCategory.values()];
}

export const totalWorkers = (lines: { count: number }[]) => lines.reduce((s, l) => s + (Number(l.count) || 0), 0);

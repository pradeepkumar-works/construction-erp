/**
 * Verticals (ARCHITECTURE "Verticals"): the company's business lines, such as water, buildings and roads. A
 * vertical is an entry of the `vertical` master (`MASTER_LIST_DEFS.vertical`, kept by code); each project and tender
 * carries one (`verticalCode`, or none). A new project takes the vertical of its built-in kind when the form names
 * none (`verticalOfType`); the header can show one vertical at a time, and reports group their rows by it
 * (`byVertical`).
 */
import type { ProjectType } from './enums';

/** The standard vertical of each built-in kind; a store, a plant or other work has none of its own. */
export const VERTICAL_OF_TYPE: Partial<Record<ProjectType, string>> = {
  WATER_SUPPLY: 'water',
  SEWERAGE: 'water',
  BUILDING: 'buildings',
  ROAD: 'roads-and-bridges',
};

/**
 * The vertical a new project of this kind starts in, if the company still has it switched on; null otherwise (the
 * form or an admin chooses).
 */
export function verticalOfType(type: ProjectType, verticals: { code: string; isActive: boolean }[]): string | null {
  const code = VERTICAL_OF_TYPE[type];
  return code && verticals.some((v) => v.code === code && v.isActive) ? code : null;
}

/** The header's and a list's filter value for projects with no vertical. */
export const NO_VERTICAL = 'none';

/** Whether a record's vertical passes a filter: no filter passes all, `NO_VERTICAL` those with none. */
export function inVertical(code: string | null | undefined, filter: string | null | undefined): boolean {
  if (!filter) return true;
  if (filter === NO_VERTICAL) return !code;
  return code === filter;
}

/** What is wrong with a vertical about to be saved on a project or tender, or null. */
export function verticalProblem(code: string | null | undefined, verticals: { code: string; name: string; isActive: boolean }[]): string | null {
  if (!code) return null;
  const v = verticals.find((x) => x.code === code);
  if (!v) return 'Choose one of the company’s verticals, or add it in Masters › Verticals';
  if (!v.isActive) return `${v.name} is switched off; choose another vertical, or switch it on in Masters › Verticals`;
  return null;
}

export interface VerticalGroup<T> {
  /** null for the rows with no vertical */
  code: string | null;
  name: string;
  rows: T[];
}

/**
 * Rows grouped by vertical, in the master's order, a code the master no longer has under its code, and the rows with
 * none last as "No vertical". Groups with no rows are left out.
 */
export function byVertical<T>(rows: T[], codeOf: (row: T) => string | null | undefined, verticals: { code: string; name: string }[]): VerticalGroup<T>[] {
  const groups = new Map<string | null, T[]>();
  for (const r of rows) {
    const code = codeOf(r) || null;
    groups.set(code, [...(groups.get(code) ?? []), r]);
  }
  const named = verticals.filter((v) => groups.has(v.code)).map((v) => ({ code: v.code, name: v.name, rows: groups.get(v.code)! }));
  const known = new Set(verticals.map((v) => v.code));
  const unknown = [...groups.keys()].filter((c): c is string => c !== null && !known.has(c)).sort().map((c) => ({ code: c, name: c, rows: groups.get(c)! }));
  const none = groups.has(null) ? [{ code: null, name: 'No vertical', rows: groups.get(null)! }] : [];
  return [...named, ...unknown, ...none];
}

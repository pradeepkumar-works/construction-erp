import type { ProjectType } from './enums';

/**
 * The next project code in the company's series (finding 17 of the October review: the code was typed by hand,
 * though the series is plain to see). A code reads `<prefix>-<year>-<serial>`: the prefix says what kind of work it
 * is and the serial runs on across the company, so RD-2026-01, BL-2026-02 and WS-2026-03 are one series and the next
 * water supply project is WS-2026-04.
 */
export const PROJECT_CODE_PREFIXES: Record<ProjectType, string> = {
  ROAD: 'RD',
  BUILDING: 'BL',
  WATER_SUPPLY: 'WS',
  SEWERAGE: 'SW',
  OTHER: 'OW',
  PLANT: 'PL',
  STORE: 'ST',
};

/** What `GET /projects/next-code` offers the New project form. */
export interface NextProjectCodeDto {
  /** The code to fill in, or null when the company's codes are its own shape. */
  code: string | null;
}

/** A code in the shape the series is counted in; a company's own shape matches nothing and is left alone. */
const CODE_SHAPE = /^([A-Z]{2,4})-(\d{4})-(\d+)$/;

/**
 * The code to offer for a new project of `type` in `year`, or null when there is nothing to carry on from: the
 * company's codes are its own shape, and a guess in ours would only be in the way. A company with no projects yet
 * starts the series at 01.
 */
export function nextProjectCode(type: ProjectType, year: number, taken: string[]): string | null {
  const matched = taken.map((c) => CODE_SHAPE.exec(c.trim().toUpperCase())).filter((m): m is RegExpExecArray => !!m);
  if (!matched.length && taken.length) return null;
  const thisYear = matched.filter((m) => Number(m[2]) === year).map((m) => m[3]);
  const serial = thisYear.reduce((n, s) => Math.max(n, Number(s)), 0) + 1;
  // Padded as the company pads: two figures until it writes more.
  const width = thisYear.reduce((w, s) => Math.max(w, s.length), 2);
  if (serial > 9_999) return null;
  return `${PROJECT_CODE_PREFIXES[type]}-${year}-${String(serial).padStart(width, '0')}`;
}

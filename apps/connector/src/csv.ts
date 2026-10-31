import { createHash } from 'crypto';

/**
 * A batching plant controller's batch report: a text file of rows, its first row the column names, written
 * with commas, semicolons or tabs. `readReport` reads it into rows of named columns, each with a key that stays the same
 * when the controller writes the same row again (a day's file grows through the day). Pure: tested in `csv-test.ts`.
 */

export interface ReportRow {
  /** Stable for the same file name and the same row text, so a row sent again is counted once */
  key: string;
  line: number;
  fields: Record<string, string>;
}

/** The separator a header line uses: the one of comma, semicolon and tab it has most of. */
export function sniffDelimiter(line: string): string {
  const counts = [',', ';', '\t'].map((d) => [d, line.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** One line's cells; a cell in double quotes may hold the separator, and "" inside it is one quote. */
export function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (c === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

const MAX_COLUMNS = 60;
const MAX_CELL = 200;

/**
 * A report's rows from the line after its header (the first line with at least two named cells). A line with fewer
 * cells than the header still counts (its last columns blank); a blank line or a repeat of the header is skipped. Up to
 * 60 columns are kept, each cell to 200 characters.
 */
export function readReport(file: string, text: string): { headers: string[]; rows: ReportRow[] } {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const start = lines.findIndex((l) => l.trim() && splitLine(l, sniffDelimiter(l)).filter((c) => c && !/^\d+([.,]\d+)?$/.test(c)).length >= 2);
  if (start < 0) return { headers: [], rows: [] };
  const delimiter = sniffDelimiter(lines[start]);
  const seen = new Map<string, number>();
  const headers = splitLine(lines[start], delimiter)
    .slice(0, MAX_COLUMNS)
    .map((h, i) => {
      const name = (h || `Column ${i + 1}`).slice(0, 60);
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      return n > 1 ? `${name} (${n})` : name;
    });
  const rows: ReportRow[] = [];
  const headerLine = lines[start].trim();
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim() === headerLine) continue;
    const cells = splitLine(raw, delimiter);
    if (cells.every((c) => !c)) continue;
    const fields: Record<string, string> = {};
    headers.forEach((h, j) => (fields[h] = (cells[j] ?? '').slice(0, MAX_CELL)));
    const key = `pb-${createHash('sha1').update(`${file}\n${raw.trim()}`).digest('hex')}`;
    rows.push({ key, line: i + 1, fields });
  }
  return { headers, rows };
}

import type { HealthLevel, ReportCell, ReportColumnKind } from '@erp/shared';
import type { TagTone } from '@/components/common/AppTag';
import { formatDate, formatINR, formatINRCompact, formatPct, formatQty, NO_VALUE, formatCount } from '@/lib/format';

/**
 * How a management report's cell reads, on the screen, in print and in Excel (ARCHITECTURE "Management dashboard and
 * reports"). The API sends numbers as numbers and leaves the words to the column's kind.
 */

const plural = (n: number, one: string) => `${formatCount(n)} ${n === 1 ? one : `${one}s`}`;

/** The cell as text; an empty cell is a dash. */
export function cellText(kind: ReportColumnKind, v: ReportCell | undefined, compact = false): string {
  if (v === null || v === undefined || v === '') return NO_VALUE;
  switch (kind) {
    case 'money':
      return compact ? formatINRCompact(v) : formatINR(v);
    case 'qty':
      return formatQty(v);
    case 'pct':
      return formatPct(v);
    case 'date':
      return formatDate(String(v));
    case 'days':
      return typeof v === 'number' ? plural(v, 'day') : String(v);
    case 'count':
      return typeof v === 'number' ? v.toLocaleString('en-IN') : String(v);
    default:
      return String(v);
  }
}

/** The cell for a spreadsheet: numbers stay numbers (rupees to the paisa), so the sheet can add them up. */
export function cellExcel(kind: ReportColumnKind, v: ReportCell | undefined): string | number | null {
  if (v === null || v === undefined || v === '') return null;
  if (kind === 'text') return String(v);
  if (kind === 'date') return String(v);
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return kind === 'money' ? Math.round(n * 100) / 100 : n;
}

export const isNumeric = (kind: ReportColumnKind) => kind !== 'text' && kind !== 'date';

/** A figure below zero (a loss) reads in the danger colour. */
export const isNegative = (kind: ReportColumnKind, v: ReportCell | undefined) => (kind === 'money' || kind === 'pct') && typeof v === 'number' && v < 0;

export const HEALTH_TONES: Record<HealthLevel, TagTone> = {
  good: 'success',
  watch: 'pending',
  act: 'danger',
};

import { Prisma } from '@prisma/client';
import type { ReportColumnDto, ReportColumnKind, ReportRowDto, ReportSectionDto } from '@erp/shared';

/** The pieces every report builds its tables from: numbers, columns, and sections with a total row. */
export const N = (v: Prisma.Decimal | number | string | null | undefined) => Number(v ?? 0);
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const col = (key: string, label: string, kind: ReportColumnKind = 'money'): ReportColumnDto => ({ key, label, kind });

/** A total row: the sum of each money, quantity or count column, the label in the first. */
export function totalRow(columns: ReportColumnDto[], rows: ReportRowDto[], label = 'Total'): ReportRowDto {
  const out: ReportRowDto = {};
  columns.forEach((c, i) => {
    if (i === 0) out[c.key] = label;
    else if (c.kind === 'money' || c.kind === 'qty' || c.kind === 'count') out[c.key] = r2(rows.reduce((s, r) => s + (typeof r[c.key] === 'number' ? (r[c.key] as number) : 0), 0));
    else out[c.key] = null;
  });
  return out;
}

export const section = (s: Omit<ReportSectionDto, 'total'> & { totals?: boolean | string }): ReportSectionDto => {
  const { totals, ...rest } = s;
  return totals && s.rows.length > 1 ? { ...rest, total: totalRow(s.columns, s.rows, typeof totals === 'string' ? totals : 'Total') } : rest;
};

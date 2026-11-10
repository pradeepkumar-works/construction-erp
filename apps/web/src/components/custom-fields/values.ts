import { extraText, type CustomFieldDto, type FieldValue, type FieldValues } from '@erp/shared';
import type { ExportColumn } from '@/lib/exportExcel';
import { formatDate } from '@/lib/format';

/** A value in words: a date in the company's date format ("03 Nov 2026"), a number with its unit, Yes or No. */
export const customValueText = (f: Pick<CustomFieldDto, 'kind' | 'unit'>, v: FieldValue | null | undefined): string =>
  f.kind === 'DATE' && typeof v === 'string' ? formatDate(v) : extraText(f, v);

/**
 * What the form sends: every active field's value, a cleared one as null so the API clears it (a value left out
 * stays as it was).
 */
export function customValuesBody(defs: CustomFieldDto[] | undefined, v: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of defs ?? []) {
    if (d.archived) continue;
    const x = v?.[d.key];
    out[d.key] = x === undefined || (typeof x === 'string' && !x.trim()) ? null : x;
  }
  return out;
}

/** Excel columns for the company's active fields, after the list's own. */
export const customExportColumns = <T extends { customValues: FieldValues }>(defs: CustomFieldDto[] | undefined): ExportColumn<T>[] =>
  (defs ?? [])
    .filter((d) => !d.archived)
    .map((d) => ({
      header: d.label,
      width: d.kind === 'LONG_TEXT' ? 40 : 18,
      value: (r: T) => {
        const v = r.customValues?.[d.key];
        if (v === undefined) return null;
        return d.kind === 'NUMBER' && typeof v === 'number' ? v : customValueText(d, v);
      },
    }));

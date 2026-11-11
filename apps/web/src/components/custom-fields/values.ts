import { extraText, readCustomValues, type CustomFieldDto, type FieldValue, type FieldValues } from '@erp/shared';
import type { ExportColumn } from '@/lib/exportExcel';
import { formatDate } from '@/lib/format';

/** A value in words: a date in the company's date format ("03 Nov 2026"), a number with its unit, Yes or No. */
export const customValueText = (f: Pick<CustomFieldDto, 'kind' | 'unit'>, v: FieldValue | null | undefined): string =>
  f.kind === 'DATE' && typeof v === 'string' ? formatDate(v) : extraText(f, v);

/**
 * What the form sends: every active field's value, a cleared one as null so the API clears it (a value left out
 * stays as it was). Nothing while the fields are still loading, so a save then leaves the record's values alone and
 * is not asked for required fields the form has not shown.
 */
export function customValuesBody(defs: CustomFieldDto[] | undefined, v: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!defs) return undefined;
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    if (d.archived) continue;
    const x = v?.[d.key];
    out[d.key] = x === undefined || (typeof x === 'string' && !x.trim()) ? null : x;
  }
  return out;
}

/**
 * The required fields a record sending for approval still lacks, as errors on their form items ("Choose Funding"),
 * read as the API reads them at submit. Empty when nothing is missing.
 */
export function missingRequired(defs: CustomFieldDto[] | undefined, sent: Record<string, unknown>, stored?: FieldValues | null): { name: string[]; errors: string[] }[] {
  return (defs ?? [])
    .filter((d) => d.required && !d.archived)
    .flatMap((d) => {
      const { problems } = readCustomValues([d], { [d.key]: sent[d.key] }, { before: stored ?? undefined, required: true });
      return problems.length ? [{ name: ['customValues', d.key], errors: problems }] : [];
    });
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

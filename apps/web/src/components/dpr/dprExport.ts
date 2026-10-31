import { normaliseDprForm, ownFieldsOf, standardDprForm, type DailyReportDto, type DprFormDto, type DprOwnField } from '@erp/shared';
import { api } from '@/lib/api';
import { DPR_EXPORT } from '@/lib/exportColumns';
import type { ExportColumn } from '@/lib/exportExcel';

/**
 * The DPR export's columns: the standard ones, then one for each number field of the company's own on the day of the forms the reports were made on, named with its unit ("Rain hours (h)").
 */
export async function dprExportColumns(rows: DailyReportDto[]): Promise<ExportColumn<DailyReportDto>[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.formId ? [r.formId] : [])))];
  const saved = new Map<string, DprFormDto>();
  for (let i = 0; i < ids.length; i += 200) {
    const part = (await api.get<DprFormDto[]>('/dpr/forms', { params: { ids: ids.slice(i, i + 200).join(',') } })).data;
    for (const f of part) saved.set(f.id!, f);
  }
  const fields = new Map<string, DprOwnField>();
  for (const r of rows) {
    const def = (r.formId && saved.get(r.formId)?.def) || normaliseDprForm(standardDprForm(r.typeCode));
    for (const f of ownFieldsOf(def, 'DAY')) if (f.kind === 'NUMBER' && !fields.has(f.key)) fields.set(f.key, f);
  }
  const own: ExportColumn<DailyReportDto>[] = [...fields.values()].map((f) => ({
    header: f.unit ? `${f.label} (${f.unit})` : f.label,
    value: (r) => (typeof r.extra?.[f.key] === 'number' ? (r.extra[f.key] as number) : null),
    width: Math.max(12, f.label.length + 6),
  }));
  // After the figures of the day, before the notes.
  const at = DPR_EXPORT.findIndex((c) => c.header === 'Work executed');
  return [...DPR_EXPORT.slice(0, at), ...own, ...DPR_EXPORT.slice(at)];
}

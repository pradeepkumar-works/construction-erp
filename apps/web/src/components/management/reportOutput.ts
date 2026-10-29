import type { ManagementReportDto, ReportSectionDto } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { formatDateTime } from '@/lib/format';
import { exportFileName, downloadWorkbook, workbookSheet, type ExportColumn } from '@/lib/exportExcel';
import { AUTO_PRINT_SCRIPT, PRINT_BRAND_CSS, PRINT_FONT_LINKS, brandFooter } from '@/components/print/printBrand';
import { cellExcel, cellText, isNegative, isNumeric } from './report-format';

/**
 * A management report printed (A4, landscape when a section is wide) and exported to Excel: the same figures, sections,
 * totals and notes as the page, in the brand's print look (ARCHITECTURE "Management dashboard and reports").
 */

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function sectionHtml(s: ReportSectionDto) {
  const cls = (kind: string, v?: unknown) =>
    [isNumeric(kind as never) ? 'num' : '', isNegative(kind as never, v as never) ? 'neg' : ''].filter(Boolean).join(' ');
  const head = s.columns.map((c) => `<th class="${cls(c.kind)}">${esc(c.label)}</th>`).join('');
  const body = s.rows.length
    ? s.rows.map((r) => `<tr>${s.columns.map((c) => `<td class="${cls(c.kind, r[c.key])}">${esc(cellText(c.kind, r[c.key]))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${s.columns.length}" class="muted">${esc(s.empty ?? 'Nothing to show for this period.')}</td></tr>`;
  const total = s.total
    ? `<tr class="total">${s.columns.map((c) => `<td class="${cls(c.kind, s.total![c.key])}">${s.total![c.key] === null || s.total![c.key] === undefined ? '' : esc(cellText(c.kind, s.total![c.key]))}</td>`).join('')}</tr>`
    : '';
  return `<h2>${esc(s.title)}</h2>${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}${total}</tbody></table>`;
}

export function buildManagementReportHtml(r: ManagementReportDto, organizationName: string, autoPrint = false) {
  const wide = r.sections.some((s) => s.columns.length > 8);
  const figures = r.figures
    .map(
      (f) =>
        `<div class="fig"><b>${esc(f.label)}</b><span class="${isNegative(f.kind, f.value) ? 'neg' : ''}">${esc(cellText(f.kind, f.value, true))}</span>${f.note ? `<small>${esc(f.note)}</small>` : ''}</div>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(`${r.title} · ${r.period}`)}</title>${PRINT_FONT_LINKS}
<style>
  @page { size: A4 ${wide ? 'landscape' : 'portrait'}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 10.5px; margin: 0; padding: 20px; background: #fff; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 8px; margin-bottom: 12px; }
  .brand { font-size: 15px; color: ${BRAND.colors.ink}; }
  .org { color: ${BRAND.colors.muted}; }
  h1 { font-size: 18px; margin: 0; color: ${BRAND.colors.ink}; }
  .period { text-align: right; color: ${BRAND.colors.muted}; }
  .period b { display: block; color: ${BRAND.colors.ink}; font-size: 12px; }
  h2 { font-size: 11px; text-transform: uppercase; color: ${BRAND.colors.ink}; margin: 16px 0 4px; page-break-after: avoid; }
  .note { margin: 0 0 6px; color: ${BRAND.colors.muted}; }
  .figs { display: flex; flex-wrap: wrap; border-top: 1px solid ${BRAND.colors.border}; border-bottom: 1px solid ${BRAND.colors.border}; margin-bottom: 6px; }
  .fig { flex: 1 1 120px; padding: 6px 10px; border-left: 1px solid ${BRAND.colors.border}; }
  .fig:first-child { border-left: 0; padding-left: 0; }
  .fig b { display: block; font-weight: 400; color: ${BRAND.colors.muted}; font-size: 9.5px; }
  .fig span { display: block; font-size: 14px; font-weight: 700; color: ${BRAND.colors.ink}; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .fig small { display: block; color: ${BRAND.colors.muted}; font-size: 9px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border-bottom: 1px solid ${BRAND.colors.hairline}; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: ${BRAND.colors.canvas}; font-size: 9.5px; font-weight: 600; color: ${BRAND.colors.ink}; border-bottom: 1px solid ${BRAND.colors.border}; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; border-top: 1px solid ${BRAND.colors.ink}; border-bottom: 0; }
  .neg { color: ${BRAND.colors.danger}; }
  .fig span.neg { color: ${BRAND.colors.danger}; }
  .muted { color: ${BRAND.colors.muted}; }
  .commentary { font-size: 12px; line-height: 1.5; margin: 0 0 10px; color: ${BRAND.colors.ink}; }
  .notes { margin-top: 14px; color: ${BRAND.colors.muted}; }
  .notes p { margin: 0 0 3px; }
  @media screen { body { max-width: ${wide ? 1180 : 860}px; margin: 0 auto; } }
  ${PRINT_BRAND_CSS}
</style></head><body>
  <div class="head">
    <div><div class="brand">${esc(organizationName)}</div><h1>${esc(r.title)}</h1>${r.projectName ? `<div class="org">${esc(r.projectName)}</div>` : '<div class="org">Every contract project</div>'}</div>
    <div class="period"><b>${esc(r.period)}</b>Made ${esc(formatDateTime(r.generatedAt))}</div>
  </div>
  ${r.commentary ? `<p class="commentary">${esc(r.commentary)}</p>` : ''}
  ${figures ? `<div class="figs">${figures}</div>` : ''}
  ${r.sections.map(sectionHtml).join('')}
  ${r.notes.length ? `<div class="notes">${r.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
  ${brandFooter(esc(`${r.title}, ${r.period}`))}
  ${autoPrint ? AUTO_PRINT_SCRIPT : ''}
</body></html>`;
}

/** Open the report in a new window and print it; false when the browser blocked the pop-up. */
export function openManagementReportPrint(r: ManagementReportDto, organizationName: string) {
  const w = window.open('', '_blank', 'width=1100,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildManagementReportHtml(r, organizationName, true));
  w.document.close();
  return true;
}

type Row = Record<string, string | number | null>;

/** The report as a workbook: a summary sheet (period, commentary, figures, notes) and a sheet per section with its total. */
export async function exportManagementReport(r: ManagementReportDto) {
  const summaryRows: Row[] = [
    { a: 'Report', b: r.title },
    { a: 'Period', b: r.period },
    { a: 'Projects', b: r.projectName ?? 'Every contract project' },
    { a: 'Made', b: formatDateTime(r.generatedAt) },
    ...(r.commentary ? [{ a: '', b: '' }, { a: r.commentary, b: '' }] : []),
    { a: '', b: '' },
    ...r.figures.map((f) => ({
      a: f.label,
      b: cellExcel(f.kind, f.value),
      c: f.note ?? '',
    })),
    { a: '', b: '' },
    ...r.notes.map((n) => ({ a: n, b: '' })),
  ];
  const summaryCols: ExportColumn<Row>[] = [
    { header: r.title, value: (x) => x.a, width: 48 },
    { header: '', value: (x) => x.b, width: 22 },
    { header: '', value: (x) => x.c, width: 30 },
  ];
  const used = new Set<string>(['Summary']);
  const sheetName = (title: string) => {
    let name = title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28);
    for (let i = 2; used.has(name); i++) name = `${title.slice(0, 25)} ${i}`;
    used.add(name);
    return name;
  };
  const sheets = [
    workbookSheet('Summary', summaryCols, summaryRows),
    ...r.sections.map((s) => {
      const cols: ExportColumn<Row>[] = s.columns.map((c, i) => ({
        header: c.kind === 'money' ? `${c.label} (₹)` : c.label,
        value: (x) => (i === 0 && typeof x[c.key] === 'string' ? (x[c.key] as string) : cellExcel(c.kind, x[c.key])),
        width: c.kind === 'text' ? (i === 0 ? 40 : 24) : 16,
      }));
      return workbookSheet(sheetName(s.title), cols, [...(s.rows as Row[]), ...(s.total ? [s.total as Row] : [])]);
    }),
  ];
  await downloadWorkbook(exportFileName(r.key === 'mis' ? 'monthly-mis' : r.key), sheets);
}

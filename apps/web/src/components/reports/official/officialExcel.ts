import { officialFileName, type OfficialReportDto, type ReportColumnDto } from '@erp/shared';
import { downloadWorkbook, workbookSheet, type ExportColumn } from '@/lib/exportExcel';
import { cellExcel, cellText } from '@/components/management/report-format';
import { controlFacts, factText, footNote } from './official-format';

/**
 * An official progress report as a workbook (item 170): a Report sheet with the control strip, the facts, the figures and
 * the text, and a sheet for each table with numbers kept as numbers, so the client's engineer can add them up.
 */

type Row = Record<string, string | number | null>;

export async function downloadOfficialReportExcel(r: OfficialReportDto) {
  const summary: Row[] = [
    { a: r.title, b: r.period },
    { a: 'Project', b: `${r.project.code} ${r.project.name}` },
    ...controlFacts(r).map((f) => ({ a: f.label, b: factText(f) })),
    ...r.header.map((f) => ({ a: f.label, b: factText(f) })),
    { a: '', b: '' },
  ];
  const tables: { name: string; columns: ReportColumnDto[]; rows: Row[] }[] = [];
  const used = new Set<string>(['Report']);
  const sheetName = (title: string) => {
    const base = title.replace(/[\\/?*[\]:]/g, ' ').replace(/^\d+\.\s*/, '');
    let name = base.slice(0, 28);
    for (let i = 2; used.has(name); i++) name = `${base.slice(0, 25)} ${i}`;
    used.add(name);
    return name;
  };
  for (const c of r.chapters) {
    summary.push({ a: c.title.toUpperCase(), b: '' });
    for (const b of c.blocks) {
      if (b.type === 'facts') summary.push(...b.facts.map((f) => ({ a: f.label, b: f.kind && f.kind !== 'text' && f.kind !== 'date' ? cellExcel(f.kind, f.value) : factText(f) })));
      if (b.type === 'figures') summary.push(...b.figures.map((f) => ({ a: f.label, b: cellExcel(f.kind, f.value), c: f.note ?? '' })));
      if (b.type === 'text') summary.push(...(b.title ? [{ a: b.title, b: '' }] : []), ...b.paragraphs.map((p) => ({ a: p, b: '' })));
      if (b.type === 'photos') summary.push(...b.photos.map((p) => ({ a: 'Photograph', b: p.caption })));
      if (b.type === 'table' && !b.rows.length) summary.push({ a: b.title ?? c.title.replace(/^\d+\.\s*/, ''), b: b.empty });
      if (b.type === 'table' && b.rows.length) {
        const name = sheetName(b.title ? `${c.title.match(/^\d+/)?.[0] ?? ''} ${b.title}` : c.title);
        summary.push({ a: b.title ?? c.title.replace(/^\d+\.\s*/, ''), b: `${b.rows.length} row${b.rows.length === 1 ? '' : 's'}, sheet “${name}”` });
        tables.push({ name, columns: b.columns, rows: [...(b.rows as Row[]), ...(b.total ? [b.total as Row] : [])] });
      }
    }
    summary.push({ a: '', b: '' });
  }
  summary.push({ a: footNote(r), b: '' });
  const summaryCols: ExportColumn<Row>[] = [
    { header: r.organizationName, value: (x) => x.a, width: 50 },
    { header: '', value: (x) => x.b, width: 40 },
    { header: '', value: (x) => x.c, width: 30 },
  ];
  await downloadWorkbook(officialFileName(r, 'xlsx'), [
    workbookSheet('Report', summaryCols, summary),
    ...tables.map((t) =>
      workbookSheet(
        t.name,
        t.columns.map((c) => ({
          header: c.kind === 'money' ? `${c.label} (₹)` : c.label,
          value: (x: Row) => (c.kind === 'days' && typeof x[c.key] === 'number' ? (x[c.key] as number) : c.kind === 'text' || c.kind === 'date' ? (x[c.key] === null || x[c.key] === undefined ? null : c.kind === 'date' ? cellText('date', x[c.key]) : String(x[c.key])) : cellExcel(c.kind, x[c.key])),
          width: c.kind === 'text' ? 32 : 14,
        })),
        t.rows,
      ),
    ),
  ]);
}

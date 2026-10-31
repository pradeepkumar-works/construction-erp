import type { OfficialBlockDto, OfficialFactDto, OfficialReportDto } from '@erp/shared';
import { fileUrl } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { AUTO_PRINT_SCRIPT, PRINT_BRAND_CSS, PRINT_FONT_LINKS, brandFooter, markSvg } from '@/components/print/printBrand';
import { cellText, isNegative, isNumeric } from '@/components/management/report-format';
import { controlFacts, factText, footNote, issueLine, WIDE_COLUMNS } from './official-format';

/**
 * An official progress report as an A4 HTML page: the page's preview and Print. The document control strip
 * (organisation, title, document number, revision, date) heads it, the facts box follows, then the numbered chapters
 * and the signature boxes; a monthly report opens on a cover with its contents. PDF, Word and Excel draw the same
 * `OfficialReportDto` in `officialPdf.ts`, `officialDocx.ts` and `officialExcel.ts`.
 */

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const facts = (list: OfficialFactDto[], cls = 'facts') => `<table class="${cls}"><tbody>${pairs(list)}</tbody></table>`;
/** Facts two to a row: label, value, label, value. */
function pairs(list: OfficialFactDto[]) {
  const rows: string[] = [];
  for (let i = 0; i < list.length; i += 2) {
    const cell = (f: OfficialFactDto, span = false) => `<th scope="row">${esc(f.label)}</th><td translate="no"${span ? ' colspan="3"' : ''}>${esc(factText(f))}</td>`;
    rows.push(`<tr>${list[i + 1] ? cell(list[i]) + cell(list[i + 1]) : cell(list[i], true)}</tr>`);
  }
  return rows.join('');
}

function block(b: OfficialBlockDto): string {
  switch (b.type) {
    case 'facts':
      return facts(b.facts);
    case 'text':
      return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}${b.paragraphs.map((p) => `<p class="para">${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')}`;
    case 'figures':
      return `<div class="figs">${b.figures
        .map((f) => `<div class="fig"><b>${esc(f.label)}</b><span translate="no">${esc(cellText(f.kind, f.value))}</span>${f.note ? `<small>${esc(f.note)}</small>` : ''}</div>`)
        .join('')}</div>`;
    case 'photos':
      return b.photos.length
        ? `<div class="photos">${b.photos.map((p) => `<figure><img src="${esc(fileUrl(p.url))}" alt="${esc(p.caption)}"/><figcaption>${esc(p.caption)}</figcaption></figure>`).join('')}</div>`
        : `<p class="muted">${esc(b.empty ?? 'No photographs.')}</p>`;
    case 'table': {
      const cls = (kind: Parameters<typeof isNumeric>[0], v?: unknown) => [isNumeric(kind) ? 'num' : '', isNegative(kind, v as never) ? 'neg' : ''].filter(Boolean).join(' ');
      const head = b.columns.map((c) => `<th class="${cls(c.kind)}">${esc(c.label)}</th>`).join('');
      const body = b.rows.length
        ? b.rows.map((r) => `<tr>${b.columns.map((c) => `<td class="${cls(c.kind, r[c.key])}">${esc(cellText(c.kind, r[c.key]))}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${b.columns.length}" class="muted">${esc(b.empty)}</td></tr>`;
      const total = b.total ? `<tr class="total">${b.columns.map((c) => `<td class="${cls(c.kind)}">${b.total![c.key] === undefined || b.total![c.key] === null ? '' : esc(cellText(c.kind, b.total![c.key]))}</td>`).join('')}</tr>` : '';
      return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}${total}</tbody></table>`;
    }
  }
}

function cover(r: OfficialReportDto) {
  const contents = r.chapters.map((c) => `<li>${esc(c.title.replace(/^\d+\.\s*/, ''))}</li>`).join('');
  return `<section class="cover">
    <div class="cover-brand">${markSvg(28)}<span>${esc(r.organizationName)}</span></div>
    <div class="cover-title"><small>${esc(r.title)}</small><h1>${esc(r.period)}</h1><div class="cover-project">${esc(r.project.name)}</div></div>
    ${facts([
      { label: 'Report no.', value: r.reportNo === null ? null : String(r.reportNo) },
      { label: 'Doc no.', value: r.docNo },
      ...r.header.filter((f) => ['Client', 'Consultant', 'Contractor', 'LOA / work order no.', 'Agreement no.'].includes(f.label)),
      { label: 'Date of submission', value: r.issue ? r.issue.issuedAt.slice(0, 10) : null, kind: 'date' },
      { label: 'Status', value: issueLine(r) },
      ...r.signatures.slice(0, 2).map((s) => ({ label: s.role.replace(/ \(.*\)$/, ''), value: s.name })),
    ])}
    <h2 class="contents-title">Contents</h2><ol class="contents">${contents}</ol>
  </section>`;
}

/** On a phone a chapter whose tables are wider than the screen scrolls sideways, so it becomes a Tab stop to scroll it from the keyboard. */
const SCROLL_STOPS_SCRIPT = `<script>(function(){function f(){document.querySelectorAll('section').forEach(function(s){if(s.scrollWidth>s.clientWidth+1)s.tabIndex=0;else s.removeAttribute('tabindex');});}f();addEventListener('load',f);addEventListener('resize',f);})();</script>`;

export function buildOfficialReportHtml(r: OfficialReportDto, autoPrint = false): string {
  const wide = r.chapters.some((c) => c.blocks.some((b) => b.type === 'table' && b.columns.length > WIDE_COLUMNS));
  const control = controlFacts(r);
  const monthly = r.kind === 'MONTHLY';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(`${r.title} · ${r.project.code} · ${r.period}`)}</title>${PRINT_FONT_LINKS}
<style>
  @page { size: A4 ${wide ? 'landscape' : 'portrait'}; margin: 12mm 12mm 16mm;
    @bottom-left { content: "${esc(r.docNo)}"; font: 8.5px -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: ${BRAND.colors.muted}; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8.5px -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: ${BRAND.colors.muted}; } }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 10.5px; line-height: 1.4; margin: 0; padding: 20px; background: #fff; }
  .head { display: grid; grid-template-columns: 1fr 1.4fr 1fr; gap: 12px; align-items: end; padding-bottom: 8px; margin-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${BRAND.colors.ink}; }
  h1 { font-size: 17px; margin: 0; color: ${BRAND.colors.ink}; text-align: center; }
  .sub { text-align: center; color: ${BRAND.colors.muted}; }
  .control { border-collapse: collapse; justify-self: end; font-size: 9.5px; }
  .control th { text-align: left; font-weight: 400; color: ${BRAND.colors.muted}; padding: 1px 8px 1px 0; }
  .control td { font-weight: 600; color: ${BRAND.colors.ink}; white-space: nowrap; }
  table.facts { width: 100%; border-collapse: collapse; margin: 0 0 8px; }
  table.facts th, table.facts td { border: 1px solid ${BRAND.colors.border}; padding: 4px 6px; text-align: left; vertical-align: top; }
  table.facts th { width: 17%; background: ${BRAND.colors.canvas}; font-weight: 600; color: ${BRAND.colors.ink}; font-size: 9.5px; }
  table.facts td { width: 33%; }
  h2 { font-size: 11.5px; text-transform: uppercase; color: ${BRAND.colors.ink}; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid ${BRAND.colors.border}; page-break-after: avoid; }
  h3 { font-size: 10.5px; color: ${BRAND.colors.ink}; margin: 10px 0 3px; page-break-after: avoid; }
  .note { margin: 0 0 4px; color: ${BRAND.colors.muted}; }
  .para { margin: 0 0 6px; font-size: 11px; }
  .figs { display: flex; flex-wrap: wrap; border-top: 1px solid ${BRAND.colors.border}; border-bottom: 1px solid ${BRAND.colors.border}; margin: 0 0 8px; }
  .fig { flex: 1 1 120px; padding: 6px 10px; border-left: 1px solid ${BRAND.colors.border}; }
  .fig:first-child { border-left: 0; padding-left: 0; }
  .fig b { display: block; font-weight: 400; color: ${BRAND.colors.muted}; font-size: 9.5px; }
  .fig span { display: block; font-size: 16px; font-weight: 700; color: ${BRAND.colors.ink}; font-variant-numeric: tabular-nums; }
  .fig small { display: block; color: ${BRAND.colors.muted}; font-size: 9px; }
  table.grid { width: 100%; border-collapse: collapse; margin-bottom: 6px; page-break-inside: auto; }
  table.grid thead { display: table-header-group; }
  table.grid tr { page-break-inside: avoid; }
  table.grid th, table.grid td { border: 1px solid ${BRAND.colors.border}; padding: 3px 5px; text-align: left; vertical-align: top; }
  table.grid th { background: ${BRAND.colors.canvas}; font-size: 9.5px; font-weight: 600; color: ${BRAND.colors.ink}; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; border-top: 1.5px solid ${BRAND.colors.ink}; }
  .neg { color: ${BRAND.colors.danger}; }
  .muted { color: ${BRAND.colors.muted}; }
  .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  figure { margin: 0; page-break-inside: avoid; border: 1px solid ${BRAND.colors.border}; }
  figure img { display: block; width: 100%; height: 210px; object-fit: cover; }
  figcaption { font-size: 9.5px; padding: 4px 6px; background: ${BRAND.colors.canvas}; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 40px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid #333; padding-top: 4px; font-size: 9.5px; color: ${BRAND.colors.muted}; }
  .sign b { display: block; color: ${BRAND.colors.ink}; font-size: 10.5px; }
  .cover { page-break-after: always; min-height: 250mm; display: flex; flex-direction: column; gap: 18px; }
  .cover-brand { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 800; color: ${BRAND.colors.ink}; padding-bottom: 10px; border-bottom: 2px solid ${BRAND.colors.ink}; box-shadow: 0 3px 0 ${BRAND.colors.accent}; }
  .cover-title { margin: 36px 0 12px; }
  .cover-title small { font-size: 13px; color: ${BRAND.colors.accentDeep}; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
  .cover-title h1 { font-size: 34px; text-align: left; margin: 4px 0 6px; }
  .cover-project { font-size: 15px; color: ${BRAND.colors.ink}; max-width: 70%; }
  .contents-title { margin-top: 12px; }
  ol.contents { columns: 2; margin: 0; padding-left: 18px; font-size: 11px; }
  ol.contents li { margin-bottom: 3px; }
  @media screen { body { max-width: ${wide ? 1180 : 900}px; margin: 0 auto; } }
  @media print { body { padding: 0; } }
  @media screen and (max-width: 640px) {
    body { padding: 10px; }
    .head { grid-template-columns: 1fr; gap: 6px; }
    h1, .sub { text-align: left; }
    .control { justify-self: start; }
    table.facts th, table.facts td { display: block; width: auto; border-top: 0; }
    table.facts tr:first-child th:first-child { border-top: 1px solid ${BRAND.colors.border}; }
    .photos { grid-template-columns: 1fr; }
    ol.contents { columns: 1; }
    .cover-title h1 { font-size: 26px; }
    .sign { grid-template-columns: 1fr; gap: 28px; }
    section { overflow-x: auto; }
  }
  ${PRINT_BRAND_CSS}
  .brand, .cover-brand span { font-family: "Archivo", "Arial Narrow", Arial, sans-serif; font-stretch: 87.5%; }
</style></head><body>
  ${monthly ? cover(r) : ''}
  <div class="head">
    <div class="brand">${markSvg(20)}<span>${esc(r.organizationName)}</span></div>
    <div><h1>${esc(r.title)}</h1><div class="sub">${esc(r.period)}</div></div>
    <table class="control"><tbody>${control.map((f) => `<tr><th>${esc(f.label)}</th><td translate="no">${esc(factText(f))}</td></tr>`).join('')}</tbody></table>
  </div>
  ${facts(r.header)}
  ${r.chapters.map((c, i) => `<section aria-labelledby="ch${i}"><h2 id="ch${i}">${esc(c.title)}</h2>${c.blocks.map(block).join('')}</section>`).join('')}
  <div class="sign">${r.signatures.map((s) => `<div><b>${esc(s.name ?? '')}&nbsp;</b>${esc(s.role)}</div>`).join('')}</div>
  ${brandFooter(esc(footNote(r)))}
  ${autoPrint ? AUTO_PRINT_SCRIPT : ''}
  ${SCROLL_STOPS_SCRIPT}
</body></html>`;
}

/** Open the report in a new window and print it; false when the browser blocked the pop-up. */
export function openOfficialReportPrint(r: OfficialReportDto) {
  const w = window.open('', '_blank', 'width=1100,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildOfficialReportHtml(r, true));
  w.document.close();
  return true;
}

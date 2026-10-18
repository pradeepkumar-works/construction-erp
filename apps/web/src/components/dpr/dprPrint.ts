import type { DailyReportDto } from '@erp/shared';
import { WEATHER_LABELS } from '@erp/shared';
import { fileUrl } from '@/lib/api';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const para = (v: string | null | undefined) => (v ? esc(v).replace(/\n/g, '<br/>') : '<span class="muted">-</span>');

export function buildDprPrintHtml(d: DailyReportDto, orgName: string): string {
  const manpowerRows = d.manpower.map((m) => `<tr><td>${esc(m.category)}</td><td class="num">${esc(m.count)}</td></tr>`).join('');
  const machineryRows = d.machinery.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${esc(m.hours)}</td></tr>`).join('');
  const photos = d.attachments
    .filter((a) => a.mimeType?.startsWith('image/'))
    .map((a) => `<figure><img src="${esc(fileUrl(a.url))}" alt="${esc(a.fileName)}"/><figcaption>${esc(a.fileName)}</figcaption></figure>`)
    .join('');
  const status = d.status.replace(/_/g, ' ');

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>DPR ${esc(formatDate(d.date))} - ${esc(d.projectName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 12px; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${BRAND.colors.ink}; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 18px; font-weight: 700; color: ${BRAND.colors.ink}; }
  .org { color: #555; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .status { display: inline-block; padding: 2px 8px; border: 1px solid #999; border-radius: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 16px; margin-bottom: 14px; }
  .meta div b { display: block; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: ${BRAND.colors.ink}; border-bottom: 1px solid #ddd; margin: 14px 0 6px; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f4f8; font-size: 11px; }
  td.num, th.num { text-align: right; width: 90px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .muted { color: #666; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  figure { margin: 0; }
  figure img { width: 100%; height: 150px; object-fit: cover; border: 1px solid #ccc; }
  figcaption { font-size: 10px; color: #666; margin-top: 2px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 32px; }
  .sign div { border-top: 1px solid #333; padding-top: 4px; font-size: 11px; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(orgName)}</div><div class="org">${esc(d.projectName)}</div></div>
    <div style="text-align:right"><h1>Daily Progress Report</h1><div>${esc(formatDate(d.date))}</div><div style="margin-top:4px" class="status">${esc(status)}</div></div>
  </div>
  <div class="meta">
    <div style="grid-column: span 2"><b>Project</b>${esc(d.projectName)}</div>
    <div><b>Weather</b>${d.weather ? esc(WEATHER_LABELS[d.weather]) : '-'}</div>
    <div><b>Site condition</b>${esc(d.siteCondition ?? '-')}</div>
    <div><b>Submitted by</b>${esc(d.submittedByName)}</div>
    <div><b>Submitted at</b>${esc(formatDateTime(d.submittedAt))}</div>
    <div><b>Reviewed by</b>${esc(d.reviewedByName ?? '-')}</div>
    <div><b>Total manpower</b>${esc(d.totalManpower)}</div>
  </div>

  <h2>Work executed</h2>
  <p>${para(d.workExecuted)}</p>

  <div class="cols">
    <div>
      <h2>Manpower</h2>
      <table><thead><tr><th>Category</th><th class="num">Count</th></tr></thead>
      <tbody>${manpowerRows || '<tr><td colspan="2" class="muted">None recorded</td></tr>'}<tr><th>Total</th><th class="num">${esc(d.totalManpower)}</th></tr></tbody></table>
    </div>
    <div>
      <h2>Machinery</h2>
      <table><thead><tr><th>Equipment</th><th class="num">Hours</th></tr></thead>
      <tbody>${machineryRows || '<tr><td colspan="2" class="muted">None recorded</td></tr>'}</tbody></table>
    </div>
  </div>

  <h2>Material received</h2><p>${para(d.materialReceived)}</p>
  <h2>Tests conducted</h2><p>${para(d.testsConducted)}</p>
  <h2>Safety observations</h2><p>${para(d.safetyObservations)}</p>
  <h2>Issues / hindrances</h2><p>${para(d.issues)}</p>
  <h2>Next day plan</h2><p>${para(d.nextDayPlan)}</p>
  ${d.reviewNote ? `<h2>Review note</h2><p>${para(d.reviewNote)}</p>` : ''}
  ${photos ? `<h2>Site photos</h2><div class="photos">${photos}</div>` : ''}

  <div class="sign"><div>Prepared by: ${esc(d.submittedByName)}</div><div>Reviewed by: ${esc(d.reviewedByName ?? '')}</div></div>
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · Report ID ${esc(d.id)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

export function openDprPrint(d: DailyReportDto, orgName: string) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildDprPrintHtml(d, orgName));
  w.document.close();
  return true;
}

import type { DailyReportDto, DprBuiltInKey, DprFormDef, DprLineDto } from '@erp/shared';
import { PIPE_STAGE_LABELS, SEGMENT_STAGES, SUBMISSION_STATUS_LABELS, STANDARD_DPR_FORM, WEATHER_LABELS, crewCheck, dprActivityLabel, dprLabel, dprShows, filledExtra, lineLocation, materialUsed, linesSummary, ownFieldsOf, pipelineSummary, unitLabel } from '@erp/shared';
import { fileUrl } from '@/lib/api';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime, formatPct, formatQty } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const para = (v: string | null | undefined) => (v ? esc(v).replace(/\n/g, '<br/>') : '<span class="muted">-</span>');

/**
 * The work lines in the site's DPR layout: S.No, component, sub-component, activity, unit, scope, up to
 * previous, today, cumulative, %, balance and remark.
 */
function workTable(lines: DprLineDto[], def: DprFormDef): string {
  const own = ownFieldsOf(def, 'LINE');
  const rows = lines
    .map((l, i) => {
      const where = [lineLocation(l), l.workOrderNo].filter(Boolean).join(' · ');
      // The line's own fields go with its remark.
      const extra = filledExtra(own, l.extra).map((x) => `${x.field.label}: ${x.text}`).join(', ');
      const remark = [where, l.remarks, extra].filter(Boolean).join('. ');
      return `<tr><td class="num">${i + 1}</td><td>${esc(l.componentName ?? '-')}</td><td>${esc(l.subComponentName ?? '-')}</td><td>${esc(dprActivityLabel({ name: l.activityName, parentActivityName: l.parentActivityName }))}</td><td>${esc(l.unit)}</td><td class="num">${esc(formatQty(l.scope))}</td><td class="num">${esc(formatQty(l.previous))}</td><td class="num"><b>${esc(formatQty(l.quantity))}</b></td><td class="num">${esc(formatQty(l.cumulative))}</td><td class="num">${l.pct === null ? '-' : esc(formatPct(l.pct))}</td><td class="num">${esc(formatQty(l.balance))}</td><td>${esc(remark)}</td></tr>`;
    })
    .join('');
  const crew = lines
    .filter((l) => l.labour.length || l.machines.length || l.materials.length)
    .map((l) => {
      const parts = [l.labour.map((m) => `${m.category} ${m.count}`).join(', '), l.machines.map((m) => `${m.name} ${m.hours} h`).join(', '), l.materials.map((m) => `${m.itemName} ${formatQty(m.quantity)} ${unitLabel(m.unit)}`).join(', ')];
      return `<tr><td class="num">${lines.indexOf(l) + 1}</td><td>${esc(parts[0] || '-')}</td><td>${esc(parts[1] || '-')}</td><td>${esc(parts[2] || '-')}</td></tr>`;
    })
    .join('');
  const used = materialUsed(lines).map((m) => `<tr><td>${esc(m.itemName)}</td><td class="num">${esc(formatQty(m.quantity))} ${esc(m.unit)}</td></tr>`).join('');
  return `${pipeTable(lines)}<h2>Work done</h2>
  <table class="lines"><thead><tr><th class="num">S.No</th><th>Component</th><th>Sub-component</th><th>Activity</th><th>Unit</th><th class="num">Planned</th><th class="num">Up to previous</th><th class="num">Today</th><th class="num">Cumulative</th><th class="num">%</th><th class="num">Balance</th><th>Remark</th></tr></thead><tbody>${rows}</tbody></table>
  ${crew ? `<h2>Crew, machines and material by line</h2><table class="lines"><thead><tr><th class="num">S.No</th><th>Crew</th><th>Machines</th><th>Material used</th></tr></thead><tbody>${crew}</tbody></table>` : ''}
  ${used ? `<h2>Material used</h2><table><thead><tr><th>Item</th><th class="num">Used</th></tr></thead><tbody>${used}</tbody></table>` : ''}`;
}

/** Today's pipe work: metres per stage by zone and diameter, and valves fixed. */
function pipeTable(lines: DprLineDto[]): string {
  const rows = pipelineSummary(lines);
  if (!rows.length) return '';
  const stages = SEGMENT_STAGES.filter((s) => rows.some((r) => r.metres[s]));
  const valves = rows.some((r) => r.valves);
  const head = `<th>Zone</th><th>Diameter</th>${stages.map((s) => `<th class="num">${esc(PIPE_STAGE_LABELS[s])}, m</th>`).join('')}${valves ? '<th class="num">Valves fixed</th>' : ''}`;
  const body = rows
    .map((r) => `<tr><td>${esc(r.zone || '-')}</td><td>${r.diameterMm ? `${r.diameterMm} mm` : 'Valves'}</td>${stages.map((s) => `<td class="num">${r.metres[s] ? esc(formatQty(r.metres[s])) : '-'}</td>`).join('')}${valves ? `<td class="num">${r.valves ? esc(formatQty(r.valves)) : '-'}</td>` : ''}</tr>`)
    .join('');
  return `<h2>Pipeline today</h2><table class="lines"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function buildDprPrintHtml(d: DailyReportDto, orgName: string): string {
  const lines = d.lines ?? [];
  const def = d.form?.def ?? STANDARD_DPR_FORM;
  // A field the form hides prints only when the report has something in it.
  const note = (key: DprBuiltInKey, v: string | null) => (dprShows(def, key) || v ? `<h2>${esc(dprLabel(def, key))}</h2><p>${para(v)}</p>` : '');
  const crew = lines.length ? crewCheck(lines, d.manpower) : null;
  const manpowerRows = d.manpower.map((m) => `<tr><td>${esc(m.category)}</td><td class="num">${esc(m.count)}</td></tr>`).join('');
  const machineryRows = d.machinery.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${esc(m.hours)}</td></tr>`).join('');
  const photos = [...d.attachments, ...lines.flatMap((l) => l.attachments)]
    .filter((a) => a.mimeType?.startsWith('image/'))
    .map((a) => `<figure><img src="${esc(fileUrl(a.url))}" alt="${esc(a.fileName)}"/><figcaption>${esc(a.fileName)}</figcaption></figure>`)
    .join('');
  const status = SUBMISSION_STATUS_LABELS[d.status];

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>DPR ${esc(formatDate(d.date))} - ${esc(d.projectName)}</title>
<style>
  @page { size: A4${lines.length ? ' landscape' : ''}; margin: ${lines.length ? '12mm' : '16mm'}; }
  table.lines { font-size: 10px; }
  table.lines td.num, table.lines th.num { width: auto; white-space: nowrap; }
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
  .muted { color: ${BRAND.colors.muted}; }
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
    <div style="text-align:right"><h1>Daily report</h1><div>${esc(formatDate(d.date))}</div><div style="margin-top:4px" class="status">${esc(status)}</div></div>
  </div>
  <div class="meta">
    <div style="grid-column: span 2"><b>Project</b>${esc(d.projectName)}</div>
    <div><b>Weather</b>${d.weather ? esc(WEATHER_LABELS[d.weather]) : '-'}</div>
    <div><b>Site condition</b>${esc(d.siteCondition ?? '-')}</div>
    <div><b>Submitted by</b>${esc(d.submittedByName)}</div>
    <div><b>Submitted at</b>${esc(formatDateTime(d.submittedAt))}</div>
    <div><b>Reviewed by</b>${esc(d.reviewedByName ?? '-')}</div>
    <div><b>Total labour</b>${esc(d.totalManpower)}${crew ? ` (${esc(crew.onLines)} on the work lines)` : ''}</div>
    ${filledExtra(ownFieldsOf(def, 'DAY'), d.extra)
      .map((x) => `<div><b>${esc(x.field.label)}</b>${esc(x.text)}</div>`)
      .join('')}
  </div>

  ${lines.length ? workTable(lines, def) : `<h2>Work done</h2>
  <p>${para(d.workExecuted)}</p>`}
  ${lines.length && d.workExecuted && d.workExecuted !== linesSummary(lines) ? `<h2>Work done</h2><p>${para(d.workExecuted)}</p>` : ''}

  <div class="cols">
    <div>
      <h2>Labour</h2>
      <table><thead><tr><th>Trade</th><th class="num">Workers</th></tr></thead>
      <tbody>${manpowerRows || '<tr><td colspan="2" class="muted">None recorded</td></tr>'}<tr><th>Total</th><th class="num">${esc(d.totalManpower)}</th></tr></tbody></table>
    </div>
    <div>
      <h2>Machinery</h2>
      <table><thead><tr><th>Machine</th><th class="num">Hours</th></tr></thead>
      <tbody>${machineryRows || '<tr><td colspan="2" class="muted">None recorded</td></tr>'}</tbody></table>
    </div>
  </div>

  ${note('materialReceived', d.materialReceived)}
  ${note('testsConducted', d.testsConducted)}
  ${note('safetyObservations', d.safetyObservations)}
  ${note('issues', d.issues)}
  ${note('nextDayPlan', d.nextDayPlan)}
  ${d.reviewNote ? `<h2>Review note</h2><p>${para(d.reviewNote)}</p>` : ''}
  ${photos ? `<h2>Site photos</h2><div class="photos">${photos}</div>` : ''}

  <div class="sign"><div>Prepared by: ${esc(d.submittedByName)}</div><div>Reviewed by: ${esc(d.reviewedByName ?? '')}</div></div>
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · DPR ${esc(formatDate(d.date))}, ${esc(d.projectName)}`)}
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

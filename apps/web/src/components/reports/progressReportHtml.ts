import type { ProgressReportDto } from '@erp/shared';
import { DELAY_PARTY_LABELS, PROJECT_TYPE_LABELS } from '@erp/shared';
import { fileUrl } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime, formatINR, formatQty } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const n = (v: string) => esc(formatQty(v));
const inr = (v: string | null) => (v === null ? '-' : esc(formatINR(v)));
const none = (cols: number, text = 'Nothing recorded in this period') => `<tr><td colspan="${cols}" class="muted">${text}</td></tr>`;

export type ReportKind = 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
export const REPORT_TITLES: Record<ReportKind, string> = { WEEKLY: 'Weekly Progress Report', MONTHLY: 'Monthly Progress Report', CUSTOM: 'Progress Report' };

/** A4 progress report as a standalone HTML document; `autoPrint` opens the print dialog once images load. */
export function buildProgressReportHtml(r: ProgressReportDto, kind: ReportKind, autoPrint: boolean): string {
  const p = r.project;
  const title = REPORT_TITLES[kind];
  const period = `${formatDate(r.from)} to ${formatDate(r.to)}`;
  const gain = Math.round((r.physical.atEndPct - r.physical.atStartPct) * 10) / 10;
  const activities = r.activities
    .map(
      (a, i) => `<tr${a.delayed ? ' class="late"' : ''}><td class="c">${i + 1}</td><td>${esc(a.name)}${a.delayed ? ' <span class="tag">Delayed</span>' : ''}</td><td class="c">${esc(a.unit)}</td><td class="num">${n(a.plannedQty)}</td><td class="num">${n(a.periodQty)}</td><td class="num">${n(a.cumulativeQty)}</td><td class="num">${esc(a.pct)}%</td><td class="c">${esc(formatDate(a.plannedEnd))}</td></tr>`,
    )
    .join('');
  const boq = r.boq
    .map(
      (b) => `<tr><td class="c">${esc(b.itemNo)}</td><td>${esc(b.description)}</td><td class="c">${esc(b.unit)}</td><td class="num">${inr(b.rate)}</td><td class="num">${n(b.periodQty)}</td><td class="num">${inr(b.periodValue)}</td><td class="num">${n(b.cumulativeQty)}</td><td class="num">${n(b.measuredPeriodQty)}</td></tr>`,
    )
    .join('');
  const manpower = r.manpower.map((m) => `<tr><td>${esc(m.category)}</td><td class="num">${esc(m.manDays)}</td><td class="num">${esc(m.avgPerDay)}</td></tr>`).join('');
  const machinery = r.machinery
    .map((m) => `<tr><td>${esc(m.code)} ${esc(m.name)}</td><td class="num">${esc(m.days)}</td><td class="num">${n(m.hours)}</td><td class="num">${n(m.idleHours)}</td><td class="num">${n(m.breakdownHours)}</td></tr>`)
    .join('');
  const materials = r.materials.map((m) => `<tr><td>${esc(m.name)}</td><td class="c">${esc(m.unit)}</td><td class="num">${n(m.received)}</td><td class="num">${n(m.issued)}</td></tr>`).join('');
  const list = (rows: { date: string; text: string }[]) =>
    rows.length ? `<ul>${rows.map((x) => `<li><b>${esc(formatDate(x.date))}:</b> ${esc(x.text).replace(/\n/g, '<br/>')}</li>`).join('')}</ul>` : '<p class="muted">None reported in approved DPRs.</p>';
  const delays = r.delays
    .map(
      (d) =>
        `<tr><td class="c">${esc(d.riskNo)}</td><td>${esc(d.title)}${d.activityName ? `<br/><span class="muted">${esc(d.activityName)}</span>` : ''}</td><td class="c">${esc(formatDate(d.from))} to ${d.to ? esc(formatDate(d.to)) : 'date'}</td><td class="num">${esc(d.daysInPeriod)}</td><td>${d.responsibleParty ? esc(DELAY_PARTY_LABELS[d.responsibleParty]) : '-'}${d.eotClaimed ? ' (EOT claimed)' : ''}</td></tr>`,
    )
    .join('');
  const risks = r.risks
    .map((x) => `<tr><td class="c">${esc(x.riskNo)}</td><td>${esc(x.title)}</td><td class="num">${esc(x.score)}</td><td>${esc(x.mitigation ?? '-')}</td><td>${esc(x.ownerName ?? '-')}</td><td class="c">${esc(formatDate(x.dueDate))}</td></tr>`)
    .join('');
  const next = r.nextPeriod.map((a) => `<tr><td>${esc(a.name)}</td><td class="num">${n(a.balanceQty)} ${esc(a.unit)}</td><td class="c">${esc(formatDate(a.plannedEnd))}</td></tr>`).join('');
  const photos = r.photos.map((ph) => `<figure><img src="${esc(fileUrl(ph.url))}" alt=""/><figcaption>${esc(ph.caption)}</figcaption></figure>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>${esc(title)} ${esc(p.code)} ${esc(r.from)} to ${esc(r.to)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 24px; background: #fff; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${BRAND.colors.ink}; padding-bottom: 8px; margin-bottom: 12px; }
  .brand { font-size: 16px; font-weight: 700; color: ${BRAND.colors.ink}; }
  .org { color: #555; }
  h1 { font-size: 16px; margin: 0 0 2px; color: ${BRAND.colors.ink}; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: ${BRAND.colors.ink}; border-bottom: 1px solid #ddd; margin: 14px 0 6px; padding-bottom: 3px; page-break-after: avoid; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; margin-bottom: 10px; }
  .meta div b { display: block; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 6px 0 4px; }
  .kpi { border: 1px solid #d6dde8; border-radius: 4px; padding: 6px 8px; }
  .kpi b { display: block; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .kpi span { font-size: 15px; font-weight: 700; color: ${BRAND.colors.ink}; }
  .kpi small { color: #555; display: block; }
  .bar { height: 6px; background: #e8edf3; border-radius: 3px; margin-top: 4px; position: relative; overflow: hidden; }
  .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: ${BRAND.colors.primary}; }
  .bar i.t { background: #f0a020; height: 2px; top: auto; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #f1f4f8; font-size: 10px; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.c, th.c { text-align: center; white-space: nowrap; }
  tr.late td { background: #fff7e6; }
  .tag { font-size: 9px; color: #ad4e00; border: 1px solid #ffa940; border-radius: 8px; padding: 0 5px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .muted { color: #888; }
  ul { margin: 0; padding-left: 16px; } li { margin-bottom: 3px; }
  .photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  figure { margin: 0; page-break-inside: avoid; }
  figure img { width: 100%; height: 110px; object-fit: cover; border: 1px solid #ccc; }
  figcaption { font-size: 9px; color: #666; margin-top: 2px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 36px; }
  .sign div { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  .foot { margin-top: 14px; color: #888; font-size: 9px; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(r.organizationName)}</div><div class="org">${esc(p.name)}</div></div>
    <div style="text-align:right"><h1>${esc(title)}</h1><div>${esc(period)}</div></div>
  </div>
  <div class="meta">
    <div style="grid-column: span 2"><b>Project</b>${esc(p.code)} · ${esc(p.name)}</div>
    <div><b>Type</b>${esc(PROJECT_TYPE_LABELS[p.type])}</div>
    <div><b>Location</b>${esc(p.location ?? '-')}</div>
    <div><b>Client</b>${esc(p.clientName ?? '-')}</div>
    <div><b>Consultant</b>${esc(p.consultantName ?? '-')}</div>
    <div><b>Work order</b>${esc(p.workOrderNo ?? '-')}</div>
    <div><b>Contract value</b>${inr(p.contractValue)}</div>
    <div><b>Start</b>${esc(formatDate(p.startDate))}</div>
    <div><b>Completion</b>${esc(formatDate(p.endDate))}</div>
    <div><b>Project manager</b>${esc(p.projectManagerName ?? '-')}</div>
    <div><b>Approved DPRs</b>${esc(r.dpr.approved)} of ${esc(r.dpr.days)} days${r.dpr.rainyDays ? ` · ${esc(r.dpr.rainyDays)} rainy` : ''}</div>
  </div>

  <h2>1. Summary</h2>
  <div class="kpis">
    <div class="kpi"><b>Physical progress</b><span>${esc(r.physical.atEndPct)}%</span><small>${gain >= 0 ? '+' : ''}${esc(gain)} points this period (from ${esc(r.physical.atStartPct)}%)</small>
      <div class="bar"><i style="width:${Math.min(100, r.physical.atEndPct)}%"></i>${r.timeElapsedPct !== null ? `<i class="t" style="width:${Math.min(100, r.timeElapsedPct)}%"></i>` : ''}</div></div>
    <div class="kpi"><b>Time elapsed</b><span>${r.timeElapsedPct === null ? '-' : `${esc(r.timeElapsedPct)}%`}</span><small>of the contract period</small></div>
    <div class="kpi"><b>Value executed this period</b><span>${inr(r.financial.periodValue)}</span><small>measured ${inr(r.financial.measuredPeriodValue)}</small></div>
    <div class="kpi"><b>Value executed to date</b><span>${inr(r.financial.cumulativeValue)}</span><small>${r.financial.contractPct === null ? '' : `${esc(r.financial.contractPct)}% of contract · `}measured ${inr(r.financial.measuredCumulativeValue)}</small></div>
  </div>

  <h2>2. Activity progress</h2>
  <table><thead><tr><th class="c">#</th><th>Activity</th><th class="c">Unit</th><th class="num">Planned</th><th class="num">This period</th><th class="num">To date</th><th class="num">%</th><th class="c">Planned finish</th></tr></thead>
  <tbody>${activities || none(8, 'No activities')}</tbody></table>

  <h2>3. BOQ items executed</h2>
  <table><thead><tr><th class="c">Item</th><th>Description</th><th class="c">Unit</th><th class="num">Rate</th><th class="num">Qty this period</th><th class="num">Value this period</th><th class="num">Qty to date</th><th class="num">Measured (MB)</th></tr></thead>
  <tbody>${boq || none(8)}</tbody></table>

  <div class="cols">
    <div>
      <h2>4. Manpower</h2>
      <table><thead><tr><th>Trade</th><th class="num">Man-days</th><th class="num">Avg / day</th></tr></thead>
      <tbody>${manpower || none(3)}</tbody></table>
      <div class="muted">${esc(r.attendanceDays)} day(s) with an attendance sheet</div>
    </div>
    <div>
      <h2>5. Machinery</h2>
      <table><thead><tr><th>Machine</th><th class="num">Days</th><th class="num">Worked h</th><th class="num">Idle h</th><th class="num">Breakdown h</th></tr></thead>
      <tbody>${machinery || none(5)}</tbody></table>
    </div>
  </div>

  <h2>6. Material received and issued</h2>
  <table><thead><tr><th>Item</th><th class="c">Unit</th><th class="num">Received</th><th class="num">Issued</th></tr></thead>
  <tbody>${materials || none(4)}</tbody></table>

  <div class="cols">
    <div><h2>7. Issues and hindrances</h2>${list(r.issues)}</div>
    <div><h2>8. Safety</h2>${list(r.safety)}</div>
  </div>

  <h2>9. Delays and risks</h2>
  <table><thead><tr><th class="c">No.</th><th>Delay</th><th class="c">Held up</th><th class="num">Days in period</th><th>Caused by</th></tr></thead>
  <tbody>${delays || none(5, 'No delays recorded')}</tbody></table>
  ${risks ? `<table style="margin-top:6px"><thead><tr><th class="c">No.</th><th>Open risk</th><th class="num">Score</th><th>Mitigation</th><th>Owner</th><th class="c">Due</th></tr></thead><tbody>${risks}</tbody></table>` : ''}

  <h2>10. Plan for the next period</h2>
  <table><thead><tr><th>Activity</th><th class="num">Balance</th><th class="c">Planned finish</th></tr></thead>
  <tbody>${next || none(3, 'No activities planned')}</tbody></table>

  ${photos ? `<h2>11. Site photographs</h2><div class="photos">${photos}</div>` : ''}

  <div class="sign"><div>Prepared by (Site Engineer)</div><div>Checked by (Project Manager)</div><div>Client / Consultant</div></div>
  <div class="foot">From approved progress entries, DPRs, machinery logs and measurements, plus attendance and the store register. Generated ${esc(formatDateTime(r.generatedAt))}.</div>
  ${
    autoPrint
      ? `<script>
    window.addEventListener('load', function () {
      var imgs = Array.prototype.slice.call(document.images);
      Promise.all(imgs.map(function (i) { return i.complete ? Promise.resolve() : new Promise(function (r) { i.onload = r; i.onerror = r; }); }))
        .then(function () { setTimeout(function () { window.print(); }, 150); });
    });
  </script>`
      : ''
  }
</body></html>`;
}

export function openProgressReportPrint(r: ProgressReportDto, kind: ReportKind) {
  const w = window.open('', '_blank', 'width=1000,height=1100');
  if (!w) return false;
  w.document.open();
  w.document.write(buildProgressReportHtml(r, kind, true));
  w.document.close();
  return true;
}

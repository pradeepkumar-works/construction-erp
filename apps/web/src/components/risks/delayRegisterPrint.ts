import { DELAY_PARTY_LABELS, RISK_CATEGORY_LABELS, type DelayRegisterDto } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const STYLE = `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 10.5px; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { font-size: 18px; color: ${BRAND.colors.ink}; }
  .org { color: #555; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f4f8; font-size: 9.5px; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  td.d { white-space: nowrap; }
  .muted { color: ${BRAND.colors.muted}; }
  ul { margin: 0; padding-left: 14px; }
  .late { color: #a33; font-weight: 600; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
`;

/**
 * The delay register as a printable page for an extension-of-time claim (AI item 123): every delay with its dates,
 * days lost, cause and party, the notice given (or how late it is), the letters on it and the DPR entries recorded into it.
 */
export function buildDelayRegisterHtml(r: DelayRegisterDto, orgName: string): string {
  const rows = r.rows
    .map((d, i) => {
      const n = d.notice;
      const notice = n.noticeSent
        ? `${esc(n.noticeSent.letterNo)}, ${esc(formatDate(n.noticeSent.letterDate))}${n.noticeSent.letterDate > n.due ? ' <span class="late">(after the notice period)</span>' : ''}`
        : n.running
          ? `<span class="${n.daysLeft < 0 ? 'late' : ''}">Not sent: due ${esc(formatDate(n.due))}</span>`
          : '<span class="muted">Not needed</span>';
      const letters = d.letters.length ? `<ul>${d.letters.map((l) => `<li>${esc(l.letterNo)} (${l.direction === 'OUT' ? 'sent' : 'received'} ${esc(formatDate(l.letterDate))}): ${esc(l.subject)}</li>`).join('')}</ul>` : '<span class="muted">None</span>';
      const remarks = d.remarks.length ? `<ul>${d.remarks.map((x) => `<li>${esc(formatDate(x.reportDate))}: ${esc(x.remark)}</li>`).join('')}</ul>` : '';
      return `<tr>
        <td class="n">${i + 1}</td>
        <td><b>${esc(d.riskNo)}</b><br/>${esc(d.title)}${d.activityName ? `<div class="muted">${esc(d.activityName)}</div>` : ''}${remarks ? `<div style="margin-top:4px"><b>DPR entries</b>${remarks}</div>` : ''}</td>
        <td>${esc(RISK_CATEGORY_LABELS[d.category])}</td>
        <td>${esc(d.party ? DELAY_PARTY_LABELS[d.party] : '-')}</td>
        <td class="d">${esc(formatDate(d.delayStart))}</td>
        <td class="d">${d.delayEnd ? esc(formatDate(d.delayEnd)) : 'Continuing'}</td>
        <td class="n">${d.daysLost}</td>
        <td>${notice}</td>
        <td>${letters}</td>
        <td>${d.eotGrantedDays !== null ? `${d.eotGrantedDays} days granted` : d.eotClaimed ? 'Claimed' : '-'}</td>
      </tr>`;
    })
    .join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>Delay register - ${esc(r.projectCode)}</title>
<style>${STYLE}</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(orgName)}</div><div class="org">${esc(`${r.projectCode} ${r.projectName}`)}</div>${r.clientName ? `<div class="org">${esc(r.clientName)}${r.agreementNo ? `, agreement ${esc(r.agreementNo)}` : ''}</div>` : ''}</div>
    <div style="text-align:right"><h1>Delay register</h1><div>As of ${esc(formatDate(r.asOf))}</div><div>${r.excusableDays} days lost to delays not attributable to us</div></div>
  </div>
  <table>
    <thead><tr><th class="n">#</th><th>Delay</th><th>Cause</th><th>Caused by</th><th>Held up from</th><th>To</th><th class="n">Days lost</th><th>Notice</th><th>Letters</th><th>Extension</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="10" class="muted">No delays recorded.</td></tr>'}</tbody>
  </table>
  <p class="muted">Notice period: ${r.rows[0] ? esc(`${r.rows[0].notice.noticeDays} days (${r.rows[0].notice.source})`) : '-'}.</p>
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · Delay register ${esc(r.projectCode)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

export function openDelayRegisterPrint(r: DelayRegisterDto, orgName: string): boolean {
  const w = window.open('', '_blank', 'width=1100,height=900');
  if (!w) return false;
  w.document.open();
  w.document.write(buildDelayRegisterHtml(r, orgName));
  w.document.close();
  return true;
}

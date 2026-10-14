import type { TransmittalDto } from '@erp/shared';
import { REVISION_STATUS_LABELS, TRANSMITTAL_PURPOSE_LABELS } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** The transmittal cover sheet: who it goes to, the documents with revision and copies, and the receiver's signature. */
export function buildTransmittalPrintHtml(t: TransmittalDto, orgName: string): string {
  const rows = t.items
    .map((i, n) => `<tr><td class="c">${n + 1}</td><td class="mono">${esc(i.docNo)}</td><td>${esc(i.title)}</td><td class="c">${esc(i.revision)}</td><td>${esc(REVISION_STATUS_LABELS[i.status])}</td><td class="c">${i.copies}</td></tr>`)
    .join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(t.transmittalNo)} - ${esc(t.toParty)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { font-size: 18px; color: ${BRAND.colors.ink}; }
  .org { color: #555; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 11px; text-transform: uppercase; color: ${BRAND.colors.ink}; border-bottom: 1px solid #ddd; margin: 14px 0 6px; padding-bottom: 3px; }
  .meta { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 6px 16px; margin-bottom: 12px; }
  .meta div b { display: block; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f4f8; font-size: 10px; }
  td.c, th.c { text-align: center; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(orgName)}</div><div class="org">${esc(t.projectCode)} ${esc(t.projectName)}</div></div>
    <div style="text-align:right"><h1>Transmittal ${esc(t.transmittalNo)}</h1><div>${esc(formatDate(t.sentOn))}</div></div>
  </div>
  <div class="meta">
    <div><b>To</b>${esc(t.toParty)}${t.attention ? `<br/><span>Attn: ${esc(t.attention)}</span>` : ''}</div>
    <div><b>Purpose</b>${esc(TRANSMITTAL_PURPOSE_LABELS[t.purpose])}</div>
    <div><b>Sent by</b>${esc(t.sentByName)}</div>
  </div>
  <h2>Documents enclosed</h2>
  <table>
    <thead><tr><th class="c">#</th><th>Number</th><th>Title</th><th class="c">Rev</th><th>Status</th><th class="c">Copies</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${t.remarks ? `<h2>Remarks</h2><div>${esc(t.remarks)}</div>` : ''}
  <p>Earlier revisions of these documents are superseded; please return or mark them so they are not used.</p>
  <div class="sign"><div>Sent by<br/>${esc(t.sentByName)}</div><div>Received by (name, signature, date)${t.acknowledgedBy ? `<br/>${esc(t.acknowledgedBy)}, ${esc(formatDate(t.acknowledgedOn))}` : ''}</div></div>
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · ${esc(t.transmittalNo)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

export function openTransmittalPrint(t: TransmittalDto, orgName: string) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildTransmittalPrintHtml(t, orgName));
  w.document.close();
  return true;
}

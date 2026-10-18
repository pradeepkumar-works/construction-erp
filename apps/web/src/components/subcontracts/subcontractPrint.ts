import type { SubcontractBillDto, WorkOrderDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { rupeesInWords } from '@/components/bills/billPrint';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime, formatINR, formatQty, toNumber, RUPEE } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const inr = (v: string | number) => esc(formatINR(v, true).replace(RUPEE, ''));

const STYLE = `
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
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.c, th.c { text-align: center; }
  .total td { font-weight: 700; background: #fafafa; }
  .muted { color: #777; }
  .words { margin-top: 4px; font-style: italic; }
  .draft { display: inline-block; padding: 2px 8px; border: 1px solid #c77; color: #a33; border-radius: 10px; font-size: 10px; text-transform: uppercase; }
  .sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; margin-top: 48px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  ol { margin: 0; padding-left: 16px; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
`;

const vendorBlock = (o: { vendorName: string; vendorGstin: string | null; vendorPan: string | null; vendorMsme: WorkOrderDto['vendorMsme'] }) =>
  `${esc(o.vendorName)}${o.vendorGstin ? `<br/><span class="muted">GSTIN ${esc(o.vendorGstin)}</span>` : ''}${o.vendorPan ? `<br/><span class="muted">PAN ${esc(o.vendorPan)}</span>` : ''}${
    o.vendorMsme ? `<br/><span class="muted">${esc(MSME_CATEGORY_LABELS[o.vendorMsme])}</span>` : ''
  }`;

/** The work order as the subcontractor signs it: scope with rates, value in words, and the terms their bills follow. */
export function buildWoPrintHtml(o: WorkOrderDto, orgName: string): string {
  const rows = o.lines
    .map(
      (l, n) => `<tr><td class="c">${n + 1}</td><td>${l.itemNo ? `<b>${esc(l.itemNo)}</b> ` : ''}${esc(l.description)}</td>
      <td class="c">${esc(l.unit)}</td><td class="num">${esc(formatQty(l.quantity))}</td><td class="num">${inr(l.rate)}</td><td class="num">${inr(l.amount)}</td></tr>`,
    )
    .join('');
  const gst = (toNumber(o.value) * toNumber(o.gstRate)) / 100;
  const draft = o.status !== 'APPROVED';
  const terms = [
    'Quantities are paid as measured and recorded in our measurement book; the quantities above are estimates.',
    `Rates are firm for the duration of the work and exclude GST${toNumber(o.gstRate) > 0 ? `, which is paid at ${esc(o.gstRate)}% on a valid tax invoice` : ''}.`,
    toNumber(o.retentionPct) > 0 ? `${esc(o.retentionPct)}% of each bill is retained and released after the defects liability period.` : '',
    toNumber(o.advanceAmount) > 0 ? `The advance of ₹ ${inr(o.advanceAmount)} is recovered at ${esc(o.advanceRecoveryPct)}% of each bill until fully recovered.` : '',
    toNumber(o.tdsPct) > 0 ? `Income tax is deducted at source at ${esc(o.tdsPct)}% under section 194C.` : '',
    'Material issued by us is recovered from the bills at our rates.',
    o.paymentDays !== null ? `Payment within ${o.paymentDays} days of a certified bill.` : '',
    ...(o.terms ? o.terms.split(/\n+/).map(esc) : []),
  ].filter(Boolean);
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(o.woNo)} - ${esc(o.vendorName)}</title>
<style>${STYLE}</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(orgName)}</div><div class="org">${esc(o.projectName)}</div></div>
    <div style="text-align:right"><h1>Work Order ${esc(o.woNo)}</h1><div>${esc(formatDate(o.woDate))}</div>${draft ? `<div class="draft" style="margin-top:4px">Draft, not approved</div>` : ''}</div>
  </div>
  <div class="meta">
    <div><b>To</b>${vendorBlock(o)}</div>
    <div><b>Work</b>${esc(o.title)}</div>
    <div><b>Period</b>${esc(o.startDate ? formatDate(o.startDate) : 'On order')} to ${esc(o.endDate ? formatDate(o.endDate) : 'as agreed')}</div>
  </div>
  <h2>Scope and rates</h2>
  <table>
    <thead><tr><th class="c">#</th><th>Item</th><th class="c">Unit</th><th class="num">Quantity</th><th class="num">Rate (₹)</th><th class="num">Amount (₹)</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="5">Order value before GST</td><td class="num">${inr(o.value)}</td></tr>
    </tbody>
  </table>
  ${gst > 0 ? `<table style="width:50%;margin-left:auto"><tr><td>Work</td><td class="num">${inr(o.value)}</td></tr><tr><td>GST ${esc(o.gstRate)}%</td><td class="num">${inr(gst)}</td></tr><tr class="total"><td>With GST</td><td class="num">${inr(toNumber(o.value) + gst)}</td></tr></table>` : ''}
  <div class="words">${esc(rupeesInWords(o.value))} (before GST)</div>
  <h2>Terms</h2>
  <ol>${terms.map((t) => `<li>${t}</li>`).join('')}</ol>
  ${o.remarks ? `<p class="muted">${esc(o.remarks)}</p>` : ''}
  <div class="sign"><div>Prepared by<br/>${esc(o.submittedByName)}</div><div>Authorised signatory<br/>${esc(o.reviewedByName ?? '')}</div><div>Accepted by the contractor<br/>${esc(o.vendorName)}</div></div>
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · ${esc(o.woNo)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

/** The subcontractor's running bill as certified: abstract of work, deductions and the net payable. */
export function buildSubBillPrintHtml(b: SubcontractBillDto, orgName: string): string {
  const rows = b.lines
    .map(
      (l, n) => `<tr><td class="c">${n + 1}</td><td>${l.itemNo ? `<b>${esc(l.itemNo)}</b> ` : ''}${esc(l.description)}</td><td class="c">${esc(l.unit)}</td>
      <td class="num">${inr(l.rate)}</td><td class="num">${esc(formatQty(l.prevQty))}</td><td class="num">${esc(formatQty(l.thisQty))}</td><td class="num">${esc(formatQty(l.uptoQty))}</td>
      <td class="num">${inr(l.prevAmount)}</td><td class="num">${inr(l.amount)}</td><td class="num">${inr(l.uptoAmount)}</td></tr>`,
    )
    .join('');
  const materials = b.materials
    .map((m) => `<tr><td>${esc(m.itemName)}</td><td class="num">${esc(formatQty(m.quantity))} ${esc(m.unit)}</td><td class="num">${inr(m.rate)}</td><td class="num">${inr(m.amount)}</td></tr>`)
    .join('');
  const draft = b.status !== 'APPROVED';
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(b.label)} - ${esc(b.vendorName)}</title>
<style>${STYLE}</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(orgName)}</div><div class="org">${esc(b.projectName)}</div></div>
    <div style="text-align:right"><h1>${b.isFinal ? 'Final' : 'Running'} bill ${b.billNo}</h1><div>${esc(b.woNo)} · ${esc(formatDate(b.billDate))}</div>${draft ? `<div class="draft" style="margin-top:4px">Not certified</div>` : ''}</div>
  </div>
  <div class="meta">
    <div><b>Contractor</b>${vendorBlock(b)}</div>
    <div><b>Work</b>${esc(b.woTitle)}</div>
    <div><b>Work measured up to</b>${esc(formatDate(b.measuredUpTo))}</div>
    <div><b>Their invoice</b>${esc(b.invoiceNo ?? '-')}</div>
    <div><b>Payment due</b>${esc(formatDate(b.dueDate))}</div>
  </div>
  <h2>Abstract of work</h2>
  <table>
    <thead><tr><th class="c">#</th><th>Item</th><th class="c">Unit</th><th class="num">Rate (₹)</th><th class="num">Previous</th><th class="num">This bill</th><th class="num">Up to date</th><th class="num">Previous (₹)</th><th class="num">This bill (₹)</th><th class="num">Up to date (₹)</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="7">Value of work</td><td class="num">${inr(b.grossPrevious)}</td><td class="num">${inr(b.grossAmount)}</td><td class="num">${inr(b.grossUpto)}</td></tr>
    </tbody>
  </table>
  ${materials ? `<h2>Material issued and recovered</h2><table><thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Rate (₹)</th><th class="num">Amount (₹)</th></tr></thead><tbody>${materials}</tbody></table>` : ''}
  <h2>Amount payable</h2>
  <table style="width:60%;margin-left:auto">
    <tr><td>Value of work in this bill</td><td class="num">${inr(b.grossAmount)}</td></tr>
    <tr><td>GST ${esc(b.gstRate)}%</td><td class="num">${inr(b.gstAmount)}</td></tr>
    ${b.deductions
      .filter((d) => toNumber(d.amount) > 0)
      .map((d) => `<tr><td>Less ${esc(d.label)}${d.pct ? ` @ ${esc(d.pct)}%` : ''}${d.key === 'other' && b.otherDeductionNote ? ` (${esc(b.otherDeductionNote)})` : ''}</td><td class="num">(${inr(d.amount)})</td></tr>`)
      .join('')}
    <tr class="total"><td>Net payable</td><td class="num">${inr(b.netPayable)}</td></tr>
  </table>
  <div class="words">${esc(rupeesInWords(b.netPayable))}</div>
  ${b.remarks ? `<p class="muted">${esc(b.remarks)}</p>` : ''}
  <div class="sign"><div>Measured and prepared by<br/>${esc(b.submittedByName)}</div><div>Certified by<br/>${esc(b.reviewedByName ?? '')}</div><div>Received by the contractor<br/>${esc(b.vendorName)}</div></div>
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · ${esc(b.label)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

function openHtml(html: string) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export const openWoPrint = (o: WorkOrderDto, orgName: string) => openHtml(buildWoPrintHtml(o, orgName));
export const openSubBillPrint = (b: SubcontractBillDto, orgName: string) => openHtml(buildSubBillPrintHtml(b, orgName));

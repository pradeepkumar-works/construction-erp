import type { PurchaseOrderDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { rupeesInWords } from '@/components/bills/billPrint';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime, formatINR, formatQty } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const inr = (v: string) => esc(formatINR(v, true).replace('₹ ', ''));

/** The purchase order as the vendor receives it: header, items with GST, totals in words, terms and signature. */
export function buildPoPrintHtml(o: PurchaseOrderDto, orgName: string): string {
  const rows = o.lines
    .map(
      (l, n) => `<tr><td class="c">${n + 1}</td><td>${esc(l.itemName)}${l.specification ? `<div class="muted">${esc(l.specification)}</div>` : ''}</td>
      <td class="c">${esc(l.unit)}</td><td class="num">${esc(formatQty(l.quantity))}</td><td class="num">${inr(l.rate)}</td><td class="num">${inr(l.amount)}</td>
      <td class="num">${esc(l.gstRate)}%</td><td class="num">${inr(l.gstAmount)}</td></tr>`,
    )
    .join('');
  const draft = o.status !== 'APPROVED';
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(o.poNo)} - ${esc(o.vendorName)}</title>
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
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.c, th.c { text-align: center; }
  .total td { font-weight: 700; background: #fafafa; }
  .muted { color: #777; }
  .words { margin-top: 4px; font-style: italic; }
  .draft { display: inline-block; padding: 2px 8px; border: 1px solid #c77; color: #a33; border-radius: 10px; font-size: 10px; text-transform: uppercase; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  ol { margin: 0; padding-left: 16px; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(orgName)}</div><div class="org">${esc(o.projectName)}</div></div>
    <div style="text-align:right"><h1>Purchase Order ${esc(o.poNo)}</h1><div>${esc(formatDate(o.poDate))}</div>${draft ? `<div class="draft" style="margin-top:4px">Draft, not approved</div>` : ''}</div>
  </div>
  <div class="meta">
    <div><b>To</b>${esc(o.vendorName)}${o.vendorGstin ? `<br/><span class="muted">GSTIN ${esc(o.vendorGstin)}</span>` : ''}${o.vendorMsme ? `<br/><span class="muted">${esc(MSME_CATEGORY_LABELS[o.vendorMsme])}</span>` : ''}</div>
    <div><b>Deliver to</b>${esc(o.deliveryAddress ?? o.projectName)}</div>
    <div><b>Deliver by</b>${esc(o.deliveryBy ? formatDate(o.deliveryBy) : 'As agreed')}</div>
    <div><b>Our reference</b>${esc(o.requestNo ? `Material request ${o.requestNo}` : '-')}</div>
    <div><b>Payment</b>${esc(o.paymentTerms ?? (o.paymentDays !== null ? `${o.paymentDays} days from invoice` : 'As agreed'))}</div>
  </div>
  <h2>Items</h2>
  <table>
    <thead><tr><th class="c">#</th><th>Item</th><th class="c">Unit</th><th class="num">Quantity</th><th class="num">Rate (₹)</th><th class="num">Amount (₹)</th><th class="num">GST</th><th class="num">GST (₹)</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="5">Total before GST</td><td class="num">${inr(o.subtotal)}</td><td></td><td class="num">${inr(o.gstAmount)}</td></tr>
    </tbody>
  </table>
  <table style="width:50%;margin-left:auto">
    <tr><td>Items</td><td class="num">${inr(o.subtotal)}</td></tr>
    <tr><td>GST</td><td class="num">${inr(o.gstAmount)}</td></tr>
    ${Number(o.freight) > 0 ? `<tr><td>Freight</td><td class="num">${inr(o.freight)}</td></tr>` : ''}
    <tr class="total"><td>Order total</td><td class="num">${inr(o.total)}</td></tr>
  </table>
  <div class="words">${esc(rupeesInWords(o.total))}</div>
  <h2>Terms</h2>
  <ol>
    <li>Quote this PO number on the delivery challan and the invoice.</li>
    <li>Material is accepted after inspection at site; quantity is as received at site.</li>
    <li>The invoice must show our GSTIN and the HSN code of each item.</li>
    ${o.remarks ? `<li>${esc(o.remarks)}</li>` : ''}
  </ol>
  <div class="sign"><div>Prepared by<br/>${esc(o.submittedByName)}</div><div>Authorised signatory<br/>${esc(o.reviewedByName ?? '')}</div></div>
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · ${esc(o.poNo)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

export function openPoPrint(o: PurchaseOrderDto, orgName: string) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildPoPrintHtml(o, orgName));
  w.document.close();
  return true;
}

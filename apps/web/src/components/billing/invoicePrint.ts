import type { BillingInvoiceDto } from '@erp/shared';
import { BILLING_GST_PCT, BILLING_UNIT_LABELS, GST_STATES, PRODUCT_NAME } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatINR } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const state = (code: string) => `${GST_STATES[code] ?? code} (${code})`;

/** The GST tax invoice for one subscription payment, issued by Nirmaan to the company. */
export function buildInvoicePrintHtml(inv: BillingInvoiceDto): string {
  const intra = Number(inv.igst) === 0;
  const unit = BILLING_UNIT_LABELS[inv.unit][inv.units === 1 ? 'one' : 'many'];
  const period = `${formatDate(inv.periodFrom)} to ${formatDate(inv.periodTo)}`;
  const taxRows = intra
    ? `<tr><td colspan="5" class="r">CGST ${BILLING_GST_PCT / 2}%</td><td class="r">${formatINR(inv.cgst, true)}</td></tr><tr><td colspan="5" class="r">SGST ${BILLING_GST_PCT / 2}%</td><td class="r">${formatINR(inv.sgst, true)}</td></tr>`
    : `<tr><td colspan="5" class="r">IGST ${BILLING_GST_PCT}%</td><td class="r">${formatINR(inv.igst, true)}</td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>Invoice ${esc(inv.invoiceNo)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 18px; color: ${BRAND.colors.ink}; }
  .muted { color: #555; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }
  .parties b { display: block; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f4f8; font-size: 10px; }
  .r { text-align: right; }
  .total td { font-weight: 700; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(inv.seller.name)}</div><div class="muted">${esc(inv.seller.address)}</div><div class="muted">GSTIN ${esc(inv.seller.gstin)}</div></div>
    <div style="text-align:right"><h1>Tax invoice</h1><div>No. ${esc(inv.invoiceNo)}</div><div>Date ${esc(formatDate(inv.invoiceDate))}</div></div>
  </div>
  <div class="parties">
    <div><b>Bill to</b>${esc(inv.buyer.name)}<br/>${esc(inv.buyer.address ?? '')}<br/>${inv.buyer.gstin ? `GSTIN ${esc(inv.buyer.gstin)}` : 'Unregistered'}</div>
    <div><b>Place of supply</b>${esc(state(inv.buyer.stateCode ?? inv.seller.stateCode))}<br/><b style="margin-top:8px">Payment</b>Razorpay ${esc(inv.razorpayPaymentId ?? '')}${inv.paidAt ? `, ${esc(formatDate(inv.paidAt.slice(0, 10)))}` : ''}</div>
  </div>
  <table>
    <thead><tr><th>Description</th><th>SAC</th><th class="r">Quantity</th><th class="r">Rate / month</th><th class="r">Months</th><th class="r">Amount</th></tr></thead>
    <tbody>
      <tr><td>${esc(PRODUCT_NAME)} subscription, ${esc(unit)}, ${esc(period)}${inv.months === 12 ? ' (12 months for the price of ' + inv.chargedMonths + ')' : ''}</td><td>${esc(inv.seller.sac)}</td><td class="r">${inv.units}</td><td class="r">${formatINR(inv.rate, true)}</td><td class="r">${inv.chargedMonths}</td><td class="r">${formatINR(inv.taxable, true)}</td></tr>
      <tr><td colspan="5" class="r">Taxable value</td><td class="r">${formatINR(inv.taxable, true)}</td></tr>
      ${taxRows}
      <tr class="total"><td colspan="5" class="r">Total</td><td class="r">${formatINR(inv.total, true)}</td></tr>
    </tbody>
  </table>
  <p class="muted">Paid in full. This is a computer-generated invoice and needs no signature.</p>
  ${brandFooter(`${esc(inv.invoiceNo)} · ${esc(BRAND.name)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

export function openInvoicePrint(inv: BillingInvoiceDto) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildInvoicePrintHtml(inv));
  w.document.close();
  return true;
}

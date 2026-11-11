import type { GstDocumentDto, LetterheadDto, RmcInvoiceDto, RmcOrderDto } from '@erp/shared';
import { irnBlockHtml } from '@/components/gst/gstPrint';
import { GST_STATES, RMC_GST_RATE, RMC_HSN } from '@erp/shared';
import { esc, inr, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { rupeesInWords } from '@/components/bills/billPrint';
import { formatDate, formatQty, toNumber } from '@/lib/format';

const stateName = (code: string | null) => (code ? `${GST_STATES[code] ?? ''} (${code})`.trim() : '');
const hsn = `${RMC_HSN.slice(0, 4)} ${RMC_HSN.slice(4, 6)} ${RMC_HSN.slice(6)}`;

/**
 * A ready-mix quotation, or once the customer has accepted it, the order confirmation: the grade and mix, quantity, the
 * rate for concrete and for pumping, what it comes to with GST, and how long the rate holds. The order's notes are the
 * plant's own and stay off the paper.
 */
export function buildRmcQuotationPrintHtml(o: RmcOrderDto, letterhead: LetterheadDto): string {
  const quoted = o.status === 'QUOTED';
  const concrete = toNumber(o.quantity) * toNumber(o.rate);
  const pumping = o.pumpRate !== null ? toNumber(o.quantity) * toNumber(o.pumpRate) : 0;
  const taxable = concrete + pumping;
  const gst = (taxable * RMC_GST_RATE) / 100;
  const body = `
  <div class="meta">
    ${metaItem('To', esc(o.customer))}
    ${metaItem('Site', esc(o.site ?? ''))}
    ${metaItem(quoted ? 'Rate holds until' : 'Pour from', esc(quoted ? (o.validUntil ? formatDate(o.validUntil) : '') : o.pourDate ? formatDate(o.pourDate) : ''))}
  </div>
  <table>
    <thead><tr><th class="c">#</th><th>Item</th><th class="c">HSN</th><th class="num">Quantity (m³)</th><th class="num">Rate (₹ / m³)</th><th class="num">Amount (₹)</th></tr></thead>
    <tbody>
      <tr><td class="c">1</td><td>Ready-mix concrete, grade <b>${esc(o.grade)}</b><br/><span class="muted">Mix ${esc(o.mixDesignCode)}, from ${esc(o.plantName)}</span></td><td class="c">${hsn}</td><td class="num">${esc(formatQty(o.quantity))}</td><td class="num">${inr(o.rate)}</td><td class="num">${inr(concrete)}</td></tr>
      ${o.pumpRate !== null ? `<tr><td class="c">2</td><td>Pumping the concrete into place</td><td class="c"></td><td class="num">${esc(formatQty(o.quantity))}</td><td class="num">${inr(o.pumpRate)}</td><td class="num">${inr(pumping)}</td></tr>` : ''}
    </tbody>
  </table>
  <table class="sums">
    <tr><td>Before GST</td><td class="num">${inr(taxable)}</td></tr>
    <tr><td>GST ${RMC_GST_RATE}%</td><td class="num">${inr(gst)}</td></tr>
    <tr class="total"><td>With GST (₹)</td><td class="num">${inr(taxable + gst)}</td></tr>
  </table>
  <div class="words">${esc(rupeesInWords(String(taxable + gst)))}</div>
  <h2>Terms</h2>
  <ol>
    <li>Billed on the quantity delivered by challan, at the rates above, with GST at ${RMC_GST_RATE}% on a tax invoice.</li>
    <li>Pours are booked a day ahead; the site keeps the access clear for the truck${o.pumpRate !== null ? ' and pump' : ''}.</li>
    <li>Cubes are cast at the site from each day's pour and tested at 7 and 28 days.</li>
    ${quoted && o.validUntil ? `<li>The rates hold until ${esc(formatDate(o.validUntil))}.</li>` : ''}
  </ol>`;
  return printDocHtml({
    letterhead,
    under: o.plantName,
    title: quoted ? 'Quotation' : 'Order confirmation',
    number: o.orderNo,
    date: formatDate(o.date),
    stamp: o.status === 'CANCELLED' ? 'Cancelled' : null,
    body,
    signs: [signLine('For the plant'), signLine(quoted ? 'Accepted by the customer' : 'Customer', o.customer)],
  });
}

/**
 * A ready-mix tax invoice under GST: both GSTINs, the place of supply, concrete under its HSN and pumping, CGST and SGST
 * within the state or IGST across it, the total in words, and the challans it bills.
 */
export function buildRmcInvoicePrintHtml(i: RmcInvoiceDto, letterhead: LetterheadDto, irn: GstDocumentDto | null = null): string {
  const rate = toNumber(i.quantity) > 0 ? toNumber(i.concrete) / toNumber(i.quantity) : 0;
  const pumpRate = toNumber(i.quantity) > 0 ? toNumber(i.pumping) / toNumber(i.quantity) : 0;
  const grades = [...new Set(i.challans.map((c) => c.grade))].join(', ');
  const inter = toNumber(i.igst) > 0;
  const half = RMC_GST_RATE / 2;
  const body = `
  <div class="meta">
    ${metaItem('Bill to', `${esc(i.customer)}${i.customerAddress ? `<br/>${esc(i.customerAddress).replace(/\n+/g, ', ')}` : ''}${i.gstin ? `<br/>GSTIN ${esc(i.gstin)}` : '<br/><span class="muted">Unregistered</span>'}`)}
    ${metaItem('Place of supply', esc(stateName(i.customerStateCode)))}
    ${metaItem('Order', `${esc(i.orderNo ?? '')}${i.plantAddress ? `<br/><span class="muted">Dispatched from ${esc(i.plantAddress)}</span>` : ''}`)}
  </div>
  ${irnBlockHtml(irn)}
  <table>
    <thead><tr><th class="c">#</th><th>Description</th><th class="c">HSN</th><th class="num">Quantity</th><th class="num">Rate (₹)</th><th class="num">Taxable value (₹)</th></tr></thead>
    <tbody>
      <tr><td class="c">1</td><td>Ready-mix concrete${grades ? `, grade ${esc(grades)}` : ''}</td><td class="c">${hsn}</td><td class="num">${esc(formatQty(i.quantity))} m³</td><td class="num">${inr(rate)}</td><td class="num">${inr(i.concrete)}</td></tr>
      ${toNumber(i.pumping) > 0 ? `<tr><td class="c">2</td><td>Pumping the concrete</td><td class="c"></td><td class="num">${esc(formatQty(i.quantity))} m³</td><td class="num">${inr(pumpRate)}</td><td class="num">${inr(i.pumping)}</td></tr>` : ''}
    </tbody>
  </table>
  <table class="sums">
    <tr><td>Taxable value</td><td class="num">${inr(i.taxable)}</td></tr>
    ${inter ? `<tr><td>IGST ${RMC_GST_RATE}%</td><td class="num">${inr(i.igst)}</td></tr>` : `<tr><td>CGST ${half}%</td><td class="num">${inr(i.cgst)}</td></tr><tr><td>SGST ${half}%</td><td class="num">${inr(i.sgst)}</td></tr>`}
    <tr class="total"><td>Invoice total (₹)</td><td class="num">${inr(i.total)}</td></tr>
  </table>
  <div class="words">${esc(rupeesInWords(i.total))}</div>
  <p class="muted">Tax payable on reverse charge: No.</p>
  <h2>Challans billed</h2>
  <table>
    <thead><tr><th>Challan</th><th>Date</th><th>Grade</th><th class="num">Quantity (m³)</th></tr></thead>
    <tbody>${i.challans.map((c) => `<tr><td>${esc(c.batchNo)}</td><td>${esc(formatDate(c.date))}</td><td>${esc(c.grade)}</td><td class="num">${esc(formatQty(c.quantity))}</td></tr>`).join('')}</tbody>
  </table>`;
  return printDocHtml({
    letterhead,
    under: i.plantName,
    title: 'Tax invoice',
    number: i.invoiceNo,
    date: formatDate(i.date),
    stamp: i.status === 'CANCELLED' ? 'Cancelled' : null,
    body,
    signs: [signLine('Received by the customer'), signLine(`For ${letterhead.name}: authorised signatory`)],
  });
}

export const openRmcQuotationPrint = (o: RmcOrderDto, l: LetterheadDto) => openPrintWindow(buildRmcQuotationPrintHtml(o, l));
export const openRmcInvoicePrint = (i: RmcInvoiceDto, l: LetterheadDto, irn: GstDocumentDto | null = null) => openPrintWindow(buildRmcInvoicePrintHtml(i, l, irn));

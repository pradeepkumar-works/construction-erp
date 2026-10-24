import dayjs from 'dayjs';
import type { RaBillDto } from '@erp/shared';
import { BILL_STAGE_LABELS, CURRENCIES, GST_STATES, currencySymbol, fromRupees, isForeign, type ContractCurrency } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime, formatMoney, formatQty, toNumber } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** An amount in the bill's currency without its symbol (the column heads carry it). */
const amountIn = (c: ContractCurrency) => (v: string | null | undefined) => esc(formatMoney(v, c, true).replace(/^\S+\u00A0/, ''));
const qty = (v: string | null | undefined) => esc(v === null || v === undefined ? '' : formatQty(v));

/** Rupees in words, Indian style: "Rupees Twelve Lakh Thirty Four Thousand ... and Fifty Paise Only". */
export function rupeesInWords(value: string): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n: number) => [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : '', two(n % 100)].filter(Boolean).join(' ');
  const n = Math.abs(toNumber(value));
  let rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  rupees %= 1e7;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  const lakh = Math.floor(rupees / 1e5);
  rupees %= 1e5;
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rupees) parts.push(three(rupees));
  const words = parts.join(' ') || 'Zero';
  return `${toNumber(value) < 0 ? 'Minus ' : ''}Rupees ${words}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

/** A foreign amount in words, international style: "US dollar Seventy Four Thousand Eight Hundred Fifty and 25/100 Only". */
export function amountInWords(value: number, currency: string): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n: number) => [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : '', two(n % 100)].filter(Boolean).join(' ');
  const n = Math.abs(value);
  let whole = Math.floor(n);
  const cents = Math.round((n - whole) * 100);
  const parts: string[] = [];
  for (const [size, word] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']] as const) {
    const k = Math.floor(whole / size);
    whole %= size;
    if (k) parts.push(`${three(k)} ${word}`);
  }
  if (whole) parts.push(three(whole));
  const name = CURRENCIES.find((c) => c.code === currency)?.name ?? currency;
  return `${value < 0 ? 'Minus ' : ''}${name} ${parts.join(' ') || 'Zero'}${cents ? ` and ${String(cents).padStart(2, '0')}/100` : ''} Only`;
}

/** The bill as the client receives it: header, abstract of cost, deductions, measurement annex and signatures. */
export function buildBillPrintHtml(b: RaBillDto, orgName: string): string {
  const inr = amountIn(b);
  const sym = esc(currencySymbol(isForeign(b) ? b.currency : 'INR'));
  const certified = b.items.some((i) => i.certifiedQty !== null);
  const rows = b.items
    .map(
      (i, n) => `<tr>
      <td class="c">${n + 1}</td><td class="mono">${esc(i.itemNo)}</td>
      <td>${esc(i.description)}${i.extraItem ? ' <span class="flag">Extra item</span>' : toNumber(i.excessQty) > 0 ? ` <span class="flag">Excess ${qty(i.excessQty)}</span>` : ''}</td>
      <td class="c">${esc(i.unit)}</td><td class="num">${qty(i.boqQty)}</td><td class="num">${inr(i.rate)}</td>
      <td class="num">${qty(i.prevQty)}</td><td class="num">${qty(i.thisQty)}</td>${certified ? `<td class="num">${qty(i.certifiedQty ?? i.thisQty)}</td>` : ''}<td class="num">${qty(i.uptoQty)}</td>
      <td class="num">${inr(i.prevAmount)}</td><td class="num">${inr(i.amount)}</td><td class="num">${inr(i.uptoAmount)}</td>
    </tr>`,
    )
    .join('');
  // A lump-sum bill (item 129) pays its stages, then its measured unit-rate items, and shows the two totals apart.
  const staged = b.stageLines.length > 0;
  const sum = (xs: string[]) => String(xs.reduce((t, x) => t + toNumber(x), 0));
  const stageRows = b.stageLines
    .filter((l) => toNumber(l.thisPct) > 0 || toNumber(l.prevPct) > 0)
    .map(
      (l) => `<tr>
      <td class="mono">${esc(l.componentCode)}</td><td>${esc(l.componentName)}: ${esc(l.stageName)}<div class="muted">${esc(l.evidenceText)}</div></td>
      <td class="num">${esc(l.stagePct)}</td><td class="num">${inr(l.stageValue)}</td><td class="num">${esc(l.prevPct)}</td><td class="num">${esc(l.certifiedPct ?? l.thisPct)}</td><td class="num">${esc(l.uptoPct)}</td>
      <td class="num">${inr(l.prevAmount)}</td><td class="num">${inr(l.amount)}</td><td class="num">${inr(String(toNumber(l.prevAmount) + toNumber(l.amount)))}</td>
    </tr>`,
    )
    .join('');
  const stagePrev = sum(b.stageLines.map((l) => l.prevAmount));
  const stageThis = sum(b.stageLines.map((l) => l.amount));
  const itemPrev = sum(b.items.map((i) => i.prevAmount));
  const itemThis = sum(b.items.map((i) => i.amount));
  const itemUpto = sum(b.items.map((i) => i.uptoAmount));
  const deductions = b.deductions
    .map((d) => `<tr><td>${esc(d.label)}${d.pct !== null ? ` @ ${esc(d.pct)}%` : ''}</td><td class="num">${inr(d.amount)}</td></tr>`)
    .join('');
  const annex = (b.measurements ?? [])
    .map((m) => {
      const lines = m.lines
        .map(
          (l) =>
            `<tr><td>${esc(l.description)}${l.deduct ? ' <span class="flag">Deduct</span>' : ''}</td><td class="num">${qty(l.nos)}</td><td class="num">${qty(l.length)}</td><td class="num">${qty(l.breadth)}</td><td class="num">${qty(l.depth)}</td><td class="num">${qty(l.quantity)}</td></tr>`,
        )
        .join('');
      return `<div class="mb"><div class="mbhead"><b>${esc(m.mbNo)}</b> · ${esc(formatDate(m.date))} · item ${esc(m.boqItemNo)} · ${esc(m.location)}</div>
      <table><thead><tr><th>Description</th><th class="num">Nos</th><th class="num">L</th><th class="num">B</th><th class="num">D / H</th><th class="num">Qty (${esc(m.unit)})</th></tr></thead>
      <tbody>${lines}<tr><th colspan="5">Total</th><th class="num">${qty(m.totalQty)}</th></tr></tbody></table></div>`;
    })
    .join('');
  const client = b.client;
  const status = b.status === 'APPROVED' ? BILL_STAGE_LABELS[b.stage] : b.status.replace(/_/g, ' ');
  const cols = certified ? 13 : 12;

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(b.billLabel)} - ${esc(b.projectName)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { font-size: 18px; color: ${BRAND.colors.ink}; }
  .org { color: #555; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .status { display: inline-block; padding: 2px 8px; border: 1px solid #999; border-radius: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .meta { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 6px 16px; margin-bottom: 12px; }
  .meta div b { display: block; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 11px; text-transform: uppercase; color: ${BRAND.colors.ink}; border-bottom: 1px solid #ddd; margin: 14px 0 6px; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #f1f4f8; font-size: 10px; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.c { text-align: center; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .flag { font-size: 9px; border: 1px solid #c77; color: #a33; border-radius: 6px; padding: 0 4px; white-space: nowrap; }
  .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; page-break-inside: avoid; }
  .total td, .total th { font-weight: 700; background: #fafafa; }
  .words { margin-top: 4px; font-style: italic; }
  .mb { page-break-inside: avoid; margin-bottom: 8px; }
  .mbhead { margin: 6px 0 3px; }
  .annex { page-break-before: always; }
  .sign { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-top: 40px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  .muted { color: ${BRAND.colors.muted}; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(orgName)}</div><div class="org">${esc(b.projectName)} (${esc(b.projectCode)})</div></div>
    <div style="text-align:right"><h1>Running Account Bill No. ${esc(b.billNo)}${b.isFinal ? ' (Final)' : ''}</h1><div>${esc(formatDate(b.billDate))}</div><div style="margin-top:4px" class="status">${esc(status)}</div></div>
  </div>
  <div class="meta">
    <div><b>To</b>${esc(client?.name ?? b.clientName ?? '-')}${client?.department ? `<br/>${esc(client.department)}` : ''}${client?.billingAddress ? `<br/><span class="muted">${esc(client.billingAddress)}</span>` : ''}</div>
    <div><b>Client GSTIN</b>${esc(client?.gstin ?? '-')}${client?.stateCode ? `<br/><span class="muted">${esc(GST_STATES[client.stateCode] ?? client.stateCode)}</span>` : ''}</div>
    <div><b>Agreement</b>${esc(b.agreementNo ?? '-')}${b.agreementDate ? `<br/><span class="muted">${esc(formatDate(b.agreementDate))}</span>` : ''}</div>
    <div><b>Work order</b>${esc(b.workOrderNo ?? '-')}</div>
    <div><b>Measurements up to</b>${esc(formatDate(b.measuredUpTo))}</div>
    <div><b>Measurement sheets</b>${esc(b.measurementCount)}</div>
    <div><b>Sent</b>${esc(b.sentDate ? formatDate(b.sentDate) : '-')}</div>
    <div><b>Certified</b>${esc(b.certifiedDate ? formatDate(b.certifiedDate) : '-')}${b.certificateNo ? ` (${esc(b.certificateNo)})` : ''}</div>
  </div>

${
  staged
    ? `
  <h2>Payment stages</h2>
  <table>
    <thead>
      <tr><th rowspan="2">Comp.</th><th rowspan="2">Stage</th><th rowspan="2" class="num">% of comp.</th><th rowspan="2" class="num">Value (${sym})</th>
        <th colspan="3" style="text-align:center">% of the stage</th><th colspan="3" style="text-align:center">Amount (${sym})</th></tr>
      <tr><th class="num">Previous</th><th class="num">This bill</th><th class="num">Up to date</th><th class="num">Previous</th><th class="num">This bill</th><th class="num">Up to date</th></tr>
    </thead>
    <tbody>
      ${stageRows || '<tr><td colspan="10" class="muted">No stage billed yet</td></tr>'}
      <tr class="total"><td colspan="7">Stages</td><td class="num">${inr(stagePrev)}</td><td class="num">${inr(stageThis)}</td><td class="num">${inr(String(toNumber(stagePrev) + toNumber(stageThis)))}</td></tr>
    </tbody>
  </table>`
    : ''
}
  <h2>${staged ? `Unit-rate items (rate × tender factor ${esc(b.tenderFactor ?? '1')})` : 'Abstract of cost'}</h2>
  <table>
    <thead>
      <tr><th rowspan="2" class="c">#</th><th rowspan="2">Item</th><th rowspan="2">Description</th><th rowspan="2">Unit</th><th rowspan="2" class="num">BOQ qty</th><th rowspan="2" class="num">Rate (${sym})</th>
        <th colspan="${certified ? 4 : 3}" style="text-align:center">Quantity</th><th colspan="3" style="text-align:center">Amount (${sym})</th></tr>
      <tr><th class="num">Previous</th><th class="num">This bill</th>${certified ? '<th class="num">Certified</th>' : ''}<th class="num">Up to date</th><th class="num">Previous</th><th class="num">This bill</th><th class="num">Up to date</th></tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="${cols}" class="muted">No items</td></tr>`}
      ${staged ? `<tr class="total"><td colspan="${cols - 3}">Unit-rate items</td><td class="num">${inr(itemPrev)}</td><td class="num">${inr(itemThis)}</td><td class="num">${inr(itemUpto)}</td></tr>` : ''}
      <tr class="total"><td colspan="${cols - 3}">Value of work done${staged ? ' (stages and items)' : ''}</td><td class="num">${inr(b.grossPrevious)}</td><td class="num">${inr(b.grossAmount)}</td><td class="num">${inr(b.grossUpto)}</td></tr>
    </tbody>
  </table>
${
  b.pvLines.length
    ? `
  <h2>Price variation</h2>
  <table>
    <thead><tr><th>Component</th><th class="num">Share (%)</th><th class="num">Base index</th><th class="num">Current index</th><th class="num">Amount (${sym})</th></tr></thead>
    <tbody>
      ${b.pvLines.map((l) => `<tr><td>${esc(l.name)}</td><td class="num">${esc(l.sharePct)}</td><td class="num">${esc(l.baseIndex)}</td><td class="num">${esc(l.currentIndex)}</td><td class="num">${inr(l.amount)}</td></tr>`).join('')}
      <tr class="total"><td colspan="4">On work of ${sym} ${inr(b.grossAmount)}${b.pvNote ? ` (${esc(b.pvNote)})` : ''}</td><td class="num">${inr(b.pvAmount)}</td></tr>
    </tbody>
  </table>`
    : ''
}

  <div class="summary">
    <div>
      <h2>Bill amount</h2>
      <table>
        <tr><td>Value of work in this bill</td><td class="num">${inr(b.grossAmount)}</td></tr>
        ${b.pvLines.length ? `<tr><td>Price variation${b.pvIndexMonth ? ` (indices for ${esc(dayjs(b.pvIndexMonth).format('MMM YYYY'))})` : ''}</td><td class="num">${inr(b.pvAmount)}</td></tr>` : ''}
        <tr><td>GST @ ${esc(b.gstRate)}%</td><td class="num">${inr(b.gstAmount)}</td></tr>
        <tr class="total"><td>Gross bill amount</td><td class="num">${inr(b.invoiceAmount)}</td></tr>
        <tr><td>Less deductions</td><td class="num">${inr(b.totalDeductions)}</td></tr>
        <tr class="total"><td>Net payable</td><td class="num">${inr(b.netPayable)}</td></tr>
      </table>
      <div class="words">${esc(isForeign(b) ? amountInWords(fromRupees(b.netPayable, b.exchangeRate), b.currency) : rupeesInWords(b.netPayable))}${isForeign(b) ? `<div class="muted">At the contract rate of ₹ ${esc(b.exchangeRate)} to 1 ${esc(b.currency)}</div>` : ''}</div>
      ${b.claimedNet !== null ? `<div class="muted" style="margin-top:4px">As claimed: work ${sym} ${inr(b.claimedGross)}, net ${sym} ${inr(b.claimedNet)}</div>` : ''}
    </div>
    <div>
      <h2>Deductions</h2>
      <table>${deductions || '<tr><td class="muted">None</td></tr>'}<tr class="total"><td>Total deductions</td><td class="num">${inr(b.totalDeductions)}</td></tr></table>
      ${b.remarks ? `<h2>Remarks</h2><p>${esc(b.remarks)}</p>` : ''}
    </div>
  </div>

  <div class="sign"><div>Prepared by<br/>${esc(b.submittedByName)}</div><div>Checked and approved by<br/>${esc(b.reviewedByName ?? '')}</div><div>Measured and checked by (client)</div><div>Passed for payment (client)</div></div>

  ${annex ? `<div class="annex"><h2>Measurement annex</h2>${annex}</div>` : ''}
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · Bill ID ${esc(b.id)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

export function openBillPrint(b: RaBillDto, orgName: string) {
  const w = window.open('', '_blank', 'width=1100,height=900');
  if (!w) return false;
  w.document.open();
  w.document.write(buildBillPrintHtml(b, orgName));
  w.document.close();
  return true;
}

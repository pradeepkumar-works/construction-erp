import type { LetterheadDto, TenderDetailDto, TenderItemDto } from '@erp/shared';
import { TENDER_BID_TYPE_LABELS, TENDER_LINE_KIND_LABELS, unitLabel } from '@erp/shared';
import { esc, inr, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { rupeesInWords } from '@/components/bills/billPrint';
import { downloadWorkbook, workbookSheet, type ExportColumn } from '@/lib/exportExcel';
import { formatDate, formatQty, toNumber } from '@/lib/format';

const num = (v: string | null) => (v === null ? null : toNumber(v));

/**
 * The priced BOQ as it is submitted: each item with its quantity, the rate quoted and the amount, the total in words,
 * and on a percentage tender the percentage on the SOR. The rate analysis, overheads and margin are the company's and
 * stay off it; they go to Excel.
 */
export function buildPricedBoqHtml(t: TenderDetailDto, letterhead: LetterheadDto): string {
  const pct = t.bidType === 'PERCENTAGE';
  const rows = t.items
    .map(
      (i, n) => `<tr><td class="c">${n + 1}</td><td><b>${esc(i.itemNo)}</b> ${esc(i.description)}${i.sorCode ? `<br/><span class="muted">SOR ${esc(i.sorCode)}</span>` : ''}</td>
      <td class="c">${esc(unitLabel(i.unit))}</td><td class="num">${esc(formatQty(i.qty))}</td>
      ${pct ? `<td class="num">${i.sorRate !== null ? inr(i.sorRate) : ''}</td>` : ''}<td class="num">${i.quotedRate !== null ? inr(i.quotedRate) : ''}</td><td class="num">${i.quotedAmount !== null ? inr(i.quotedAmount) : ''}</td></tr>`,
    )
    .join('');
  const total = t.totals.quotedAmount;
  const unpriced = t.items.filter((i) => i.quotedRate === null).length;
  const body = `
  <div class="meta">
    ${metaItem('Work', esc(t.title))}
    ${metaItem('Client', esc(t.clientName ?? ''))}
    ${metaItem('Tender', `${esc(t.nitNo ?? t.tenderNo)}<br/><span class="muted">${esc(TENDER_BID_TYPE_LABELS[t.bidType])}</span>`)}
    ${t.location ? metaItem('Location', esc(t.location)) : ''}
    ${metaItem('Due', esc(formatDate(t.submitBy)))}
    ${t.completionMonths ? metaItem('Time for completion', `${t.completionMonths} months`) : ''}
  </div>
  <table>
    <thead><tr><th class="c">#</th><th>Item</th><th class="c">Unit</th><th class="num">Quantity</th>${pct ? '<th class="num">SOR rate (₹)</th>' : ''}<th class="num">Rate quoted (₹)</th><th class="num">Amount (₹)</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="${pct ? 6 : 5}">Total</td><td class="num">${total !== null ? inr(total) : ''}</td></tr>
    </tbody>
  </table>
  ${total !== null ? `<div class="words">${esc(rupeesInWords(total))}</div>` : ''}
  ${pct && t.totals.quotedPct !== null ? `<p>We quote ${esc(Math.abs(toNumber(t.totals.quotedPct)).toFixed(2))}% ${toNumber(t.totals.quotedPct) >= 0 ? 'above' : 'below'} the ${esc(t.sorBookName ?? 'schedule of rates')}.</p>` : ''}`;
  return printDocHtml({
    letterhead,
    under: t.clientName ?? undefined,
    title: 'Priced bill of quantities',
    number: t.tenderNo,
    date: formatDate(t.submittedOn ?? t.submitBy),
    stamp: unpriced ? `${unpriced} ${unpriced === 1 ? 'item' : 'items'} not priced` : null,
    body,
    signs: [signLine('Signature of the bidder'), signLine('Seal')],
  });
}

const BOQ_COLUMNS: ExportColumn<TenderItemDto>[] = [
  { header: 'Item', value: (i) => i.itemNo, width: 10 },
  { header: 'Description', value: (i) => i.description, width: 50 },
  { header: 'Unit', value: (i) => i.unit, width: 8 },
  { header: 'Quantity', value: (i) => num(i.qty), width: 12 },
  { header: 'SOR code', value: (i) => i.sorCode, width: 12 },
  { header: 'SOR rate', value: (i) => num(i.sorRate), width: 12 },
  { header: 'SOR amount', value: (i) => num(i.sorAmount), width: 14 },
  { header: 'Material per unit', value: (i) => num(i.material), width: 14 },
  { header: 'Labour per unit', value: (i) => num(i.labour), width: 14 },
  { header: 'Machinery per unit', value: (i) => num(i.equipment), width: 14 },
  { header: 'Cost per unit', value: (i) => num(i.cost), width: 14 },
  { header: 'Built-up rate', value: (i) => num(i.builtUpRate), width: 14 },
  { header: 'Rate quoted', value: (i) => num(i.quotedRate), width: 14 },
  { header: 'Amount quoted', value: (i) => num(i.quotedAmount), width: 16 },
];

type AnalysisRow = { item: TenderItemDto; line: TenderItemDto['lines'][number] };
const ANALYSIS_COLUMNS: ExportColumn<AnalysisRow>[] = [
  { header: 'Item', value: (r) => r.item.itemNo, width: 10 },
  { header: 'Item description', value: (r) => r.item.description, width: 40 },
  { header: 'Item unit', value: (r) => r.item.unit, width: 8 },
  { header: 'Kind', value: (r) => TENDER_LINE_KIND_LABELS[r.line.kind], width: 12 },
  { header: 'Resource', value: (r) => r.line.name, width: 30 },
  { header: 'Unit', value: (r) => r.line.unit, width: 8 },
  { header: 'Per unit of item', value: (r) => num(r.line.qtyPerUnit), width: 14 },
  { header: 'Wastage %', value: (r) => num(r.line.wastagePct), width: 10 },
  { header: 'Rate', value: (r) => num(r.line.rate), width: 12 },
  { header: 'Amount per unit of item', value: (r) => num(r.line.amount), width: 16 },
];

type SummaryRow = [string, string | number | null];
const SUMMARY_COLUMNS: ExportColumn<SummaryRow>[] = [
  { header: 'Figure', value: (r) => r[0], width: 34 },
  { header: 'Value', value: (r) => r[1], width: 18 },
];

/** The bid for the estimating desk: the priced BOQ with each item's cost, the rate analysis line by line, and the totals. */
export async function downloadTenderWorkbook(t: TenderDetailDto) {
  const x = t.totals;
  const summary: SummaryRow[] = [
    ['Tender', t.tenderNo],
    ['Work', t.title],
    ['Client', t.clientName],
    ['Bid type', TENDER_BID_TYPE_LABELS[t.bidType]],
    ['Schedule of rates', t.sorBookName],
    ['BOQ at SOR rates', num(x.sorAmount)],
    ['Direct cost', num(x.costAmount)],
    [`Overheads ${t.overheadPct}%`, num(x.overheads)],
    [`Profit ${t.profitPct}%`, num(x.profit)],
    ['Built-up amount', num(x.builtUpAmount)],
    ['Amount quoted', num(x.quotedAmount)],
    ['Quoted against SOR, %', num(x.quotedPct)],
    ['Margin left in the bid', num(x.margin)],
  ];
  await downloadWorkbook(`tender-${t.tenderNo}.xlsx`, [
    workbookSheet('Priced BOQ', BOQ_COLUMNS, t.items),
    workbookSheet('Rate analysis', ANALYSIS_COLUMNS, t.items.flatMap((item) => item.lines.map((line) => ({ item, line })))),
    workbookSheet('Summary', SUMMARY_COLUMNS, summary),
  ]);
  return t.items.length;
}

export const openPricedBoqPrint = (t: TenderDetailDto, l: LetterheadDto) => openPrintWindow(buildPricedBoqHtml(t, l));

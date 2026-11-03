import type { LetterheadDto, MeasurementSheetDto } from '@erp/shared';
import { sectorLocation, unitLabel } from '@erp/shared';
import { esc, inr, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { rupeesInWords } from '@/components/bills/billPrint';
import { formatDate, formatQty } from '@/lib/format';

const dim = (v: string | null) => (v === null ? '' : esc(formatQty(v)));

/**
 * A measurement book page as the engineer and the client's engineer sign it: the BOQ item, each line's Nos × L × B × D,
 * deductions shown in brackets, the total in the item's unit and its value at the BOQ rate.
 */
export function buildMeasurementPrintHtml(m: MeasurementSheetDto, letterhead: LetterheadDto): string {
  const where = [m.location, sectorLocation(m)].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ');
  const unit = esc(unitLabel(m.unit));
  const rows = m.lines
    .map((l, n) => {
      const q = esc(formatQty(l.deduct ? String(Math.abs(Number(l.quantity))) : l.quantity));
      return `<tr><td class="c">${n + 1}</td><td>${l.deduct ? '<b>Deduct</b> ' : ''}${esc(l.description)}</td><td class="num">${dim(l.nos)}</td><td class="num">${dim(l.length)}</td><td class="num">${dim(l.breadth)}</td><td class="num">${dim(l.depth)}</td><td class="num">${l.deduct ? `(${q})` : q}</td></tr>`;
    })
    .join('');
  const body = `
  <div class="meta">
    ${metaItem('Project', esc(m.projectName))}
    ${metaItem('BOQ item', `<b>${esc(m.boqItemNo)}</b> ${esc(m.boqDescription)}`)}
    ${metaItem('Location', esc(where))}
    ${m.woNo ? metaItem('Done by', `${esc(m.contractorName ?? '')} (${esc(m.woNo)})`) : ''}
    ${m.raBillNo !== null ? metaItem('Billed in', `RA bill ${m.raBillNo}`) : ''}
  </div>
  <h2>Measurements</h2>
  <table>
    <thead><tr><th class="c">#</th><th>Description</th><th class="num">Nos</th><th class="num">L</th><th class="num">B</th><th class="num">D / H</th><th class="num">Qty (${unit})</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="6">Total</td><td class="num">${esc(formatQty(m.totalQty))}</td></tr>
    </tbody>
  </table>
  <table class="sums">
    <tr><td>Quantity</td><td class="num">${esc(formatQty(m.totalQty))} ${unit}</td></tr>
    <tr><td>BOQ rate (₹ / ${unit})</td><td class="num">${inr(m.rate)}</td></tr>
    <tr class="total"><td>Value of work (₹)</td><td class="num">${inr(m.amount)}</td></tr>
  </table>
  <div class="words">${esc(rupeesInWords(m.amount))}</div>
  ${m.remarks ? `<h2>Remarks</h2><p class="note">${esc(m.remarks)}</p>` : ''}`;
  return printDocHtml({
    letterhead,
    under: m.projectName,
    title: 'Measurement book',
    number: m.mbNo,
    date: formatDate(m.date),
    stamp: m.status === 'APPROVED' ? null : 'Not checked',
    body,
    signs: [signLine('Measured by', m.submittedByName), signLine('Checked by', m.reviewedByName), signLine('For the client')],
  });
}

export const openMeasurementPrint = (m: MeasurementSheetDto, l: LetterheadDto) => openPrintWindow(buildMeasurementPrintHtml(m, l));

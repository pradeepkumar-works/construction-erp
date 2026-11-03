import type { DebitNoteDto, LetterheadDto } from '@erp/shared';
import { DEBIT_NOTE_REASON_LABELS, GST_STATES, gstStateCode, unitLabel } from '@erp/shared';
import { esc, inr, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { rupeesInWords } from '@/components/bills/billPrint';
import { formatDate, formatQty, toNumber } from '@/lib/format';

/**
 * A debit note as the vendor receives it under GST: our GSTIN and theirs, the bill it reduces, each line with its GST,
 * and the total in words. A cancelled note prints marked as one.
 */
export function buildDebitNotePrintHtml(d: DebitNoteDto, letterhead: LetterheadDto): string {
  const vendorState = gstStateCode(d.vendorGstin);
  const rows = d.lines
    .map(
      (
        l,
        n,
      ) => `<tr><td class="c">${n + 1}</td><td>${esc(l.description)}</td><td class="num">${l.quantity !== null ? `${esc(formatQty(l.quantity))} ${esc(unitLabel(l.unit))}` : ''}</td>
      <td class="num">${l.rate !== null ? inr(l.rate) : ''}</td><td class="num">${inr(l.amount)}</td><td class="num">${esc(l.gstRate)}%</td><td class="num">${inr(l.gstAmount)}</td></tr>`,
    )
    .join('');
  const body = `
  <div class="meta">
    ${metaItem('To', `${esc(d.vendorName)}${d.vendorGstin ? `<br/><span class="muted">GSTIN ${esc(d.vendorGstin)}</span>` : ''}${vendorState && GST_STATES[vendorState] ? `<br/><span class="muted">${esc(GST_STATES[vendorState])}</span>` : ''}`)}
    ${metaItem('Against', esc(d.billLabel))}
    ${metaItem('Reason', `${esc(DEBIT_NOTE_REASON_LABELS[d.reason])}${d.stockEntryNo ? `<br/><span class="muted">${esc(d.stockEntryNo)}</span>` : ''}`)}
  </div>
  <table>
    <thead><tr><th class="c">#</th><th>Description</th><th class="num">Quantity</th><th class="num">Rate (₹)</th><th class="num">Amount (₹)</th><th class="num">GST</th><th class="num">GST (₹)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="sums">
    <tr><td>Value</td><td class="num">${inr(d.subtotal)}</td></tr>
    <tr><td>GST</td><td class="num">${inr(d.gstAmount)}</td></tr>
    <tr class="total"><td>Debit note total (₹)</td><td class="num">${inr(d.total)}</td></tr>
  </table>
  <div class="words">${esc(rupeesInWords(d.total))}</div>
  <p class="muted">We have reduced what we owe you on ${esc(d.billLabel)} by this amount.${toNumber(d.gstAmount) > 0 ? ' Please issue a credit note for it so the GST matches in both returns.' : ''}</p>
  ${d.remarks ? `<h2>Remarks</h2><p class="note">${esc(d.remarks)}</p>` : ''}
  ${d.cancelledAt ? `<h2>Cancelled</h2><p class="note">${esc(d.cancelledByName ?? '')}, ${esc(formatDate(d.cancelledAt.slice(0, 10)))}${d.cancelNote ? `<br/>${esc(d.cancelNote)}` : ''}</p>` : ''}`;
  return printDocHtml({
    letterhead,
    under: `${d.projectCode} - ${d.projectName}`,
    title: 'Debit note',
    number: d.noteNo,
    date: formatDate(d.date),
    stamp: d.cancelledAt ? 'Cancelled' : null,
    body,
    signs: [signLine('Prepared by', d.createdByName), signLine('Authorised signatory')],
  });
}

export const openDebitNotePrint = (d: DebitNoteDto, l: LetterheadDto) => openPrintWindow(buildDebitNotePrintHtml(d, l));

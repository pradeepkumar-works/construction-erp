import type { ExcessSavingDto, LetterheadDto } from '@erp/shared';
import { EXCESS_SAVING_KIND_LABELS, unitLabel } from '@erp/shared';
import { esc, inr, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import dayjs from 'dayjs';

const qty = (v: string) => (toNumber(v) ? esc(formatQty(v)) : '');
const amt = (v: string) => (toNumber(v) ? inr(v) : '');

/**
 * The excess and saving statement as it goes to the client with a variation or the final bill: each item's agreement
 * quantity and amount, what it is expected to end at, and the excess and saving, with the net against the agreement.
 */
export function buildExcessSavingPrintHtml(s: ExcessSavingDto, letterhead: LetterheadDto): string {
  const rows = s.rows
    .map(
      (r, n) => `<tr><td class="c">${n + 1}</td><td><b>${esc(r.itemNo)}</b> ${esc(r.description)}${r.kind !== 'BOQ' ? ` <span class="muted">(${esc(EXCESS_SAVING_KIND_LABELS[r.kind].toLowerCase())})</span>` : ''}</td><td>${esc(unitLabel(r.unit))}</td><td class="num">${inr(r.rate)}</td><td class="num">${qty(r.agreementQty)}</td><td class="num">${amt(r.agreementAmount)}</td><td class="num">${qty(r.anticipatedQty)}</td><td class="num">${amt(r.anticipatedAmount)}</td><td class="num">${qty(r.excessQty)}</td><td class="num">${amt(r.excessAmount)}</td><td class="num">${qty(r.savingQty)}</td><td class="num">${amt(r.savingAmount)}</td></tr>`,
    )
    .join('');
  const t = s.totals;
  const body = `<div class="meta">
    ${metaItem('Project', `${esc(s.projectCode)} - ${esc(s.projectName)}`)}
    ${metaItem('Deviation limit', `${s.tolerancePct}% over the agreement quantity`)}
  </div>
  <table>
    <thead><tr><th rowspan="2">#</th><th rowspan="2">Item</th><th rowspan="2">Unit</th><th rowspan="2" class="num">Rate</th><th colspan="2">As per agreement</th><th colspan="2">Expected to end at</th><th colspan="2">Excess</th><th colspan="2">Saving</th></tr>
    <tr><th class="num">Qty</th><th class="num">Amount</th><th class="num">Qty</th><th class="num">Amount</th><th class="num">Qty</th><th class="num">Amount</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="5">Total</td><td class="num">${inr(t.agreement)}</td><td></td><td class="num">${inr(t.anticipated)}</td><td></td><td class="num">${inr(t.excess)}</td><td></td><td class="num">${inr(t.saving)}</td></tr>
    </tbody>
  </table>
  <div class="words">Net ${toNumber(t.net) < 0 ? 'saving' : 'excess'}: ${inr(Math.abs(toNumber(t.net)))}${t.netPct !== null ? ` (${Math.abs(t.netPct)}% of the agreement)` : ''}, before GST</div>`;
  return printDocHtml({
    letterhead,
    under: s.projectName,
    title: 'Excess and saving statement',
    number: s.projectCode,
    date: formatDate(dayjs().format('YYYY-MM-DD')),
    stamp: null,
    body,
    signs: [signLine('Prepared by'), signLine('For the contractor'), signLine('For the client')],
  });
}

export const openExcessSavingPrint = (s: ExcessSavingDto, l: LetterheadDto) => openPrintWindow(buildExcessSavingPrintHtml(s, l));

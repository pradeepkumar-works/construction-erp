import type { LetterheadDto, VariationDto } from '@erp/shared';
import { VARIATION_CAUSE_LABELS, unitLabel } from '@erp/shared';
import { esc, inr, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { rupeesInWords } from '@/components/bills/billPrint';
import { formatDate, formatQty, toNumber } from '@/lib/format';

const signed = (v: string) => `${toNumber(v) > 0 ? '+' : ''}${esc(formatQty(v))}`;

/**
 * A variation claim as it goes to the client: the change and why, each BOQ item's change in quantity at its rate (new
 * items marked), the amount claimed in words, and once the client has decided, what they approved beside it.
 */
export function buildVariationPrintHtml(v: VariationDto, letterhead: LetterheadDto): string {
  const decided = v.status === 'APPROVED';
  const rows = v.lines
    .map(
      (
        l,
        n,
      ) => `<tr><td class="c">${n + 1}</td><td><b>${esc(l.itemNo)}</b> ${esc(l.description)}${l.isNewItem ? ' <span class="muted">(new item)</span>' : ''}</td>
      <td class="c">${esc(unitLabel(l.unit))}</td><td class="num">${signed(l.qty)}</td><td class="num">${inr(l.rate)}</td><td class="num">${inr(l.amount)}</td>
      ${decided ? `<td class="num">${l.approvedQty !== null ? signed(l.approvedQty) : ''}</td><td class="num">${l.approvedRate !== null ? inr(l.approvedRate) : ''}</td><td class="num">${l.approvedAmount !== null ? inr(l.approvedAmount) : ''}</td>` : ''}</tr>`,
    )
    .join('');
  const head = `<tr><th class="c">#</th><th>Item</th><th class="c">Unit</th><th class="num">Change in qty</th><th class="num">Rate (₹)</th><th class="num">Claimed (₹)</th>${
    decided ? '<th class="num">Approved qty</th><th class="num">Approved rate (₹)</th><th class="num">Approved (₹)</th>' : ''
  }</tr>`;
  const body = `
  <div class="meta">
    ${metaItem('Project', `${esc(v.projectCode)} - ${esc(v.projectName)}`)}
    ${metaItem('Variation', `<b>${esc(v.label)}</b> ${esc(v.title)}`)}
    ${metaItem('Cause', esc(VARIATION_CAUSE_LABELS[v.cause]))}
    ${v.submittedDate ? metaItem('Sent to the client', `${esc(formatDate(v.submittedDate))}${v.submittedRef ? `<br/><span class="muted">${esc(v.submittedRef)}</span>` : ''}`) : ''}
    ${v.decidedDate ? metaItem("Client's decision", `${esc(formatDate(v.decidedDate))}${v.clientRef ? `<br/><span class="muted">${esc(v.clientRef)}</span>` : ''}`) : ''}
  </div>
  ${v.description ? `<h2>The change</h2><p class="note">${esc(v.description)}</p>` : ''}
  <h2>Items</h2>
  <table>
    <thead>${head}</thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="5">Total</td><td class="num">${inr(v.claimedAmount)}</td>${decided ? `<td colspan="2"></td><td class="num">${inr(v.approvedAmount ?? '0')}</td>` : ''}</tr>
    </tbody>
  </table>
  <div class="words">Claimed: ${esc(rupeesInWords(v.claimedAmount))} (before GST)</div>
  ${decided && v.approvedAmount !== null ? `<div class="words">Approved: ${esc(rupeesInWords(v.approvedAmount))} (before GST)</div>` : ''}
  ${v.decisionNote ? `<h2>Client's note</h2><p class="note">${esc(v.decisionNote)}</p>` : ''}`;
  return printDocHtml({
    letterhead,
    under: v.projectName,
    title: 'Variation claim',
    number: `${v.label} · ${v.projectCode}`,
    date: formatDate(v.submittedDate ?? v.createdAt.slice(0, 10)),
    stamp: v.status === 'DRAFT' ? 'Draft' : v.status === 'REJECTED' ? 'Rejected by the client' : null,
    body,
    signs: [signLine('Prepared by', v.createdByName), signLine('For the contractor'), signLine('For the client')],
  });
}

export const openVariationPrint = (v: VariationDto, l: LetterheadDto) => openPrintWindow(buildVariationPrintHtml(v, l));

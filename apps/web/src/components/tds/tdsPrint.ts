import type { LetterheadDto, TdsStatementDto } from '@erp/shared';
import { TDS_RETURN_FORM_LABELS } from '@erp/shared';
import { esc, inr, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { formatDate } from '@/lib/format';

/**
 * One deductee's TDS in a quarter as the company states it: what was paid, the section, rate and tax deducted, and the
 * challans the tax went in by. Printed on the letterhead and handed over by hand; Nirmaan sends it to no one. It says
 * that the certificate that counts (Form 16A for a vendor, Form 16 Part A for an employee) comes from TRACES.
 */
export function buildTdsStatementHtml(s: TdsStatementDto, letterhead: LetterheadDto): string {
  const salary = s.form === 'FORM_24Q';
  const challanOf = new Map(s.challans.map((c) => [c.id, c]));
  const rows = s.deductions
    .map(
      (d) => `<tr>
        <td class="c">${esc(formatDate(d.paidOn))}</td>
        <td class="c" translate="no">${esc(d.sectionName)}</td>
        <td>${esc(d.sourceLabel)}</td>
        <td class="num">${inr(d.amountPaid)}</td>
        <td class="num">${d.rate ? `${esc(d.rate)}%` : '-'}</td>
        <td class="num">${inr(d.tdsAmount)}</td>
        <td class="c" translate="no">${d.challanId && challanOf.get(d.challanId) ? esc(challanOf.get(d.challanId)!.label) : 'Not deposited yet'}</td>
      </tr>`,
    )
    .join('');
  const challans = s.challans.length
    ? `<table><thead><tr><th>BSR code</th><th class="c">Deposited on</th><th class="c">Challan serial</th><th class="num">Tax in the challan (₹)</th></tr></thead><tbody>${s.challans
        .map((c) => `<tr><td translate="no">${esc(c.bsrCode)}</td><td class="c">${esc(formatDate(c.depositedOn))}</td><td class="c" translate="no">${esc(c.challanSerial)}</td><td class="num">${inr(c.tax)}</td></tr>`)
        .join('')}</tbody></table><p class="muted">A challan's tax is for every deductee it covers; the amounts above are this deductee's.</p>`
    : '<p class="muted">None of this tax is deposited yet.</p>';
  const body = `
  <div class="meta">
    ${metaItem('Deductor', `${esc(s.deductor.name)}${s.deductor.address ? `<br/><span class="muted">${esc(s.deductor.address)}</span>` : ''}`)}
    ${metaItem('TAN of the deductor', `<span translate="no">${esc(s.deductor.tan ?? 'Not entered')}</span>`)}
    ${metaItem('PAN of the deductor', `<span translate="no">${esc(s.deductor.pan ?? '')}</span>`)}
    ${metaItem(salary ? 'Employee' : 'Deductee', `${esc(s.deductee.name)}${s.deductee.ref ? `<br/><span class="muted">${esc(s.deductee.ref)}</span>` : ''}`)}
    ${metaItem(`PAN of the ${salary ? 'employee' : 'deductee'}`, `<span translate="no">${esc(s.deductee.pan ?? 'Not given')}</span>`)}
    ${metaItem('Quarter', `${esc(s.quarter.label)}<br/><span class="muted">${esc(formatDate(s.quarter.from))} to ${esc(formatDate(s.quarter.to))}</span>`)}
    ${metaItem('Return', `${esc(TDS_RETURN_FORM_LABELS[s.form])}${s.receiptNo ? `, receipt <span translate="no">${esc(s.receiptNo)}</span>` : ', not filed yet'}`)}
  </div>
  <h2>${salary ? 'Salary paid and tax deducted' : 'Amounts paid and tax deducted'}</h2>
  <table>
    <thead><tr><th class="c">Paid or credited on</th><th class="c">Section</th><th>For</th><th class="num">Amount (₹)</th><th class="num">Rate</th><th class="num">Tax deducted (₹)</th><th class="c">Deposited by challan</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total"><td colspan="3">Total</td><td class="num">${inr(s.total.paid)}</td><td></td><td class="num">${inr(s.total.tds)}</td><td class="num">${inr(s.total.deposited)} deposited</td></tr></tfoot>
  </table>
  <h2>Tax deposited</h2>
  ${challans}
  <p class="note">This is ${esc(s.deductor.name)}'s statement of the tax it deducted. The certificate that counts under section 203 is ${salary ? 'Form 16 Part A' : 'Form 16A'}, downloaded from TRACES once the quarter's return is processed.</p>`;
  return printDocHtml({
    letterhead,
    title: salary ? 'Statement of TDS on salary' : 'Statement of TDS',
    number: `${TDS_RETURN_FORM_LABELS[s.form]} ${s.quarter.label}`,
    date: s.deductee.name,
    stamp: s.receiptNo ? null : 'Return not filed yet',
    body,
    signs: [signLine('For the deductor')],
  });
}

export const openTdsStatementPrint = (s: TdsStatementDto, l: LetterheadDto) => openPrintWindow(buildTdsStatementHtml(s, l));

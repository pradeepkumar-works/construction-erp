import type { BookVoucherDto, LedgerDto, LetterheadDto } from '@erp/shared';
import { ACCOUNT_GROUP_LABELS, BOOK_SOURCE_LABELS, BOOK_VOUCHER_STATUS_LABELS, BOOK_VOUCHER_TYPE_LABELS } from '@erp/shared';
import { esc, inr, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { rupeesInWords } from '@/components/bills/billPrint';
import { formatDate, toNumber } from '@/lib/format';

/** A balance as Tally prints it: the amount with Dr or Cr. */
export const drCr = (v: string | number) => {
  const n = toNumber(v);
  return n ? `${inr(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}` : inr(0);
};

/** A party's ledger asks the party to confirm it; any other account's is a plain statement. */
export const isPartyLedger = (l: LedgerDto) => l.account.group === 'SUNDRY_CREDITORS' || l.account.group === 'SUNDRY_DEBTORS';

const ledgerTitle = (l: LedgerDto) =>
  l.account.group === 'CASH_IN_HAND' ? 'Cash book' : l.account.group === 'BANK_ACCOUNTS' ? 'Bank book' : isPartyLedger(l) ? 'Statement of account' : 'Ledger';

/**
 * An account's ledger for a period as the auditor or the party reads it: opening, each entry with what it was against and
 * the running balance, the totals and closing. A party's statement asks them to confirm the closing balance or say what
 * differs, and has a place for them to sign.
 */
export function buildLedgerPrintHtml(l: LedgerDto, letterhead: LetterheadDto, projectName?: string | null): string {
  const rows = l.entries
    .map(
      (e) => `<tr><td>${esc(formatDate(e.date))}</td><td>${esc(e.voucherNo)}<br/><span class="muted">${esc(BOOK_VOUCHER_TYPE_LABELS[e.type])}</span></td><td>${esc(e.against)}</td><td>${esc(e.narration)}</td>
      <td class="num">${e.debit ? inr(e.debit) : ''}</td><td class="num">${e.credit ? inr(e.credit) : ''}</td><td class="num">${drCr(e.balance)}</td></tr>`,
    )
    .join('');
  const party = isPartyLedger(l);
  const period = `${l.from ? formatDate(l.from) : 'The start'} to ${formatDate(l.to)}`;
  const body = `
  <div class="meta">
    ${metaItem('Account', `${esc(l.account.name)}${l.account.code ? ` <span class="muted">(${esc(l.account.code)})</span>` : ''}`)}
    ${metaItem('Group', esc(ACCOUNT_GROUP_LABELS[l.account.group]))}
    ${metaItem('Period', esc(period))}
    ${projectName ? metaItem('Project', esc(projectName)) : ''}
  </div>
  <table>
    <thead><tr><th>Date</th><th>Voucher</th><th>Against</th><th>Narration</th><th class="num">Debit (₹)</th><th class="num">Credit (₹)</th><th class="num">Balance (₹)</th></tr></thead>
    <tbody>
      <tr><td colspan="6">${l.from ? `Opening on ${esc(formatDate(l.from))}` : 'Opening'}</td><td class="num">${drCr(l.opening)}</td></tr>
      ${rows}
      <tr class="total"><td colspan="4">Closing on ${esc(formatDate(l.to))}</td><td class="num">${inr(l.debit)}</td><td class="num">${inr(l.credit)}</td><td class="num">${drCr(l.closing)}</td></tr>
    </tbody>
  </table>
  ${l.truncated ? '<p class="muted">Only the latest 2,000 entries are listed; the opening balance counts the rest.</p>' : ''}
  ${
    party
      ? `<h2>Balance confirmation</h2><p class="note">${toNumber(l.closing) ? `Our books show a balance of ₹ ${drCr(l.closing)} in your account on ${esc(formatDate(l.to))}.` : `Our books show nothing due either way in your account on ${esc(formatDate(l.to))}.`} Please sign and return a copy to confirm it, or tell us within 15 days what differs, with your statement for the same period.</p>`
      : ''
  }`;
  return printDocHtml({
    letterhead,
    under: projectName ?? undefined,
    title: ledgerTitle(l),
    number: l.account.name,
    date: period,
    body,
    signs: party ? [signLine(`For ${letterhead.name}`), signLine(`Confirmed for ${l.account.name}`)] : [signLine('Prepared by'), signLine('Checked by')],
  });
}

/**
 * A voucher for signatures: its lines with debit and credit, the amount in words, what it was for, and who prepared and
 * approved it. One not yet approved prints marked with its state.
 */
export function buildVoucherPrintHtml(v: BookVoucherDto, letterhead: LetterheadDto): string {
  const rows = v.lines
    .map(
      (x) => `<tr><td>${esc(x.accountName)}${x.projectCode ? ` <span class="muted">· ${esc(x.projectCode)}</span>` : ''}${x.narration ? `<br/><span class="muted">${esc(x.narration)}</span>` : ''}</td>
      <td class="num">${x.debit ? inr(x.debit) : ''}</td><td class="num">${x.credit ? inr(x.credit) : ''}</td></tr>`,
    )
    .join('');
  const debit = v.lines.reduce((s, x) => s + toNumber(x.debit ?? 0), 0);
  const credit = v.lines.reduce((s, x) => s + toNumber(x.credit ?? 0), 0);
  const body = `
  <div class="meta">
    ${metaItem('Type', esc(BOOK_VOUCHER_TYPE_LABELS[v.type]))}
    ${metaItem('Party', esc(v.party ?? ''))}
    ${metaItem('From', `${esc(BOOK_SOURCE_LABELS[v.source])}${v.reference ? `<br/><span class="muted">${esc(v.reference)}</span>` : ''}`)}
    ${v.projectName ? metaItem('Project', esc(v.projectName)) : ''}
  </div>
  <table>
    <thead><tr><th>Account</th><th class="num">Debit (₹)</th><th class="num">Credit (₹)</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td>Total</td><td class="num">${inr(debit)}</td><td class="num">${inr(credit)}</td></tr>
    </tbody>
  </table>
  <div class="words">${esc(rupeesInWords(v.amount))}</div>
  <h2>Narration</h2>
  <p class="note">${esc(v.narration)}</p>
  ${v.reviewNote ? `<p class="note muted">${esc(v.reviewNote)}</p>` : ''}`;
  return printDocHtml({
    letterhead,
    under: v.projectName ?? undefined,
    title: `${BOOK_VOUCHER_TYPE_LABELS[v.type]} voucher`,
    number: v.voucherNo,
    date: formatDate(v.date),
    stamp: v.status === 'APPROVED' ? null : BOOK_VOUCHER_STATUS_LABELS[v.status],
    body,
    signs: [signLine('Prepared by', v.preparedByName), signLine('Approved by', v.approvedByName), signLine(v.type === 'PAYMENT' ? 'Received by' : v.type === 'RECEIPT' ? 'Paid by' : 'Checked by')],
  });
}

export const openLedgerPrint = (l: LedgerDto, h: LetterheadDto, projectName?: string | null) => openPrintWindow(buildLedgerPrintHtml(l, h, projectName));
export const openVoucherPrint = (v: BookVoucherDto, h: LetterheadDto) => openPrintWindow(buildVoucherPrintHtml(v, h));

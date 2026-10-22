import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { MANUAL_VOUCHER_PREFIX, isMoneyGroup, type AccountGroup, type ManualVoucherType } from '@erp/shared';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const rupees = (v: Prisma.Decimal) => `₹${v.toFixed(2)}`;

/** One line of a voucher as the rules see it: the account's group, and the debit or the credit. */
export interface RuleLine {
  group: AccountGroup;
  debit: Prisma.Decimal.Value;
  credit: Prisma.Decimal.Value;
}

/**
 * What is wrong with a hand-made voucher, or null: at least two lines, each a debit or a credit, debits equal to credits,
 * and money moving the way the type says (a payment pays out of cash or bank, a receipt takes into it, a contra moves
 * between them, a journal leaves them alone).
 */
export function voucherProblem(type: ManualVoucherType, lines: RuleLine[]): string | null {
  if (lines.length < 2) return 'A voucher needs at least two lines: what is debited and what is credited';
  let dr = D(0);
  let cr = D(0);
  for (const [i, l] of lines.entries()) {
    const d = D(l.debit);
    const c = D(l.credit);
    if (d.isNeg() || c.isNeg()) return `Line ${i + 1}: amounts cannot be below zero`;
    if (d.gt(0) === c.gt(0)) return `Line ${i + 1}: enter a debit or a credit, not ${d.gt(0) ? 'both' : 'neither'}`;
    dr = dr.add(d);
    cr = cr.add(c);
  }
  if (!dr.eq(cr)) return `Debits ${rupees(dr)} and credits ${rupees(cr)} differ by ${rupees(dr.sub(cr).abs())}`;
  const money = (l: RuleLine) => isMoneyGroup(l.group);
  if (type === 'PAYMENT' && !lines.some((l) => money(l) && D(l.credit).gt(0))) return 'A payment credits the cash or bank account the money goes out of';
  if (type === 'RECEIPT' && !lines.some((l) => money(l) && D(l.debit).gt(0))) return 'A receipt debits the cash or bank account the money comes into';
  if (type === 'CONTRA' && !lines.every(money)) return 'A contra moves money between cash and bank accounts only; use a journal or payment for anything else';
  if (type === 'JOURNAL' && lines.some(money)) return 'Money in or out of cash or bank is a payment, receipt or contra, not a journal';
  return null;
}

/** The financial year (April to March) of a YYYY-MM-DD date, as in voucher numbers: 2026-27. */
export function fyCode(date: string): string {
  const y = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** A hand-made voucher's number: JV/2026-27/0001, counted per type and financial year. */
export const voucherNumber = (type: ManualVoucherType, date: string, seq: number) => `${MANUAL_VOUCHER_PREFIX[type]}/${fyCode(date)}/${String(seq).padStart(4, '0')}`;

/** The sequence in a voucher number of that type and year, or 0 when it is not one. */
export function voucherSeq(type: ManualVoucherType, date: string, voucherNo: string): number {
  const prefix = `${MANUAL_VOUCHER_PREFIX[type]}/${fyCode(date)}/`;
  return voucherNo.startsWith(prefix) ? Number(voucherNo.slice(prefix.length)) || 0 : 0;
}

/** Running balances (debit positive) after each entry, from the opening balance. */
export function runningBalances(opening: Prisma.Decimal.Value, entries: { debit: Prisma.Decimal.Value; credit: Prisma.Decimal.Value }[]): Prisma.Decimal[] {
  let b = D(opening);
  return entries.map((e) => (b = b.add(D(e.debit)).sub(D(e.credit))));
}

/** What a ledger line was against: the other side's account, or the first of several. */
export function againstOf(lines: { accountId: string; name: string; debit: Prisma.Decimal.Value }[], line: { accountId: string; debit: Prisma.Decimal.Value }): string {
  const debitSide = D(line.debit).gt(0);
  const other = [...new Set(lines.filter((l) => l.accountId !== line.accountId && D(l.debit).gt(0) !== debitSide).map((l) => l.name))];
  if (!other.length) return '';
  return other.length === 1 ? other[0] : `${other[0]} and ${other.length - 1} more`;
}

/** A fingerprint of a posted voucher, so the next posting run rewrites only the vouchers whose record changed. */
export function voucherHash(v: { date: string; number: string; reference: string | null; narration: string; projectId: string | null; lines: { key: string; projectId: string | null; amount: string }[] }): string {
  return createHash('sha1').update(JSON.stringify(v)).digest('hex');
}

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ACCOUNT_GROUP_NATURE,
  STATEMENT_LINE_LABELS,
  STATEMENT_LINE_NATURE,
  statementLineOf,
  type AccountGroup,
  type StatementLine,
  type StatementLineDto,
} from '@erp/shared';
import { money } from '../common/serialize';
import { fyCode } from '../books/books-rules';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** The first and last day of a financial year from its code: 2025-26 is 2025-04-01 to 2026-03-31. */
export function fyRange(code: string): { from: string; to: string } {
  const start = Number(code.slice(0, 4));
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** The financial year a day falls in, and the years from one day to another, oldest first. */
export const fyOf = (date: string) => fyCode(date);
export function fyBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let y = Number(fyCode(from).slice(0, 4)); y <= Number(fyCode(to).slice(0, 4)); y++) out.push(fyCode(`${y}-04-01`));
  return out;
}

/** The same day a year before (29 February becomes 28 February). */
export function yearBefore(date: string): string {
  const y = Number(date.slice(0, 4)) - 1;
  const md = date.slice(5);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}-${md === '02-29' && !leap ? '02-28' : md}`;
}

/** The day before a YYYY-MM-DD day. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface AccountFigure {
  accountId: string;
  name: string;
  key: string;
  group: AccountGroup;
  statementLine: StatementLine | null;
  /** Debit positive, this period and the comparative one */
  balance: Prisma.Decimal;
  previous: Prisma.Decimal;
}

/**
 * The statement lines from accounts' balances: each account lands where `statementLineOf` puts it (separately for the
 * period and the comparative, as a balance may change sides) and shows in the line's own sense, income and liabilities
 * credit positive. Lines are returned in `order`, including those with nothing so the layout stays fixed.
 */
export function statementLines(accounts: AccountFigure[], order: StatementLine[]): StatementLineDto[] {
  const byLine = new Map<StatementLine, { amount: Prisma.Decimal; previous: Prisma.Decimal; accounts: Map<string, { name: string; amount: Prisma.Decimal; previous: Prisma.Decimal }> }>();
  const slot = (line: StatementLine) => {
    let s = byLine.get(line);
    if (!s) byLine.set(line, (s = { amount: D(0), previous: D(0), accounts: new Map() }));
    return s;
  };
  const sense = (line: StatementLine, v: Prisma.Decimal) => (STATEMENT_LINE_NATURE[line] === 'INCOME' || STATEMENT_LINE_NATURE[line] === 'LIABILITY' ? v.neg() : v);
  for (const a of accounts) {
    for (const which of ['amount', 'previous'] as const) {
      const v = which === 'amount' ? a.balance : a.previous;
      if (v.isZero()) continue;
      const line = statementLineOf(a, v.toNumber());
      if (!order.includes(line)) continue;
      const s = slot(line);
      const x = sense(line, v);
      s[which] = s[which].add(x);
      const acc = s.accounts.get(a.accountId) ?? { name: a.name, amount: D(0), previous: D(0) };
      acc[which] = acc[which].add(x);
      s.accounts.set(a.accountId, acc);
    }
  }
  return order.map((line) => {
    const s = byLine.get(line);
    return {
      line,
      label: STATEMENT_LINE_LABELS[line],
      amount: money(s?.amount ?? 0)!,
      previous: money(s?.previous ?? 0)!,
      accounts: [...(s?.accounts ?? new Map()).entries()]
        .map(([accountId, x]) => ({ accountId, name: x.name, amount: money(x.amount)!, previous: money(x.previous)! }))
        .sort((p, q) => Math.abs(Number(q.amount)) - Math.abs(Number(p.amount)) || p.name.localeCompare(q.name)),
    };
  });
}

export const sumLines = (lines: StatementLineDto[], which: 'amount' | 'previous') => lines.reduce((s, l) => s.add(l[which]), D(0));

/** Whether a group is the profit and loss account's (its balances start again each year). */
export const isProfitLoss = (g: AccountGroup) => ACCOUNT_GROUP_NATURE[g] === 'INCOME' || ACCOUNT_GROUP_NATURE[g] === 'EXPENSE';

/**
 * The lines of a year's closing voucher: every income and expense balance (per project) reversed, and the difference to
 * the profit and loss account in reserves. `profit` is credit positive.
 */
export function closingLines(balances: { accountId: string; projectId: string | null; balance: Prisma.Decimal }[], profitAccountId: string) {
  const lines = balances
    .filter((b) => !b.balance.isZero())
    .map((b) => ({ accountId: b.accountId, projectId: b.projectId, debit: b.balance.lt(0) ? b.balance.neg() : D(0), credit: b.balance.gt(0) ? b.balance : D(0) }));
  const dr = lines.reduce((s, l) => s.add(l.debit), D(0));
  const cr = lines.reduce((s, l) => s.add(l.credit), D(0));
  const profit = dr.sub(cr);
  if (!profit.isZero()) lines.push({ accountId: profitAccountId, projectId: null, debit: profit.lt(0) ? profit.neg() : D(0), credit: profit.gt(0) ? profit : D(0) });
  return { lines, profit };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A bank's date as YYYY-MM-DD: 05/04/2026, 05-04-26, 05-Apr-2026, 5 Apr 2026, 2026-04-05 (days first, as Indian banks write). */
export function bankDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const s = String(raw ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s.split(/\s+/)[0]);
  if (m) return ymd(year(m[3]), +m[2], +m[1]);
  m = /^(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/,-]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return mo ? ymd(year(m[3]), mo, +m[1]) : null;
  }
  return null;
}
const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

/** A bank's amount: "1,23,456.50", "1234.5 Cr", "-", blank. Dr makes it negative (an overdrawn balance). */
export function bankAmount(raw: unknown): Prisma.Decimal | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? D(raw).toDecimalPlaces(2) : null;
  const s = String(raw ?? '').trim();
  if (!s || s === '-') return null;
  const dr = /\bdr\.?$/i.test(s);
  const n = s.replace(/\b(cr|dr)\.?$/i, '').replace(/[₹,\s]|INR|Rs\.?/gi, '');
  if (!/^-?\d+(\.\d+)?$/.test(n)) return null;
  const v = D(n).toDecimalPlaces(2);
  return dr ? v.abs().neg() : v;
}

const norm = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z/]+/g, ' ').trim();

/** Which column of the header row holds what; null when the row is not a statement's header. */
function columnsOf(header: unknown[]) {
  const h = header.map(norm);
  const find = (...tests: ((x: string) => boolean)[]) => {
    for (const t of tests) {
      const i = h.findIndex(t);
      if (i >= 0) return i;
    }
    return -1;
  };
  const date = find((x) => /^(txn|tran|transaction|posting) date$/.test(x), (x) => x === 'date', (x) => /\bdate\b/.test(x) && !/value/.test(x), (x) => /\bdate\b|\bdt\b/.test(x));
  const description = find((x) => /narration|description|particulars|remarks|details/.test(x));
  const reference = find((x) => /cheque|chq|ref/.test(x));
  const withdrawal = find((x) => /withdrawal/.test(x), (x) => /^debit( amount)?\b/.test(x), (x) => x === 'dr' || x === 'debits');
  const deposit = find((x) => /deposit/.test(x), (x) => /^credit( amount)?\b/.test(x), (x) => x === 'cr' || x === 'credits');
  const amount = find((x) => /^(transaction )?amount\b/.test(x));
  const drcr = find((x) => /^(dr ?\/ ?cr|cr ?\/ ?dr|type|debit ?\/ ?credit)$/.test(x));
  const balance = find((x) => /balance|^bal$/.test(x));
  if (date < 0 || description < 0) return null;
  if ((withdrawal < 0 || deposit < 0) && amount < 0) return null;
  return { date, description, reference, withdrawal, deposit, amount, drcr, balance };
}

export interface ReadStatement {
  rows: { date: string; description: string; reference: string | null; withdrawal: Prisma.Decimal; deposit: Prisma.Decimal; balance: Prisma.Decimal | null; seq: number }[];
  /** Rows with a date that could not be read, with why */
  problems: string[];
}

/**
 * The transactions in a bank statement's cells (CSV or Excel, as the bank gives it): the header row is found among the
 * first rows by its column names (date, narration, withdrawal and deposit, or amount with Dr/Cr, balance), and every
 * row below with a date is read; opening and total lines without a date are left out.
 */
export function readStatement(cells: unknown[][]): ReadStatement {
  const at = cells.slice(0, 40).findIndex((r) => columnsOf(r) !== null);
  if (at < 0) throw new Error('The file has no header row with a date, a narration and the amounts. Download the statement from the bank as CSV or Excel and try again.');
  const c = columnsOf(cells[at])!;
  const rows: ReadStatement['rows'] = [];
  const problems: string[] = [];
  cells.slice(at + 1).forEach((r, i) => {
    const date = bankDate(r[c.date]);
    if (!date) return;
    const line = at + i + 2;
    let withdrawal = c.withdrawal >= 0 ? bankAmount(r[c.withdrawal]) : null;
    let deposit = c.deposit >= 0 ? bankAmount(r[c.deposit]) : null;
    if (c.withdrawal < 0 || c.deposit < 0) {
      const amt = bankAmount(r[c.amount]);
      const side = c.drcr >= 0 ? norm(r[c.drcr]) : '';
      if (amt && (side.startsWith('d') || (!side && amt.lt(0)))) withdrawal = amt.abs();
      else if (amt) deposit = amt.abs();
    }
    withdrawal = withdrawal?.abs() ?? D(0);
    deposit = deposit?.abs() ?? D(0);
    if (withdrawal.isZero() && deposit.isZero()) {
      problems.push(`Row ${line}: no withdrawal or deposit`);
      return;
    }
    if (!withdrawal.isZero() && !deposit.isZero()) {
      problems.push(`Row ${line}: both a withdrawal and a deposit`);
      return;
    }
    const description = String(r[c.description] ?? '').trim().replace(/\s+/g, ' ').slice(0, 500);
    const ref = c.reference >= 0 ? String(r[c.reference] ?? '').trim() : '';
    rows.push({ date, description: description || '(no narration)', reference: ref && ref !== '0' && ref !== '-' ? ref.slice(0, 100) : null, withdrawal, deposit, balance: c.balance >= 0 ? bankAmount(r[c.balance]) : null, seq: rows.length });
  });
  return { rows, problems };
}

/** A statement row's fingerprint; `n` counts identical rows before it in the same file, so both are kept. */
export function rowFingerprint(r: { date: string; description: string; reference: string | null; withdrawal: Prisma.Decimal; deposit: Prisma.Decimal; balance: Prisma.Decimal | null }, n: number): string {
  const base = [r.date, r.description.toLowerCase(), r.reference ?? '', r.withdrawal.toFixed(2), r.deposit.toFixed(2), r.balance?.toFixed(2) ?? ''].join('|');
  return createHash('sha1').update(`${base}#${n}`).digest('hex');
}

export interface MatchStatementLine {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  withdrawal: Prisma.Decimal;
  deposit: Prisma.Decimal;
}
export interface MatchBookLine {
  id: string;
  date: string;
  voucherNo: string;
  reference: string | null;
  /** Debit (money into the bank) and credit (out of it) */
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}

const daysApart = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
/** A bank clears a book entry from up to this many days after it (cheques), or a few days before (dated late in the books). */
export const MATCH_DAYS_AFTER = 15;
export const MATCH_DAYS_BEFORE = 3;

/** Whether the statement's words name the book entry's reference or number (a cheque number, a UTR). */
function namesIt(s: MatchStatementLine, b: MatchBookLine): boolean {
  const words = `${s.description} ${s.reference ?? ''}`.toLowerCase();
  return [b.reference, b.voucherNo].some((r) => {
    const t = (r ?? '').toLowerCase().replace(/\s+/g, '');
    return t.length >= 4 && words.replace(/\s+/g, '').includes(t);
  });
}

/**
 * Pairs of a statement line and a book line, one to one: the same amount on the same side (a deposit is a debit in the
 * books), the bank's day from three days before the book's to fifteen after, preferring one whose reference the bank
 * names and then the nearest day. Lines already matched are not passed in.
 */
export function autoMatch(statement: MatchStatementLine[], book: MatchBookLine[]): { statementLineId: string; bookLineId: string }[] {
  const free = new Set(book.map((b) => b.id));
  const out: { statementLineId: string; bookLineId: string }[] = [];
  const ordered = [...statement].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of ordered) {
    const deposit = s.deposit.gt(0);
    const amount = deposit ? s.deposit : s.withdrawal;
    const candidates = book.filter((b) => {
      if (!free.has(b.id)) return false;
      if (!(deposit ? b.debit : b.credit).eq(amount)) return false;
      const gap = daysApart(s.date, b.date);
      return gap >= -MATCH_DAYS_BEFORE && gap <= MATCH_DAYS_AFTER;
    });
    if (!candidates.length) continue;
    candidates.sort((a, b) => Number(namesIt(s, b)) - Number(namesIt(s, a)) || Math.abs(daysApart(s.date, a.date)) - Math.abs(daysApart(s.date, b.date)) || a.date.localeCompare(b.date));
    free.delete(candidates[0].id);
    out.push({ statementLineId: s.id, bookLineId: candidates[0].id });
  }
  return out;
}

/**
 * The bank reconciliation statement on a day. Book entries up to the day not cleared by a statement line up to the day
 * are cheques not presented (payments) or deposits not cleared (receipts); statement lines with no book entry are the
 * bank's own (charges, interest). Book entries before the statement's first day are taken as cleared.
 */
export function reconcile(input: {
  asOn: string;
  booksBalance: Prisma.Decimal;
  statementFrom: string | null;
  book: { date: string; debit: Prisma.Decimal; credit: Prisma.Decimal; clearedOn: string | null }[];
  statement: { date: string; withdrawal: Prisma.Decimal; deposit: Prisma.Decimal; matched: boolean; balance: Prisma.Decimal | null; seq: number }[];
}) {
  const { asOn, statementFrom } = input;
  let notPresented = D(0);
  let notCleared = D(0);
  for (const b of input.book) {
    if (b.date > asOn || (statementFrom && b.date < statementFrom)) continue;
    if (b.clearedOn && b.clearedOn <= asOn) continue;
    notPresented = notPresented.add(b.credit);
    notCleared = notCleared.add(b.debit);
  }
  let bankIn = D(0);
  let bankOut = D(0);
  for (const s of input.statement) {
    if (s.date > asOn || s.matched) continue;
    bankIn = bankIn.add(s.deposit);
    bankOut = bankOut.add(s.withdrawal);
  }
  const expected = input.booksBalance.add(notPresented).sub(notCleared).add(bankIn).sub(bankOut);
  const last = input.statement
    .filter((s) => s.date <= asOn && s.balance !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)
    .at(-1);
  const statementBalance = last?.balance ?? null;
  return { notPresented, notCleared, bankOnlyDeposits: bankIn, bankOnlyWithdrawals: bankOut, expectedBankBalance: expected, statementBalance, difference: statementBalance ? statementBalance.sub(expected) : null };
}

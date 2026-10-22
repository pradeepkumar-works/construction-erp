import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACCOUNT_GROUP_NATURE,
  BALANCE_SHEET_SECTIONS,
  PROFIT_LOSS_EXPENSES,
  PROFIT_LOSS_INCOME,
  canApproveVouchers,
  canKeepBooks,
  statementLineOf,
  type AccountGroup,
  type BalanceSheetDto,
  type BankBookLineDto,
  type BankImportResultDto,
  type BankReconciliationDto,
  type BankStatementLineDto,
  type BooksHeldDto,
  type BooksYearDto,
  type FinancialYearDto,
  type ProfitLossDto,
  type StatementLine,
  type TrialBalanceByProjectDto,
  type TrialBalanceDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, formatDay, iso, money, parseDate } from '../common/serialize';
import { BooksService } from '../books/books.service';
import { againstOf } from '../books/books-rules';
import {
  MATCH_DAYS_AFTER,
  MATCH_DAYS_BEFORE,
  autoMatch,
  closingLines,
  dayBefore,
  fyBetween,
  fyOf,
  fyRange,
  isProfitLoss,
  readStatement,
  reconcile,
  rowFingerprint,
  statementLines,
  sumLines,
  yearBefore,
  type AccountFigure,
} from './statements-rules';
import { BankImportDto, BankMatchDto, BankQuery, LockDto, PeriodQuery, ProfitLossQuery, SaveOpeningDto } from './statements.dto';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const today = () => dateOnly(new Date())!;
const addDays = (date: string, n: number) => {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return dateOnly(d)!;
};
/** The system accounts the statements make: where a year's profit goes, and what the opening balances do not explain. */
const PROFIT_KEY = 'PROFIT_AND_LOSS';
const OPENING_DIFF_KEY = 'OPENING_DIFFERENCE';
const SYSTEM_ACCOUNTS: Record<string, { name: string; group: AccountGroup }> = {
  [PROFIT_KEY]: { name: 'Profit & Loss A/c', group: 'RESERVES_SURPLUS' },
  [OPENING_DIFF_KEY]: { name: 'Difference in opening balances', group: 'SUSPENSE' },
};
const NO_PROJECT = 'none';

/**
 * Financial statements (v6 item 103): the trial balance, profit and loss and balance sheet from the books' approved
 * vouchers, the bank reconciliation, opening balances, the lock date and the year's close. A year's close is a voucher
 * that empties income and expenses into the profit and loss account; the statements leave it out of the year's own
 * movements and count it in balances after.
 */
@Injectable()
export class StatementsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private books: BooksService) {}

  private assertKeep(user: RequestUser) {
    if (!canKeepBooks(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts see the statements');
  }
  private assertApprover(user: RequestUser) {
    if (!canApproveVouchers(user.roleKey)) throw new ForbiddenException('Only management or an admin locks the books or closes a year');
  }

  // ----- Sums -----

  /** Debit less credit of each account (and project, when asked) in approved vouchers matching `voucher`. */
  private async sums(organizationId: string, voucher: Prisma.BookVoucherWhereInput, projectId?: string, byProject = false) {
    const rows = await this.prisma.bookLine.groupBy({
      by: byProject ? ['accountId', 'projectId'] : ['accountId'],
      where: { organizationId, ...(projectId ? { projectId } : {}), voucher: { status: 'APPROVED', ...voucher } },
      _sum: { debit: true, credit: true },
    });
    return rows.map((r) => ({ accountId: r.accountId, projectId: (r as { projectId?: string | null }).projectId ?? null, debit: D(r._sum.debit ?? 0), credit: D(r._sum.credit ?? 0) }));
  }
  private byAccount(rows: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[]) {
    const m = new Map<string, Prisma.Decimal>();
    for (const r of rows) m.set(r.accountId, (m.get(r.accountId) ?? D(0)).add(r.debit).sub(r.credit));
    return m;
  }
  /** Movements in a period, leaving out the year's close so income and expenses show what the year earned. */
  private period = (from: string, to: string): Prisma.BookVoucherWhereInput => ({ date: { gte: parseDate(from), lte: parseDate(to) }, source: { not: 'YEAR_CLOSE' } });
  private upTo = (day: string): Prisma.BookVoucherWhereInput => ({ date: { lte: parseDate(day) } });
  private before = (day: string): Prisma.BookVoucherWhereInput => ({ date: { lt: parseDate(day) } });

  private accounts(organizationId: string) {
    return this.prisma.ledgerAccount.findMany({ where: { organizationId }, select: { id: true, key: true, name: true, code: true, group: true, statementLine: true }, orderBy: { name: 'asc' } });
  }

  private checkPeriod(from: string, to: string) {
    if (from > to) throw new BadRequestException('From is after to. Choose an earlier from date.');
  }

  // ----- Trial balance -----

  async trialBalance(user: RequestUser, q: PeriodQuery): Promise<TrialBalanceDto> {
    this.assertKeep(user);
    this.checkPeriod(q.from, q.to);
    await this.books.fresh(user);
    const org = user.organizationId;
    const [accounts, opening, moved] = await Promise.all([this.accounts(org), this.sums(org, this.before(q.from), q.projectId), this.sums(org, this.period(q.from, q.to), q.projectId)]);
    const open = this.byAccount(opening);
    const mv = new Map(moved.map((r) => [r.accountId, r]));
    const t = { openingDebit: D(0), openingCredit: D(0), debit: D(0), credit: D(0), closingDebit: D(0), closingCredit: D(0) };
    const rows = accounts.flatMap((a) => {
      const o = open.get(a.id) ?? D(0);
      const m = mv.get(a.id);
      const dr = m?.debit ?? D(0);
      const cr = m?.credit ?? D(0);
      if (o.isZero() && dr.isZero() && cr.isZero()) return [];
      const c = o.add(dr).sub(cr);
      t.openingDebit = t.openingDebit.add(o.gt(0) ? o : 0);
      t.openingCredit = t.openingCredit.add(o.lt(0) ? o.neg() : 0);
      t.debit = t.debit.add(dr);
      t.credit = t.credit.add(cr);
      t.closingDebit = t.closingDebit.add(c.gt(0) ? c : 0);
      t.closingCredit = t.closingCredit.add(c.lt(0) ? c.neg() : 0);
      return [{ accountId: a.id, name: a.name, code: a.code, group: a.group, opening: money(o)!, debit: money(dr)!, credit: money(cr)!, closing: money(c)! }];
    });
    return {
      from: q.from,
      to: q.to,
      projectId: q.projectId ?? null,
      rows,
      totals: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, money(v)!])) as TrialBalanceDto['totals'],
    };
  }

  /** Each account's movement in the period on each project, with head office (no project) as its own column. */
  async trialBalanceByProject(user: RequestUser, q: PeriodQuery): Promise<TrialBalanceByProjectDto> {
    this.assertKeep(user);
    this.checkPeriod(q.from, q.to);
    await this.books.fresh(user);
    const org = user.organizationId;
    const [accounts, moved] = await Promise.all([this.accounts(org), this.sums(org, this.period(q.from, q.to), undefined, true)]);
    const projects = await this.projectsOf(org, moved.map((r) => r.projectId));
    const cells = new Map<string, Record<string, Prisma.Decimal>>();
    for (const r of moved) {
      const net = r.debit.sub(r.credit);
      if (net.isZero()) continue;
      const row = cells.get(r.accountId) ?? {};
      const col = r.projectId ?? NO_PROJECT;
      row[col] = (row[col] ?? D(0)).add(net);
      cells.set(r.accountId, row);
    }
    return {
      from: q.from,
      to: q.to,
      projects,
      rows: accounts
        .filter((a) => cells.has(a.id))
        .map((a) => {
          const row = cells.get(a.id)!;
          return { accountId: a.id, name: a.name, group: a.group, cells: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, money(v)!])), total: money(Object.values(row).reduce((s, v) => s.add(v), D(0)))! };
        }),
    };
  }

  private async projectsOf(organizationId: string, ids: (string | null)[]) {
    const want = [...new Set(ids.filter((p): p is string => !!p))];
    const rows = want.length ? await this.prisma.project.findMany({ where: { organizationId, id: { in: want } }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }) : [];
    return rows;
  }

  // ----- Profit and loss -----

  async profitLoss(user: RequestUser, q: ProfitLossQuery): Promise<ProfitLossDto> {
    this.assertKeep(user);
    this.checkPeriod(q.from, q.to);
    await this.books.fresh(user);
    const org = user.organizationId;
    const previousFrom = yearBefore(q.from);
    const previousTo = yearBefore(q.to);
    const [accounts, now, before] = await Promise.all([this.accounts(org), this.sums(org, this.period(q.from, q.to), q.projectId), this.sums(org, this.period(previousFrom, previousTo), q.projectId)]);
    const n = this.byAccount(now);
    const p = this.byAccount(before);
    const figures: AccountFigure[] = accounts
      .filter((a) => isProfitLoss(a.group))
      .map((a) => ({ accountId: a.id, name: a.name, key: a.key, group: a.group, statementLine: a.statementLine, balance: n.get(a.id) ?? D(0), previous: p.get(a.id) ?? D(0) }));
    const income = statementLines(figures, PROFIT_LOSS_INCOME);
    const expenses = statementLines(figures, PROFIT_LOSS_EXPENSES);
    const [tax] = statementLines(figures, ['TAX']);
    const pair = (f: (w: 'amount' | 'previous') => Prisma.Decimal) => ({ amount: money(f('amount'))!, previous: money(f('previous'))! });
    const totalIncome = (w: 'amount' | 'previous') => sumLines(income, w);
    const totalExpenses = (w: 'amount' | 'previous') => sumLines(expenses, w);
    const pbt = (w: 'amount' | 'previous') => totalIncome(w).sub(totalExpenses(w));
    const dto: ProfitLossDto = {
      from: q.from,
      to: q.to,
      previousFrom,
      previousTo,
      projectId: q.projectId ?? null,
      income,
      expenses,
      totalIncome: pair(totalIncome),
      totalExpenses: pair(totalExpenses),
      profitBeforeTax: pair(pbt),
      tax,
      profit: pair((w) => pbt(w).sub(tax[w])),
    };
    if (q.byProject && !q.projectId) {
      const rows = await this.sums(org, this.period(q.from, q.to), undefined, true);
      const projects = await this.projectsOf(org, rows.map((r) => r.projectId));
      const account = new Map(accounts.map((a) => [a.id, a]));
      const lines = new Map<StatementLine, Record<string, Prisma.Decimal>>();
      const profit: Record<string, Prisma.Decimal> = {};
      for (const r of rows) {
        const a = account.get(r.accountId);
        if (!a || !isProfitLoss(a.group)) continue;
        const net = r.debit.sub(r.credit);
        if (net.isZero()) continue;
        const line = statementLineOf(a, net.toNumber());
        const col = r.projectId ?? NO_PROJECT;
        const row = lines.get(line) ?? {};
        const income = PROFIT_LOSS_INCOME.includes(line);
        row[col] = (row[col] ?? D(0)).add(income ? net.neg() : net);
        lines.set(line, row);
        profit[col] = (profit[col] ?? D(0)).sub(net);
      }
      const asText = (r: Record<string, Prisma.Decimal>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, money(v)!]));
      dto.byProject = {
        projects,
        lines: [...PROFIT_LOSS_INCOME, ...PROFIT_LOSS_EXPENSES, 'TAX' as const].map((line) => ({ line, cells: asText(lines.get(line) ?? {}) })),
        profit: asText(profit),
      };
    }
    return dto;
  }

  // ----- Balance sheet -----

  async balanceSheet(user: RequestUser, asOn: string): Promise<BalanceSheetDto> {
    this.assertKeep(user);
    await this.books.fresh(user);
    const org = user.organizationId;
    const previousAsOn = yearBefore(asOn);
    const [accounts, now, before] = await Promise.all([this.accounts(org), this.sums(org, this.upTo(asOn)), this.sums(org, this.upTo(previousAsOn))]);
    const n = this.byAccount(now);
    const p = this.byAccount(before);
    const figures: AccountFigure[] = [];
    let notClosed = D(0);
    let notClosedBefore = D(0);
    for (const a of accounts) {
      const balance = n.get(a.id) ?? D(0);
      const previous = p.get(a.id) ?? D(0);
      if (isProfitLoss(a.group)) {
        notClosed = notClosed.add(balance);
        notClosedBefore = notClosedBefore.add(previous);
      } else figures.push({ accountId: a.id, name: a.name, key: a.key, group: a.group, statementLine: a.statementLine, balance, previous });
    }
    // Income and expenses not yet closed into reserves are this period's profit (a credit balance).
    figures.push({ accountId: PROFIT_KEY, name: 'Profit not yet closed into reserves', key: 'PROFIT_NOT_CLOSED', group: 'RESERVES_SURPLUS', statementLine: 'RESERVES', balance: notClosed, previous: notClosedBefore });
    const sections = BALANCE_SHEET_SECTIONS.map((s) => {
      const lines = statementLines(figures, s.lines);
      return { key: s.key, label: s.label, side: s.side, lines, total: { amount: money(sumLines(lines, 'amount'))!, previous: money(sumLines(lines, 'previous'))! } };
    });
    const side = (which: 'ASSET' | 'LIABILITY', w: 'amount' | 'previous') => sections.filter((s) => s.side === which).reduce((t, s) => t.add(s.total[w]), D(0));
    return {
      asOn,
      previousAsOn,
      sections,
      totalLiabilities: { amount: money(side('LIABILITY', 'amount'))!, previous: money(side('LIABILITY', 'previous'))! },
      totalAssets: { amount: money(side('ASSET', 'amount'))!, previous: money(side('ASSET', 'previous'))! },
      profitNotClosed: { amount: money(notClosed.neg())!, previous: money(notClosedBefore.neg())! },
      difference: money(side('ASSET', 'amount').sub(side('LIABILITY', 'amount')))!,
    };
  }

  // ----- Bank reconciliation -----

  private async bankAccount(user: RequestUser, accountId: string) {
    const a = await this.prisma.ledgerAccount.findFirst({ where: { id: accountId, organizationId: user.organizationId } });
    if (!a) throw new NotFoundException('Account not found');
    if (a.group !== 'BANK_ACCOUNTS') throw new BadRequestException(`${a.name} is not a bank account. Choose one under Bank Accounts.`);
    return a;
  }

  async bank(user: RequestUser, q: BankQuery): Promise<BankReconciliationDto> {
    this.assertKeep(user);
    await this.books.fresh(user);
    const org = user.organizationId;
    const account = await this.bankAccount(user, q.accountId);
    const from = q.from ?? addDays(q.asOn, -60);
    const [first, booksSum, statement, book] = await Promise.all([
      this.prisma.bankStatementLine.findFirst({ where: { organizationId: org, accountId: account.id }, orderBy: [{ date: 'asc' }, { seq: 'asc' }], select: { date: true } }),
      this.prisma.bookLine.aggregate({ where: { organizationId: org, accountId: account.id, voucher: { status: 'APPROVED', date: { lte: parseDate(q.asOn) } } }, _sum: { debit: true, credit: true } }),
      this.prisma.bankStatementLine.findMany({
        where: { organizationId: org, accountId: account.id, date: { lte: parseDate(q.asOn) } },
        include: { bookLine: { select: { voucher: { select: { voucherNo: true, date: true } } } } },
        orderBy: [{ date: 'asc' }, { seq: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.bookLine.findMany({
        where: { organizationId: org, accountId: account.id, voucher: { status: 'APPROVED', date: { lte: parseDate(q.asOn) } } },
        include: {
          statementLine: { select: { id: true, date: true } },
          voucher: { select: { id: true, voucherNo: true, date: true, narration: true, reference: true, createdAt: true, lines: { select: { accountId: true, debit: true, account: { select: { name: true } } } } } },
        },
      }),
    ]);
    const statementFrom = dateOnly(first?.date);
    const booksBalance = D(booksSum._sum.debit ?? 0).sub(booksSum._sum.credit ?? 0);
    const r = reconcile({
      asOn: q.asOn,
      booksBalance,
      statementFrom,
      book: book.map((b) => ({ date: dateOnly(b.voucher.date)!, debit: b.debit, credit: b.credit, clearedOn: dateOnly(b.statementLine?.date) })),
      statement: statement.map((s) => ({ date: dateOnly(s.date)!, withdrawal: s.withdrawal, deposit: s.deposit, balance: s.balance, seq: s.seq, matched: !!s.bookLine && dateOnly(s.bookLine.voucher.date)! <= q.asOn })),
    });
    const statementRows: BankStatementLineDto[] = statement
      .filter((s) => dateOnly(s.date)! >= from || !s.bookLineId)
      .map((s) => ({
        id: s.id,
        date: dateOnly(s.date)!,
        description: s.description,
        reference: s.reference,
        withdrawal: s.withdrawal.gt(0) ? money(s.withdrawal) : null,
        deposit: s.deposit.gt(0) ? money(s.deposit) : null,
        balance: money(s.balance),
        bookLineId: s.bookLineId,
        voucherNo: s.bookLine?.voucher.voucherNo ?? null,
        voucherDate: dateOnly(s.bookLine?.voucher.date),
        matchedBy: (s.matchedBy as 'AUTO' | 'HAND' | null) ?? null,
      }));
    const bookRows: BankBookLineDto[] = book
      .filter((b) => {
        const d = dateOnly(b.voucher.date)!;
        if (statementFrom && d < statementFrom) return false;
        return d >= from || !b.statementLine;
      })
      .sort((a, b) => a.voucher.date.getTime() - b.voucher.date.getTime() || a.voucher.createdAt.getTime() - b.voucher.createdAt.getTime())
      .map((b) => ({
        lineId: b.id,
        voucherId: b.voucher.id,
        voucherNo: b.voucher.voucherNo,
        date: dateOnly(b.voucher.date)!,
        against: againstOf(
          b.voucher.lines.map((l) => ({ accountId: l.accountId, name: l.account.name, debit: l.debit })),
          b,
        ),
        narration: b.narration ?? b.voucher.narration,
        reference: b.voucher.reference,
        deposit: b.debit.gt(0) ? money(b.debit) : null,
        withdrawal: b.credit.gt(0) ? money(b.credit) : null,
        statementLineId: b.statementLine?.id ?? null,
        statementDate: dateOnly(b.statementLine?.date),
      }));
    return {
      account: { id: account.id, name: account.name, balance: money(booksBalance)! },
      asOn: q.asOn,
      statementFrom,
      booksBalance: money(booksBalance)!,
      notPresented: money(r.notPresented)!,
      notCleared: money(r.notCleared)!,
      bankOnlyDeposits: money(r.bankOnlyDeposits)!,
      bankOnlyWithdrawals: money(r.bankOnlyWithdrawals)!,
      expectedBankBalance: money(r.expectedBankBalance)!,
      statementBalance: money(r.statementBalance),
      difference: money(r.difference),
      statement: statementRows,
      book: bookRows,
    };
  }

  async importStatement(user: RequestUser, dto: BankImportDto): Promise<BankImportResultDto & { problems: string[] }> {
    this.assertKeep(user);
    const account = await this.bankAccount(user, dto.accountId);
    let read: ReturnType<typeof readStatement>;
    try {
      read = readStatement(dto.cells);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (!read.rows.length) throw new BadRequestException('No transactions found under the header row. Check the file is the statement itself.');
    const seen = new Map<string, number>();
    const data: Prisma.BankStatementLineCreateManyInput[] = read.rows.map((r) => {
      const base = rowFingerprint(r, 0);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return {
        organizationId: user.organizationId,
        accountId: account.id,
        date: parseDate(r.date),
        description: r.description,
        reference: r.reference,
        withdrawal: r.withdrawal,
        deposit: r.deposit,
        balance: r.balance,
        seq: r.seq,
        fingerprint: rowFingerprint(r, n),
      };
    });
    const { count } = await this.prisma.bankStatementLine.createMany({ data, skipDuplicates: true });
    const matched = await this.match(user, account.id);
    await this.audit.log(user, 'BANK_STATEMENT', account.id, 'IMPORTED', `${account.name}: ${count} lines added, ${read.rows.length - count} already there, ${matched} matched`);
    return { added: count, skipped: read.rows.length - count, matched, problems: read.problems.slice(0, 50) };
  }

  async autoMatch(user: RequestUser, accountId: string): Promise<BankImportResultDto> {
    this.assertKeep(user);
    const account = await this.bankAccount(user, accountId);
    await this.books.fresh(user);
    return { added: 0, skipped: 0, matched: await this.match(user, account.id) };
  }

  /** Match every free statement line of the account to a free bank book line by amount, side and day. */
  private async match(user: RequestUser, accountId: string): Promise<number> {
    const org = user.organizationId;
    const statement = await this.prisma.bankStatementLine.findMany({ where: { organizationId: org, accountId, bookLineId: null } });
    if (!statement.length) return 0;
    const dates = statement.map((s) => dateOnly(s.date)!).sort();
    const book = await this.prisma.bookLine.findMany({
      where: {
        organizationId: org,
        accountId,
        statementLine: null,
        voucher: { status: 'APPROVED', date: { gte: parseDate(addDays(dates[0], -MATCH_DAYS_AFTER)), lte: parseDate(addDays(dates.at(-1)!, MATCH_DAYS_BEFORE)) } },
      },
      include: { voucher: { select: { voucherNo: true, reference: true, date: true } } },
    });
    const pairs = autoMatch(
      statement.map((s) => ({ id: s.id, date: dateOnly(s.date)!, description: s.description, reference: s.reference, withdrawal: s.withdrawal, deposit: s.deposit })),
      book.map((b) => ({ id: b.id, date: dateOnly(b.voucher.date)!, voucherNo: b.voucher.voucherNo, reference: b.voucher.reference, debit: b.debit, credit: b.credit })),
    );
    const at = new Date();
    for (const p of pairs) await this.prisma.bankStatementLine.update({ where: { id: p.statementLineId }, data: { bookLineId: p.bookLineId, matchedBy: 'AUTO', matchedAt: at } });
    return pairs.length;
  }

  async matchByHand(user: RequestUser, dto: BankMatchDto) {
    this.assertKeep(user);
    const org = user.organizationId;
    const [s, b] = await Promise.all([
      this.prisma.bankStatementLine.findFirst({ where: { id: dto.statementLineId, organizationId: org } }),
      this.prisma.bookLine.findFirst({ where: { id: dto.bookLineId, organizationId: org }, include: { statementLine: true, voucher: { select: { status: true, voucherNo: true } } } }),
    ]);
    if (!s) throw new NotFoundException('Statement line not found');
    if (!b || b.voucher.status !== 'APPROVED') throw new NotFoundException('That entry is not in the books');
    if (b.accountId !== s.accountId) throw new BadRequestException('The entry is in another account. Choose one from this bank account.');
    if (s.bookLineId) throw new BadRequestException('This statement line is already matched. Unmatch it first.');
    if (b.statementLine) throw new BadRequestException(`${b.voucher.voucherNo} is already matched to another statement line. Unmatch that first.`);
    const deposit = s.deposit.gt(0);
    const ours = deposit ? b.debit : b.credit;
    const theirs = deposit ? s.deposit : s.withdrawal;
    if (ours.isZero()) throw new BadRequestException(deposit ? 'The bank shows money in; choose a receipt in the books' : 'The bank shows money out; choose a payment in the books');
    if (!ours.eq(theirs)) throw new BadRequestException(`The amounts differ (₹${theirs.toFixed(2)} at the bank, ₹${ours.toFixed(2)} in the books). Correct the voucher, or make one for the difference.`);
    await this.prisma.bankStatementLine.update({ where: { id: s.id }, data: { bookLineId: b.id, matchedBy: 'HAND', matchedAt: new Date() } });
    await this.audit.log(user, 'BANK_STATEMENT', s.accountId, 'MATCHED', `${dateOnly(s.date)} ${s.description} with ${b.voucher.voucherNo}`);
    return { ok: true };
  }

  async unmatch(user: RequestUser, statementLineId: string) {
    this.assertKeep(user);
    const s = await this.prisma.bankStatementLine.findFirst({ where: { id: statementLineId, organizationId: user.organizationId } });
    if (!s) throw new NotFoundException('Statement line not found');
    await this.prisma.bankStatementLine.update({ where: { id: s.id }, data: { bookLineId: null, matchedBy: null, matchedAt: null } });
    return { ok: true };
  }

  async removeStatementLine(user: RequestUser, id: string) {
    this.assertKeep(user);
    const s = await this.prisma.bankStatementLine.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!s) throw new NotFoundException('Statement line not found');
    await this.prisma.bankStatementLine.delete({ where: { id } });
    await this.audit.log(user, 'BANK_STATEMENT', s.accountId, 'DELETED', `${dateOnly(s.date)} ${s.description}`);
    return { ok: true };
  }

  // ----- Opening balances, the lock and the year's close -----

  /** A system account the statements post to, made when first needed. */
  private async systemAccount(tx: Tx, organizationId: string, key: string) {
    const found = await tx.ledgerAccount.findUnique({ where: { organizationId_key: { organizationId, key } } });
    if (found) return found.id;
    const { name, group } = SYSTEM_ACCOUNTS[key];
    const clash = await tx.ledgerAccount.findFirst({ where: { organizationId, name: { equals: name, mode: 'insensitive' } } });
    const a = await tx.ledgerAccount.create({ data: { organizationId, key, name: clash ? `${name} (books)` : name, group, isSystem: true } });
    return a.id;
  }

  async year(user: RequestUser): Promise<BooksYearDto> {
    this.assertKeep(user);
    await this.books.fresh(user);
    const org = user.organizationId;
    const [st, opening, closes, firstVoucher, accounts] = await Promise.all([
      this.prisma.booksState.findUnique({ where: { organizationId: org } }),
      this.prisma.bookVoucher.findFirst({ where: { organizationId: org, source: 'OPENING' }, include: { lines: { include: { account: true }, orderBy: { sortOrder: 'asc' } } } }),
      this.prisma.bookVoucher.findMany({ where: { organizationId: org, source: 'YEAR_CLOSE' }, include: { lines: { include: { account: { select: { key: true } } } }, approvedBy: { select: { fullName: true } } } }),
      this.prisma.bookVoucher.findFirst({ where: { organizationId: org, status: 'APPROVED', source: { not: 'OPENING' } }, orderBy: { date: 'asc' }, select: { date: true } }),
      this.prisma.ledgerAccount.findMany({ where: { organizationId: org }, select: { id: true, group: true } }),
    ]);
    const booksFrom = dateOnly(st?.booksFrom);
    const lockedUpTo = dateOnly(st?.lockedUpTo);
    const approver = canApproveVouchers(user.roleKey);
    const t = today();
    const start = [booksFrom, dateOnly(firstVoucher?.date)].filter((d): d is string => !!d).sort()[0] ?? t;
    const codes = fyBetween(start, t);
    const closed = new Map(closes.map((c) => [c.sourceId!, c]));
    const plIds = new Set(accounts.filter((a) => isProfitLoss(a.group)).map((a) => a.id));
    const held = ((st?.held as unknown as BooksHeldDto[] | undefined) ?? []);
    const years: FinancialYearDto[] = [];
    let earlierOpen: string | null = null;
    let latestClosed: string | null = null;
    for (const code of codes) if (closed.has(code)) latestClosed = code;
    for (const code of codes) {
      const { from, to } = fyRange(code);
      const close = closed.get(code);
      let profit: Prisma.Decimal;
      if (close) {
        const pl = close.lines.find((l) => l.account.key === PROFIT_KEY);
        profit = pl ? pl.credit.sub(pl.debit) : D(0);
      } else {
        const rows = await this.sums(org, this.period(from, to));
        profit = rows.filter((r) => plIds.has(r.accountId)).reduce((s, r) => s.add(r.credit).sub(r.debit), D(0));
      }
      const blockers: string[] = [];
      if (!close) {
        if (to >= t) blockers.push(`The year ends on ${formatDay(to)}`);
        if (earlierOpen) blockers.push(`Close ${earlierOpen} first`);
        const pending = await this.prisma.bookVoucher.count({ where: { organizationId: org, source: 'MANUAL', status: { in: ['DRAFT', 'SUBMITTED', 'REJECTED'] }, date: { gte: parseDate(from), lte: parseDate(to) } } });
        if (pending) blockers.push(`${pending === 1 ? '1 voucher' : `${pending} vouchers`} of this year made by hand ${pending === 1 ? 'is a draft, waiting or sent back' : 'are drafts, waiting or sent back'}. Approve or delete ${pending === 1 ? 'it' : 'them'} first.`);
        const stuck = held.filter((h) => h.date >= from && h.date <= to).length;
        if (stuck) blockers.push(`${stuck === 1 ? '1 record' : `${stuck} records`} of this year could not be posted (see Books, Day book). Fix ${stuck === 1 ? 'it' : 'them'} first.`);
        const hasEntries = !profit.isZero() || (await this.prisma.bookVoucher.count({ where: { organizationId: org, status: 'APPROVED', date: { gte: parseDate(from), lte: parseDate(to) } } })) > 0;
        if (hasEntries && !earlierOpen) earlierOpen = code;
      }
      years.push({
        code,
        from,
        to,
        closed: !!close,
        closedAt: iso(close?.approvedAt),
        closedByName: close?.approvedBy?.fullName ?? null,
        profit: money(profit)!,
        blockers,
        canClose: approver && !close && blockers.length === 0,
        canReopen: approver && !!close && code === latestClosed,
      });
    }
    const keep = canKeepBooks(user.roleKey);
    const openingLines = (opening?.lines ?? []).filter((l) => l.account.key !== OPENING_DIFF_KEY);
    return {
      booksFrom,
      lockedUpTo,
      opening: openingLines.map((l) => ({ accountId: l.accountId, name: l.account.name, group: l.account.group, debit: l.debit.gt(0) ? money(l.debit) : null, credit: l.credit.gt(0) ? money(l.credit) : null })),
      openingDebit: money(openingLines.reduce((s, l) => s.add(l.debit), D(0)))!,
      openingCredit: money(openingLines.reduce((s, l) => s.add(l.credit), D(0)))!,
      years: years.reverse(),
      canChangeOpening: keep && !(lockedUpTo && booksFrom && dayBefore(booksFrom) <= lockedUpTo),
      canLock: approver,
    };
  }

  /**
   * Set the day the books begin and the balances brought in as on the day before. Module records before that day leave
   * the books (they are in these balances); whatever the balances do not explain goes to a difference account.
   */
  async saveOpening(user: RequestUser, dto: SaveOpeningDto) {
    this.assertKeep(user);
    const org = user.organizationId;
    const { lockedUpTo } = await this.books.period(org);
    const openingDay = dayBefore(dto.booksFrom);
    if (lockedUpTo && openingDay <= lockedUpTo) throw new BadRequestException(`The books are locked up to ${formatDay(lockedUpTo)}, so the opening balances cannot change. Ask management to move the lock.`);
    if (dto.booksFrom > today()) throw new BadRequestException('The books cannot begin after today. Choose today or an earlier day.');
    const earlier = await this.prisma.bookVoucher.count({ where: { organizationId: org, source: 'MANUAL', status: { not: 'CANCELLED' }, date: { lt: parseDate(dto.booksFrom) } } });
    if (earlier)
      throw new BadRequestException(`${earlier === 1 ? '1 voucher' : `${earlier} vouchers`} made by hand ${earlier === 1 ? 'is' : 'are'} dated before ${formatDay(dto.booksFrom)}. Begin the books on or before ${earlier === 1 ? 'its' : 'their'} day, or cancel ${earlier === 1 ? 'it' : 'them'}.`);
    const ids = [...new Set(dto.lines.map((l) => l.accountId))];
    if (ids.length !== dto.lines.length) throw new BadRequestException('Each account appears once. Put its balance on one line.');
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, group: true } });
    if (accounts.length !== ids.length) throw new BadRequestException('Choose each account from the chart of accounts');
    const pl = accounts.find((a) => isProfitLoss(a.group));
    if (pl) throw new BadRequestException(`${pl.name} is income or an expense, which start each year at nothing. Bring last year's profit in through reserves instead.`);
    const lines = dto.lines
      .map((l) => ({ accountId: l.accountId, debit: D(l.debit ?? 0), credit: D(l.credit ?? 0) }))
      .filter((l) => !l.debit.isZero() || !l.credit.isZero());
    const bad = lines.findIndex((l) => !l.debit.isZero() && !l.credit.isZero());
    if (bad >= 0) throw new BadRequestException(`${accounts.find((a) => a.id === lines[bad].accountId)!.name}: enter a debit or a credit, not both`);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`BOOKS:${org}`}))`;
        await tx.bookVoucher.deleteMany({ where: { organizationId: org, source: 'OPENING' } });
        await tx.booksState.upsert({ where: { organizationId: org }, create: { organizationId: org, booksFrom: parseDate(dto.booksFrom) }, update: { booksFrom: parseDate(dto.booksFrom), lastPostedAt: null } });
        if (!lines.length) return;
        const dr = lines.reduce((s, l) => s.add(l.debit), D(0));
        const cr = lines.reduce((s, l) => s.add(l.credit), D(0));
        const all = [...lines];
        if (!dr.eq(cr)) {
          const diff = await this.systemAccount(tx, org, OPENING_DIFF_KEY);
          all.push({ accountId: diff, debit: cr.gt(dr) ? cr.sub(dr) : D(0), credit: dr.gt(cr) ? dr.sub(cr) : D(0) });
        }
        await tx.bookVoucher.create({
          data: {
            organizationId: org,
            voucherNo: 'Opening',
            type: 'JOURNAL',
            date: parseDate(openingDay),
            source: 'OPENING',
            narration: `Balances brought in as on ${formatDay(openingDay)}`,
            amount: Prisma.Decimal.max(dr, cr),
            status: 'APPROVED',
            preparedById: user.id,
            approvedById: user.id,
            approvedAt: new Date(),
            lines: { createMany: { data: all.map((l, i) => ({ organizationId: org, ...l, sortOrder: i })) } },
          },
        });
      },
      { timeout: 60_000 },
    );
    await this.books.postAll(org, 0);
    await this.audit.log(user, 'BOOKS', org, 'OPENING_SAVED', `Books begin ${dto.booksFrom}; ${lines.length} opening balances`);
    return this.year(user);
  }

  async lock(user: RequestUser, dto: LockDto) {
    this.assertKeep(user);
    this.assertApprover(user);
    const org = user.organizationId;
    const to = dto.lockedUpTo ?? null;
    if (to && to > today()) throw new BadRequestException('Lock up to today at the latest');
    const lastClose = await this.prisma.bookVoucher.findFirst({ where: { organizationId: org, source: 'YEAR_CLOSE' }, orderBy: { date: 'desc' }, select: { date: true, sourceId: true } });
    if (lastClose && (!to || to < dateOnly(lastClose.date)!)) throw new BadRequestException(`${lastClose.sourceId} is closed, so the books stay locked up to ${formatDay(dateOnly(lastClose.date))}. Reopen the year to move the lock into it.`);
    if (to) {
      const waiting = await this.prisma.bookVoucher.count({ where: { organizationId: org, source: 'MANUAL', status: 'SUBMITTED', date: { lte: parseDate(to) } } });
      if (waiting) throw new BadRequestException(`${waiting === 1 ? '1 voucher' : `${waiting} vouchers`} dated on or before ${formatDay(to)} ${waiting === 1 ? 'waits' : 'wait'} for approval. Decide ${waiting === 1 ? 'it' : 'them'} first.`);
    }
    await this.prisma.booksState.upsert({ where: { organizationId: org }, create: { organizationId: org, lockedUpTo: to ? parseDate(to) : null }, update: { lockedUpTo: to ? parseDate(to) : null } });
    await this.audit.log(user, 'BOOKS', org, to ? 'LOCKED' : 'UNLOCKED', to ? `Locked up to ${to}` : 'Lock taken off');
    if (!to) await this.books.postAll(org, 0);
    return this.year(user);
  }

  /** Close a year: post what changed, empty income and expenses into the profit and loss account, lock the year. */
  async close(user: RequestUser, code: string) {
    this.assertKeep(user);
    this.assertApprover(user);
    const org = user.organizationId;
    await this.books.postAll(org, 0);
    const y = (await this.year(user)).years.find((x) => x.code === code);
    if (!y) throw new NotFoundException('There is no such year in the books');
    if (y.closed) throw new BadRequestException(`${code} is already closed`);
    if (y.blockers.length) throw new BadRequestException(y.blockers.join(' '));
    const plIds = (await this.prisma.ledgerAccount.findMany({ where: { organizationId: org }, select: { id: true, group: true } })).filter((a) => isProfitLoss(a.group)).map((a) => a.id);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`BOOKS:${org}`}))`;
        const rows = await tx.bookLine.groupBy({
          by: ['accountId', 'projectId'],
          where: { organizationId: org, accountId: { in: plIds }, voucher: { status: 'APPROVED', date: { lte: parseDate(y.to) } } },
          _sum: { debit: true, credit: true },
        });
        const profitAccount = await this.systemAccount(tx, org, PROFIT_KEY);
        const { lines, profit } = closingLines(
          rows.map((r) => ({ accountId: r.accountId, projectId: r.projectId, balance: D(r._sum.debit ?? 0).sub(r._sum.credit ?? 0) })),
          profitAccount,
        );
        const st = await tx.booksState.findUnique({ where: { organizationId: org } });
        const lockTo = st?.lockedUpTo && dateOnly(st.lockedUpTo)! > y.to ? st.lockedUpTo : parseDate(y.to);
        await tx.booksState.upsert({ where: { organizationId: org }, create: { organizationId: org, lockedUpTo: lockTo }, update: { lockedUpTo: lockTo } });
        await tx.bookVoucher.create({
          data: {
            id: randomUUID(),
            organizationId: org,
            voucherNo: `Close/${code}`,
            type: 'JOURNAL',
            date: parseDate(y.to),
            source: 'YEAR_CLOSE',
            sourceId: code,
            narration: `Income and expenses of ${code} closed to the profit and loss account (${profit.gte(0) ? 'profit' : 'loss'} ₹${profit.abs().toFixed(2)})`,
            amount: lines.reduce((s, l) => s.add(l.debit), D(0)),
            status: 'APPROVED',
            preparedById: user.id,
            approvedById: user.id,
            approvedAt: new Date(),
            lines: { createMany: { data: lines.map((l, i) => ({ organizationId: org, ...l, sortOrder: i })) } },
          },
        });
      },
      { timeout: 60_000 },
    );
    await this.audit.log(user, 'BOOKS', org, 'YEAR_CLOSED', `${code} closed; books locked up to ${y.to}`);
    return this.year(user);
  }

  /** Reopen the latest closed year: its closing voucher goes and the lock moves back to the year before. */
  async reopen(user: RequestUser, code: string) {
    this.assertKeep(user);
    this.assertApprover(user);
    const org = user.organizationId;
    const y = (await this.year(user)).years.find((x) => x.code === code);
    if (!y?.closed) throw new BadRequestException(`${code} is not closed`);
    if (!y.canReopen) throw new BadRequestException('Reopen the latest closed year first');
    await this.prisma.$transaction([
      this.prisma.bookVoucher.deleteMany({ where: { organizationId: org, source: 'YEAR_CLOSE', sourceId: code } }),
      this.prisma.booksState.update({ where: { organizationId: org }, data: { lockedUpTo: parseDate(dayBefore(y.from)) } }),
    ]);
    await this.audit.log(user, 'BOOKS', org, 'YEAR_REOPENED', `${code} reopened; books locked up to ${dayBefore(y.from)}`);
    await this.books.postAll(org, 0);
    return this.year(user);
  }

  /** For the Accounts home: the year's profit so far and the bank lines waiting to be matched. */
  async figures(user: RequestUser) {
    if (!canKeepBooks(user.roleKey)) return null;
    const org = user.organizationId;
    const t = today();
    const { from } = fyRange(fyOf(t));
    const [accounts, rows, unmatched] = await Promise.all([
      this.prisma.ledgerAccount.findMany({ where: { organizationId: org }, select: { id: true, group: true } }),
      this.sums(org, this.period(from, t)),
      this.prisma.bankStatementLine.count({ where: { organizationId: org, bookLineId: null } }),
    ]);
    const pl = new Set(accounts.filter((a) => ACCOUNT_GROUP_NATURE[a.group] === 'INCOME' || ACCOUNT_GROUP_NATURE[a.group] === 'EXPENSE').map((a) => a.id));
    const profit = rows.filter((r) => pl.has(r.accountId)).reduce((s, r) => s.add(r.credit).sub(r.debit), D(0));
    return { profitThisYear: money(profit)!, unmatchedBankLines: unmatched };
  }
}

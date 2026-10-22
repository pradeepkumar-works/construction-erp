import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACCOUNT_GROUP_NATURE,
  BOOK_OWN_SOURCES,
  TALLY_FIXED_LEDGERS,
  accountGroupOf,
  canApproveVouchers,
  canKeepBooks,
  isMoneyGroup,
  statementLineFits,
  STATEMENT_LINE_LABELS,
  type AccountGroup,
  type BookSource,
  type BookVoucherDto,
  type BookVoucherType,
  type BooksHeldDto,
  type BooksPostResultDto,
  type BooksStatusDto,
  type LedgerAccountDto,
  type LedgerDto,
  type ManualVoucherType,
  type StatementLine,
  type Paginated,
  type TallyVoucherKind,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, formatDay, iso, money, parseDate } from '../common/serialize';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { PostingService } from '../posting/posting.service';
import { debits, type Voucher } from '../tally/vouchers';
import { againstOf, fyCode, runningBalances, voucherHash, voucherNumber, voucherProblem, voucherSeq } from './books-rules';
import { AccountQuery, CreateAccountDto, DayBookQuery, LedgerQuery, SaveVoucherDto, UpdateAccountDto, VoucherQuery } from './books.dto';

type Tx = Prisma.TransactionClient | PrismaService;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const FIXED = new Map(TALLY_FIXED_LEDGERS.map((l) => [l.key, l]));
/** How long the books trust their last posting run before a read brings them up to date again. */
const FRESH_MS = 60_000;
/** Most lines a ledger shows at once (the latest; the opening balance covers the rest). */
const LEDGER_MAX = 2000;

/** The group a module's ledger key belongs in, as the Tally export files it. */
function groupOfKey(key: string): AccountGroup {
  const fixed = FIXED.get(key);
  if (fixed) return accountGroupOf(fixed.group);
  if (key.startsWith('VENDOR:')) return 'SUNDRY_CREDITORS';
  if (key.startsWith('CLIENT:') || key.startsWith('CLIENT_NAME:')) return 'SUNDRY_DEBTORS';
  if (key.startsWith('EXPENSE:')) return 'DIRECT_EXPENSES';
  return 'SUSPENSE';
}

/** The kind of voucher a posted record is in the books. */
function typeOf(v: Voucher): BookVoucherType {
  const byKind: Record<TallyVoucherKind, BookVoucherType> = {
    SALES: 'SALES',
    RECEIPT: 'RECEIPT',
    PURCHASE: 'PURCHASE',
    SUBCONTRACT: 'JOURNAL',
    PAYMENT: 'PAYMENT',
    EXPENSE: 'PAYMENT',
    DEBIT_NOTE: 'DEBIT_NOTE',
    SALARY: 'JOURNAL',
    SALARY_PAYMENT: 'PAYMENT',
    STAFF_LOAN: 'PAYMENT',
    RMC_SALE: 'SALES',
    RMC_RECEIPT: 'RECEIPT',
  };
  // An expense bought on credit moves no money: it is a journal to the vendor.
  if (v.kind === 'EXPENSE' && !v.lines.some((l) => l.ledgerKey === 'CASH' || l.ledgerKey === 'BANK')) return 'JOURNAL';
  return byKind[v.kind];
}

const voucherInclude = {
  project: { select: { name: true } },
  preparedBy: { select: { fullName: true } },
  approvedBy: { select: { fullName: true } },
  lines: { include: { account: { select: { name: true } }, project: { select: { code: true } } }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.BookVoucherInclude;
type VoucherRow = Prisma.BookVoucherGetPayload<{ include: typeof voucherInclude }>;

/**
 * The books of account (v6 item 102). Vouchers come from the modules through the posting service (the same one the
 * Tally export uses), brought up to date on read, or are made by accounts and approved by management. The day book,
 * cash and bank books and ledgers read approved vouchers only; projects are the cost centres.
 */
@Injectable()
export class BooksService {
  constructor(private prisma: PrismaService, private audit: AuditService, private posting: PostingService) {}

  private assertKeep(user: RequestUser) {
    if (!canKeepBooks(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts see the books');
  }

  /** The day the books begin and the day they are locked up to, if set. */
  async period(organizationId: string) {
    const st = await this.prisma.booksState.findUnique({ where: { organizationId } });
    return { booksFrom: dateOnly(st?.booksFrom), lockedUpTo: dateOnly(st?.lockedUpTo) };
  }

  /** Refuse a voucher dated in the locked period or before the books begin. */
  private async assertOpen(organizationId: string, date: string) {
    const { booksFrom, lockedUpTo } = await this.period(organizationId);
    if (lockedUpTo && date <= lockedUpTo) throw new BadRequestException(`The books are locked up to ${formatDay(lockedUpTo)}. Date the voucher after that, or ask management to move the lock.`);
    if (booksFrom && date < booksFrom) throw new BadRequestException(`The books begin on ${formatDay(booksFrom)}; what came before is in the opening balances. Date the voucher on or after that day.`);
  }

  // ----- Posting -----

  /** Post every module record that changed since the last run, when that run is older than a minute. */
  async fresh(user: RequestUser) {
    const st = await this.prisma.booksState.findUnique({ where: { organizationId: user.organizationId } });
    if (!st?.lastPostedAt || Date.now() - st.lastPostedAt.getTime() > FRESH_MS) await this.postAll(user.organizationId, FRESH_MS / 12);
  }

  async post(user: RequestUser): Promise<BooksPostResultDto> {
    this.assertKeep(user);
    return this.postAll(user.organizationId, 0);
  }

  /**
   * Bring the posted vouchers in line with the modules: new records are added, changed ones rewritten, and those that no
   * longer post (a payment deleted, a bill sent back) removed. A run that finished within `skipWithinMs` is enough.
   */
  async postAll(organizationId: string, skipWithinMs: number): Promise<BooksPostResultDto> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`BOOKS:${organizationId}`}))`;
        const st = await tx.booksState.findUnique({ where: { organizationId } });
        if (skipWithinMs && st?.lastPostedAt && Date.now() - st.lastPostedAt.getTime() < skipWithinMs) return { added: 0, changed: 0, removed: 0, held: (st.held as unknown[]).length };
        const cfg = await this.posting.config(tx, organizationId);
        const { vouchers, held } = await this.posting.build(tx, organizationId, cfg, { unexported: false });
        const accounts = await this.accountsFor(tx, organizationId, vouchers);

        const booksFrom = dateOnly(st?.booksFrom);
        const lockedUpTo = dateOnly(st?.lockedUpTo);
        const locked = (d: string) => !!lockedUpTo && d <= lockedUpTo;
        const heldRows: BooksHeldDto[] = held.map((h) => ({ source: h.kind as BookSource, sourceId: h.sourceId, date: h.date, number: h.number, party: h.party, reason: h.reason }));
        const lockedOut = (source: string, sourceId: string, date: string, number: string, party: string | null, what: string) =>
          heldRows.push({ source: source as BookSource, sourceId, date, number, party: party ?? '', reason: `${what} after the books were locked up to ${formatDay(lockedUpTo)}. Move the lock back to post it, or undo the change.` });

        const existing = await tx.bookVoucher.findMany({
          where: { organizationId, source: { notIn: [...BOOK_OWN_SOURCES] } },
          select: { id: true, source: true, sourceId: true, hash: true, date: true, voucherNo: true, party: true },
        });
        const byKey = new Map(existing.map((e) => [`${e.source}:${e.sourceId}`, e]));
        const seen = new Set<string>();
        const created: Prisma.BookVoucherCreateManyInput[] = [];
        const lines: Prisma.BookLineCreateManyInput[] = [];
        const changed: string[] = [];
        for (const v of vouchers) {
          const key = `${v.kind}:${v.sourceId}`;
          const day = dateOnly(v.date)!;
          const was = byKey.get(key);
          const wasDay = was ? dateOnly(was.date)! : null;
          if (!was && booksFrom && day < booksFrom) continue; // in the opening balances
          if (!was && locked(day)) {
            lockedOut(v.kind, v.sourceId, day, v.number, v.party, 'Recorded in the module');
            continue;
          }
          seen.add(key);
          const hash = voucherHash({
            date: dateOnly(v.date)!,
            number: v.number,
            reference: v.reference,
            narration: v.narration,
            projectId: v.projectId,
            lines: v.lines.map((l) => ({ key: l.ledgerKey, projectId: v.projectId, amount: l.amount.toFixed(2) })),
          });
          if (was?.hash === hash) continue;
          if (was && (locked(wasDay!) || locked(day))) {
            lockedOut(v.kind, v.sourceId, day, v.number, v.party, 'Changed in the module');
            continue;
          }
          if (was && booksFrom && day < booksFrom) {
            seen.delete(key);
            continue;
          }
          const id = was?.id ?? randomUUID();
          const data = { voucherNo: v.number, type: typeOf(v), date: v.date, reference: v.reference, party: v.party, narration: v.narration, projectId: v.projectId, amount: debits(v.lines), status: 'APPROVED' as const, hash };
          if (was) {
            changed.push(id);
            await tx.bookVoucher.update({ where: { id }, data });
          } else created.push({ id, organizationId, source: v.kind, sourceId: v.sourceId, ...data });
          v.lines.forEach((l, i) =>
            lines.push({
              id: randomUUID(),
              organizationId,
              voucherId: id,
              accountId: accounts.get(l.ledgerKey)!,
              projectId: v.projectId,
              debit: l.amount.gt(0) ? l.amount : 0,
              credit: l.amount.lt(0) ? l.amount.neg() : 0,
              sortOrder: i,
            }),
          );
        }
        // A rewritten voucher keeps its bank statement matches where the same account still has the same amount.
        const matches = changed.length
          ? await tx.bankStatementLine.findMany({ where: { organizationId, bookLine: { voucherId: { in: changed } } }, select: { id: true, bookLine: { select: { voucherId: true, accountId: true, debit: true, credit: true } } } })
          : [];
        if (changed.length) await tx.bookLine.deleteMany({ where: { voucherId: { in: changed } } });
        if (created.length) await tx.bookVoucher.createMany({ data: created });
        if (lines.length) await tx.bookLine.createMany({ data: lines });
        const taken = new Set<string>();
        for (const m of matches) {
          const b = m.bookLine!;
          const again = lines.find((l) => !taken.has(l.id!) && l.voucherId === b.voucherId && l.accountId === b.accountId && D(l.debit as Prisma.Decimal.Value).eq(b.debit) && D(l.credit as Prisma.Decimal.Value).eq(b.credit));
          if (!again) continue;
          taken.add(again.id!);
          await tx.bankStatementLine.update({ where: { id: m.id }, data: { bookLineId: again.id } });
        }
        const gone: string[] = [];
        for (const e of existing) {
          if (seen.has(`${e.source}:${e.sourceId}`)) continue;
          if (locked(dateOnly(e.date)!)) lockedOut(e.source, e.sourceId!, dateOnly(e.date)!, e.voucherNo, e.party, 'Taken out of the module');
          else gone.push(e.id);
        }
        if (gone.length) await tx.bookVoucher.deleteMany({ where: { id: { in: gone } } });
        const state = { lastPostedAt: new Date(), held: heldRows as unknown as Prisma.InputJsonValue };
        await tx.booksState.upsert({ where: { organizationId }, create: { organizationId, ...state }, update: state });
        return { added: created.length, changed: changed.length, removed: gone.length, held: heldRows.length };
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }

  /** The account of every ledger key the vouchers use, made (with the Tally export's name and group) where missing. */
  private async accountsFor(tx: Tx, organizationId: string, vouchers: Voucher[]): Promise<Map<string, string>> {
    const rows = await tx.ledgerAccount.findMany({ where: { organizationId }, select: { id: true, key: true, name: true } });
    const ids = new Map(rows.map((a) => [a.key, a.id]));
    const names = new Set(rows.map((a) => a.name.toLowerCase()));
    const make: Prisma.LedgerAccountCreateManyInput[] = [];
    for (const v of vouchers)
      for (const l of v.lines) {
        if (ids.has(l.ledgerKey)) continue;
        // Two parties of the same name (a vendor and a client) each get their own account.
        let name = l.ledger.slice(0, 120);
        for (let n = 2; names.has(name.toLowerCase()); n++) name = `${l.ledger.slice(0, 112)} (${n})`;
        names.add(name.toLowerCase());
        const id = randomUUID();
        ids.set(l.ledgerKey, id);
        make.push({ id, organizationId, key: l.ledgerKey, name, group: groupOfKey(l.ledgerKey), isSystem: true });
      }
    if (make.length) await tx.ledgerAccount.createMany({ data: make });
    return ids;
  }

  async status(user: RequestUser): Promise<BooksStatusDto> {
    this.assertKeep(user);
    await this.fresh(user);
    const org = user.organizationId;
    const [st, vouchers, toApprove] = await Promise.all([
      this.prisma.booksState.findUnique({ where: { organizationId: org } }),
      this.prisma.bookVoucher.count({ where: { organizationId: org, status: 'APPROVED' } }),
      canApproveVouchers(user.roleKey) ? this.prisma.bookVoucher.count({ where: { organizationId: org, status: 'SUBMITTED', preparedById: { not: user.id } } }) : 0,
    ]);
    return { lastPostedAt: iso(st?.lastPostedAt), vouchers, held: (st?.held as unknown as BooksHeldDto[] | undefined) ?? [], toApprove };
  }

  // ----- Chart of accounts -----

  /** Every account with its debits, credits and balance in the approved vouchers (up to a day, for a project). */
  async accounts(user: RequestUser, q: AccountQuery = {}): Promise<LedgerAccountDto[]> {
    this.assertKeep(user);
    await this.fresh(user);
    const org = user.organizationId;
    const [rows, sums] = await Promise.all([
      this.prisma.ledgerAccount.findMany({ where: { organizationId: org }, orderBy: [{ group: 'asc' }, { name: 'asc' }] }),
      this.prisma.bookLine.groupBy({
        by: ['accountId'],
        where: { organizationId: org, ...(q.projectId ? { projectId: q.projectId } : {}), voucher: { status: 'APPROVED', ...(q.to ? { date: { lte: parseDate(q.to) } } : {}) } },
        _sum: { debit: true, credit: true },
        _count: { _all: true },
      }),
    ]);
    const by = new Map(sums.map((s) => [s.accountId, s]));
    return rows.map((a) => {
      const s = by.get(a.id);
      const dr = s?._sum.debit ?? D(0);
      const cr = s?._sum.credit ?? D(0);
      return {
        id: a.id,
        key: a.key,
        name: a.name,
        code: a.code,
        group: a.group,
        nature: ACCOUNT_GROUP_NATURE[a.group],
        isSystem: a.isSystem,
        isActive: a.isActive,
        description: a.description,
        statementLine: a.statementLine,
        debit: money(dr)!,
        credit: money(cr)!,
        balance: money(dr.sub(cr))!,
        entries: s?._count._all ?? 0,
      };
    });
  }

  private lineFits(line: StatementLine | null | undefined, group: AccountGroup) {
    if (line && !statementLineFits(line, ACCOUNT_GROUP_NATURE[group]))
      throw new BadRequestException(`${STATEMENT_LINE_LABELS[line]} is on the ${ACCOUNT_GROUP_NATURE[group] === 'INCOME' || ACCOUNT_GROUP_NATURE[group] === 'EXPENSE' ? 'balance sheet' : 'profit and loss account'}; choose a line that fits the account's group`);
  }

  private async nameFree(organizationId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.ledgerAccount.findFirst({ where: { organizationId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (clash) throw new BadRequestException(`There is already an account named ${clash.name}. Give this one another name.`);
  }

  async createAccount(user: RequestUser, dto: CreateAccountDto): Promise<LedgerAccountDto> {
    this.assertKeep(user);
    await this.nameFree(user.organizationId, dto.name);
    const id = randomUUID();
    this.lineFits(dto.statementLine, dto.group);
    await this.prisma.ledgerAccount.create({
      data: { id, organizationId: user.organizationId, key: `ACCOUNT:${id}`, name: dto.name, group: dto.group, code: dto.code || null, description: dto.description || null, statementLine: dto.statementLine ?? null },
    });
    await this.audit.log(user, 'LEDGER_ACCOUNT', id, 'CREATED', dto.name);
    return (await this.accounts(user)).find((a) => a.id === id)!;
  }

  async updateAccount(user: RequestUser, id: string, dto: UpdateAccountDto): Promise<LedgerAccountDto> {
    this.assertKeep(user);
    const a = await this.prisma.ledgerAccount.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!a) throw new NotFoundException('Account not found');
    if (dto.name && dto.name !== a.name) await this.nameFree(user.organizationId, dto.name, id);
    this.lineFits(dto.statementLine === undefined ? a.statementLine : dto.statementLine, dto.group ?? a.group);
    if (dto.isActive === false && a.isSystem) throw new BadRequestException('The modules post to this account, so it stays open. Rename it or change its group instead.');
    await this.prisma.ledgerAccount.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.group ? { group: dto.group } : {}),
        ...(dto.code !== undefined ? { code: dto.code || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.statementLine !== undefined ? { statementLine: dto.statementLine } : {}),
      },
    });
    await this.audit.log(user, 'LEDGER_ACCOUNT', id, 'UPDATED', dto.name ?? a.name);
    return (await this.accounts(user)).find((x) => x.id === id)!;
  }

  async removeAccount(user: RequestUser, id: string) {
    this.assertKeep(user);
    const a = await this.prisma.ledgerAccount.findFirst({ where: { id, organizationId: user.organizationId }, include: { _count: { select: { lines: true } } } });
    if (!a) throw new NotFoundException('Account not found');
    if (a.isSystem) throw new BadRequestException('The modules post to this account, so it cannot be deleted');
    if (a._count.lines) throw new BadRequestException('Vouchers use this account. Close it instead, so it is not offered for new ones.');
    await this.prisma.ledgerAccount.delete({ where: { id } });
    await this.audit.log(user, 'LEDGER_ACCOUNT', id, 'DELETED', a.name);
    return { ok: true };
  }

  // ----- Ledgers, cash and bank books -----

  /** One account's entries in a period with the opening balance, the running balance and the closing balance. */
  async ledger(user: RequestUser, q: LedgerQuery): Promise<LedgerDto> {
    this.assertKeep(user);
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('From is after to');
    const account = (await this.accounts(user)).find((a) => a.id === q.accountId);
    if (!account) throw new NotFoundException('Account not found');
    const org = user.organizationId;
    const to = q.to ?? dateOnly(new Date())!;
    const project = q.projectId ? { projectId: q.projectId } : {};
    const [before, rows] = await Promise.all([
      q.from
        ? this.prisma.bookLine.aggregate({ where: { organizationId: org, accountId: q.accountId, ...project, voucher: { status: 'APPROVED', date: { lt: parseDate(q.from) } } }, _sum: { debit: true, credit: true } })
        : null,
      this.prisma.bookLine.findMany({
        where: { organizationId: org, accountId: q.accountId, ...project, voucher: { status: 'APPROVED', date: { lte: parseDate(to), ...(q.from ? { gte: parseDate(q.from) } : {}) } } },
        include: {
          project: { select: { code: true } },
          voucher: { select: { id: true, voucherNo: true, type: true, source: true, date: true, narration: true, createdAt: true, lines: { select: { accountId: true, debit: true, account: { select: { name: true } } } } } },
        },
      }),
    ]);
    rows.sort((a, b) => a.voucher.date.getTime() - b.voucher.date.getTime() || a.voucher.createdAt.getTime() - b.voucher.createdAt.getTime() || a.sortOrder - b.sortOrder);
    const opening = before ? D(before._sum.debit ?? 0).sub(before._sum.credit ?? 0) : D(0);
    const balances = runningBalances(opening, rows);
    const dr = rows.reduce((s, r) => s.add(r.debit), D(0));
    const cr = rows.reduce((s, r) => s.add(r.credit), D(0));
    const skip = Math.max(0, rows.length - LEDGER_MAX);
    return {
      account,
      from: q.from ?? null,
      to,
      opening: money(opening)!,
      debit: money(dr)!,
      credit: money(cr)!,
      closing: money(opening.add(dr).sub(cr))!,
      entries: rows.slice(skip).map((r, i) => ({
        lineId: r.id,
        voucherId: r.voucher.id,
        voucherNo: r.voucher.voucherNo,
        type: r.voucher.type,
        source: r.voucher.source as BookSource,
        date: dateOnly(r.voucher.date)!,
        against: againstOf(
          r.voucher.lines.map((l) => ({ accountId: l.accountId, name: l.account.name, debit: l.debit })),
          r,
        ),
        narration: r.narration ?? r.voucher.narration,
        projectCode: r.project?.code ?? null,
        debit: r.debit.gt(0) ? money(r.debit) : null,
        credit: r.credit.gt(0) ? money(r.credit) : null,
        balance: money(balances[skip + i])!,
      })),
      truncated: skip > 0,
    };
  }

  // ----- Day book and vouchers -----

  private voucherDto(user: RequestUser, v: VoucherRow): BookVoucherDto {
    const manual = v.source === 'MANUAL';
    const keep = canKeepBooks(user.roleKey);
    const approver = canApproveVouchers(user.roleKey);
    const open = manual && (v.status === 'DRAFT' || v.status === 'REJECTED');
    return {
      id: v.id,
      voucherNo: v.voucherNo,
      type: v.type,
      date: dateOnly(v.date)!,
      source: v.source as BookSource,
      sourceId: v.sourceId,
      reference: v.reference,
      party: v.party,
      narration: v.narration,
      projectId: v.projectId,
      projectName: v.project?.name ?? null,
      amount: money(v.amount)!,
      status: v.status,
      preparedByName: v.preparedBy?.fullName ?? null,
      approvedByName: v.approvedBy?.fullName ?? null,
      approvedAt: iso(v.approvedAt),
      reviewNote: v.reviewNote,
      canEdit: open && keep,
      canSubmit: open && keep,
      canDecide: manual && v.status === 'SUBMITTED' && approver && v.preparedById !== user.id,
      canCancel: manual && v.status === 'APPROVED' && approver,
      lines: v.lines.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        accountName: l.account.name,
        projectId: l.projectId,
        projectCode: l.project?.code ?? null,
        debit: l.debit.gt(0) ? money(l.debit) : null,
        credit: l.credit.gt(0) ? money(l.credit) : null,
        narration: l.narration,
      })),
    };
  }

  /** Every approved voucher in a period, oldest first, with its lines. */
  async dayBook(user: RequestUser, q: DayBookQuery): Promise<Paginated<BookVoucherDto> & { debit: string }> {
    this.assertKeep(user);
    await this.fresh(user);
    const args = pageArgs(q);
    const words = searchWords(q.q);
    const where: Prisma.BookVoucherWhereInput = {
      organizationId: user.organizationId,
      status: 'APPROVED',
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) } } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.projectId ? { lines: { some: { projectId: q.projectId } } } : {}),
      ...(words.length ? { AND: words.map((w) => ({ OR: [{ voucherNo: ilike(w) }, { narration: ilike(w) }, { party: ilike(w) }, { reference: ilike(w) }] })) } : {}),
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.bookVoucher.findMany({ where, include: voucherInclude, orderBy: [{ date: q.sortOrder === 'desc' ? 'desc' : 'asc' }, { createdAt: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.bookVoucher.count({ where }),
      this.prisma.bookVoucher.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { ...paginated(rows.map((v) => this.voucherDto(user, v)), total, args), debit: money(sum._sum.amount ?? 0)! };
  }

  /** Vouchers made by hand, newest first: drafts, those waiting for approval, approved, sent back, cancelled. */
  async vouchers(user: RequestUser, q: VoucherQuery): Promise<Paginated<BookVoucherDto>> {
    this.assertKeep(user);
    const args = pageArgs(q);
    const words = searchWords(q.q);
    const where: Prisma.BookVoucherWhereInput = {
      organizationId: user.organizationId,
      source: 'MANUAL',
      ...(q.toDecide ? { status: 'SUBMITTED', preparedById: { not: user.id } } : q.status ? { status: q.status } : {}),
      ...(words.length ? { AND: words.map((w) => ({ OR: [{ voucherNo: ilike(w) }, { narration: ilike(w) }, { reference: ilike(w) }] })) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.bookVoucher.findMany({ where, include: voucherInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: args.skip, take: args.take }),
      this.prisma.bookVoucher.count({ where }),
    ]);
    return paginated(
      rows.map((v) => this.voucherDto(user, v)),
      total,
      args,
    );
  }

  private async row(user: RequestUser, id: string) {
    const v = await this.prisma.bookVoucher.findFirst({ where: { id, organizationId: user.organizationId }, include: voucherInclude });
    if (!v) throw new NotFoundException('Voucher not found');
    return v;
  }

  async voucher(user: RequestUser, id: string): Promise<BookVoucherDto> {
    this.assertKeep(user);
    return this.voucherDto(user, await this.row(user, id));
  }

  /** Check a hand-made voucher's accounts, projects and arithmetic; returns its lines ready to save. */
  private async linesOf(user: RequestUser, dto: SaveVoucherDto) {
    const org = user.organizationId;
    const accountIds = [...new Set(dto.lines.map((l) => l.accountId))];
    const projectIds = [...new Set([dto.projectId, ...dto.lines.map((l) => l.projectId)].filter((p): p is string => !!p))];
    const [accounts, projects] = await Promise.all([
      this.prisma.ledgerAccount.findMany({ where: { organizationId: org, id: { in: accountIds } }, select: { id: true, name: true, group: true, isActive: true } }),
      projectIds.length ? this.prisma.project.count({ where: { organizationId: org, id: { in: projectIds } } }) : 0,
    ]);
    if (accounts.length !== accountIds.length) throw new BadRequestException('Choose each account from the chart of accounts');
    const closed = accounts.find((a) => !a.isActive);
    if (closed) throw new BadRequestException(`${closed.name} is closed. Choose an open account.`);
    if (projects !== projectIds.length) throw new BadRequestException('Choose each project from the list');
    const group = new Map(accounts.map((a) => [a.id, a.group]));
    const problem = voucherProblem(
      dto.type,
      dto.lines.map((l) => ({ group: group.get(l.accountId)!, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
    );
    if (problem) throw new BadRequestException(problem);
    return dto.lines.map((l, i) => ({
      organizationId: org,
      accountId: l.accountId,
      projectId: l.projectId ?? dto.projectId ?? null,
      debit: D(l.debit ?? 0),
      credit: D(l.credit ?? 0),
      narration: l.narration || null,
      sortOrder: i,
    }));
  }

  /** The next number of a type in a financial year, under the books' lock. */
  private async nextNumber(tx: Tx, organizationId: string, type: ManualVoucherType, date: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`BOOKS_NO:${organizationId}`}))`;
    const taken = await tx.bookVoucher.findMany({ where: { organizationId, source: 'MANUAL', type, voucherNo: { startsWith: voucherNumber(type, date, 0).slice(0, -4) } }, select: { voucherNo: true } });
    const seq = taken.reduce((m, t) => Math.max(m, voucherSeq(type, date, t.voucherNo)), 0) + 1;
    return voucherNumber(type, date, seq);
  }

  async createVoucher(user: RequestUser, dto: SaveVoucherDto): Promise<BookVoucherDto> {
    this.assertKeep(user);
    await this.assertOpen(user.organizationId, dto.date);
    const lines = await this.linesOf(user, dto);
    const id = await this.prisma.$transaction(async (tx) => {
      const voucherNo = await this.nextNumber(tx, user.organizationId, dto.type, dto.date);
      const v = await tx.bookVoucher.create({
        data: {
          organizationId: user.organizationId,
          voucherNo,
          type: dto.type,
          date: parseDate(dto.date),
          source: 'MANUAL',
          reference: dto.reference || null,
          narration: dto.narration,
          projectId: dto.projectId || null,
          amount: lines.reduce((s, l) => s.add(l.debit), D(0)),
          status: 'DRAFT',
          preparedById: user.id,
          lines: { createMany: { data: lines } },
        },
      });
      return v.id;
    });
    const v = await this.row(user, id);
    await this.audit.log(user, 'BOOK_VOUCHER', id, 'CREATED', v.voucherNo);
    return this.voucherDto(user, v);
  }

  private editable(user: RequestUser, v: VoucherRow) {
    if (v.source !== 'MANUAL') throw new BadRequestException('A voucher posted from a module changes with its record; change the record instead');
    if (v.status !== 'DRAFT' && v.status !== 'REJECTED') throw new BadRequestException('Only a draft or a voucher sent back can be changed');
  }

  async updateVoucher(user: RequestUser, id: string, dto: SaveVoucherDto): Promise<BookVoucherDto> {
    this.assertKeep(user);
    const v = await this.row(user, id);
    this.editable(user, v);
    if (dto.type !== v.type) throw new BadRequestException('The type of a voucher stays as made. Delete this one and make a new one.');
    await this.assertOpen(user.organizationId, dto.date);
    const lines = await this.linesOf(user, dto);
    await this.prisma.$transaction(async (tx) => {
      // A new financial year gives a new number.
      const voucherNo = fyCode(dto.date) === fyCode(dateOnly(v.date)!) ? v.voucherNo : await this.nextNumber(tx, user.organizationId, dto.type, dto.date);
      await tx.bookLine.deleteMany({ where: { voucherId: id } });
      await tx.bookVoucher.update({
        where: { id },
        data: {
          voucherNo,
          date: parseDate(dto.date),
          reference: dto.reference || null,
          narration: dto.narration,
          projectId: dto.projectId || null,
          amount: lines.reduce((s, l) => s.add(l.debit), D(0)),
          lines: { createMany: { data: lines } },
        },
      });
    });
    await this.audit.log(user, 'BOOK_VOUCHER', id, 'UPDATED', v.voucherNo);
    return this.voucher(user, id);
  }

  async removeVoucher(user: RequestUser, id: string) {
    this.assertKeep(user);
    const v = await this.row(user, id);
    this.editable(user, v);
    await this.prisma.bookVoucher.delete({ where: { id } });
    await this.audit.log(user, 'BOOK_VOUCHER', id, 'DELETED', v.voucherNo);
    return { ok: true };
  }

  async submit(user: RequestUser, id: string): Promise<BookVoucherDto> {
    this.assertKeep(user);
    const v = await this.row(user, id);
    this.editable(user, v);
    await this.assertOpen(user.organizationId, dateOnly(v.date)!);
    await this.prisma.bookVoucher.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), reviewNote: null } });
    await this.audit.log(user, 'BOOK_VOUCHER', id, 'SUBMITTED', v.voucherNo);
    return this.voucher(user, id);
  }

  private async decidable(user: RequestUser, id: string) {
    this.assertKeep(user);
    if (!canApproveVouchers(user.roleKey)) throw new ForbiddenException('Only management or an admin approves vouchers');
    const v = await this.row(user, id);
    if (v.source !== 'MANUAL' || v.status !== 'SUBMITTED') throw new BadRequestException('Only a voucher waiting for approval can be decided');
    if (v.preparedById === user.id) throw new ForbiddenException('Someone other than who made the voucher approves it');
    return v;
  }

  async approve(user: RequestUser, id: string, note?: string): Promise<BookVoucherDto> {
    const v = await this.decidable(user, id);
    await this.assertOpen(user.organizationId, dateOnly(v.date)!);
    await this.prisma.bookVoucher.update({ where: { id }, data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date(), reviewNote: note || null } });
    await this.audit.log(user, 'BOOK_VOUCHER', id, 'APPROVED', note || v.voucherNo);
    return this.voucher(user, id);
  }

  async reject(user: RequestUser, id: string, note: string): Promise<BookVoucherDto> {
    const v = await this.decidable(user, id);
    await this.prisma.bookVoucher.update({ where: { id }, data: { status: 'REJECTED', reviewNote: note } });
    await this.audit.log(user, 'BOOK_VOUCHER', id, 'CHANGES_REQUESTED', `${v.voucherNo}: ${note}`);
    return this.voucher(user, id);
  }

  /** Take an approved voucher out of the books; it keeps its number, marked cancelled. */
  async cancel(user: RequestUser, id: string, note: string): Promise<BookVoucherDto> {
    this.assertKeep(user);
    if (!canApproveVouchers(user.roleKey)) throw new ForbiddenException('Only management or an admin cancels an approved voucher');
    const v = await this.row(user, id);
    if (v.source !== 'MANUAL' || v.status !== 'APPROVED') throw new BadRequestException('Only an approved voucher made by hand can be cancelled');
    await this.assertOpen(user.organizationId, dateOnly(v.date)!);
    await this.prisma.$transaction([
      this.prisma.bankStatementLine.updateMany({ where: { organizationId: user.organizationId, bookLine: { voucherId: id } }, data: { bookLineId: null, matchedBy: null, matchedAt: null } }),
      this.prisma.bookVoucher.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), reviewNote: note } }),
    ]);
    await this.audit.log(user, 'BOOK_VOUCHER', id, 'CANCELLED', `${v.voucherNo}: ${note}`);
    return this.voucher(user, id);
  }

  // ----- For the Accounts module's home -----

  /** Cash and bank in hand today, and what waits: vouchers to approve, records that could not be posted. */
  async figures(user: RequestUser) {
    if (!canKeepBooks(user.roleKey)) return null;
    const [accounts, status] = await Promise.all([this.accounts(user), this.status(user)]);
    const sum = (g: AccountGroup) => accounts.filter((a) => a.group === g).reduce((s, a) => s.add(a.balance), D(0));
    return { cash: money(sum('CASH_IN_HAND'))!, bank: money(sum('BANK_ACCOUNTS'))!, toApprove: status.toApprove, held: status.held.length, moneyAccounts: accounts.filter((a) => isMoneyGroup(a.group)).length };
  }
}

import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  billLabel,
  canRecordReceipt,
  canViewContract,
  revisedCompletion,
  type AgeingDto,
  type ClientReceivableDto,
  type OpenBillDto,
  type Paginated,
  type ProjectReceivableDto,
  type ReceiptDto,
  type ReceiptSortField,
  type ReceivablesDto,
  type ReceivableTotalsDto,
  type SortOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, fxRate, iso, money, parseDate } from '../common/serialize';
import { bankCredit } from '../epc/epc-rules';
import { todayIn } from '../notifications/time';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { deductedOn, invoiceOf, RECEIPT_SUMS, settlement, syncBillStage } from './bill-settlement';
import { CreateReceiptDto, ListReceiptsQuery, ReceivablesQuery, UpdateReceiptDto } from './receivables.dto';
import { assertNotExported } from '../tally/exported';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const DAY = 24 * 3600 * 1000;
/** A receipt may settle a bill to within a rupee of rounding. */
const TOLERANCE = D(1);

const include = {
  project: { select: { code: true, name: true, clientName: true, currency: true, exchangeRate: true, client: { select: { name: true } } } },
  bill: { select: { billNo: true, isFinal: true, omYear: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.ReceiptInclude;
type Row = Prisma.ReceiptGetPayload<{ include: typeof include }>;

const ORDER: Record<ReceiptSortField, (o: SortOrder) => Prisma.ReceiptOrderByWithRelationInput[]> = {
  receiptDate: (o) => [{ receiptDate: o }, { createdAt: o }],
  amount: (o) => [{ amount: o }],
  project: (o) => [{ project: { name: o } }, { receiptDate: 'desc' }],
  kind: (o) => [{ kind: o }, { receiptDate: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};

const DEDUCTION_FIELDS = ['tdsAmount', 'gstTdsAmount', 'retentionAmount', 'securityDepositAmount', 'advanceRecoveryAmount', 'labourCessAmount', 'otherDeduction'] as const;

interface Totals {
  billed: Prisma.Decimal;
  received: Prisma.Decimal;
  deducted: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  ageing: [Prisma.Decimal, Prisma.Decimal, Prisma.Decimal, Prisma.Decimal];
  notSent: Prisma.Decimal;
  retentionHeld: Prisma.Decimal;
  depositHeld: Prisma.Decimal;
  tdsDeducted: Prisma.Decimal;
  gstTdsDeducted: Prisma.Decimal;
}
const emptyTotals = (): Totals => ({
  billed: ZERO,
  received: ZERO,
  deducted: ZERO,
  outstanding: ZERO,
  ageing: [ZERO, ZERO, ZERO, ZERO],
  notSent: ZERO,
  retentionHeld: ZERO,
  depositHeld: ZERO,
  tdsDeducted: ZERO,
  gstTdsDeducted: ZERO,
});
const addTotals = (a: Totals, b: Totals): Totals => ({
  billed: a.billed.add(b.billed),
  received: a.received.add(b.received),
  deducted: a.deducted.add(b.deducted),
  outstanding: a.outstanding.add(b.outstanding),
  ageing: [a.ageing[0].add(b.ageing[0]), a.ageing[1].add(b.ageing[1]), a.ageing[2].add(b.ageing[2]), a.ageing[3].add(b.ageing[3])],
  notSent: a.notSent.add(b.notSent),
  retentionHeld: a.retentionHeld.add(b.retentionHeld),
  depositHeld: a.depositHeld.add(b.depositHeld),
  tdsDeducted: a.tdsDeducted.add(b.tdsDeducted),
  gstTdsDeducted: a.gstTdsDeducted.add(b.gstTdsDeducted),
});
const totalsDto = (t: Totals): ReceivableTotalsDto => ({
  billed: money(t.billed)!,
  received: money(t.received)!,
  deducted: money(t.deducted)!,
  outstanding: money(t.outstanding)!,
  ageing: { current: money(t.ageing[0])!, days31to60: money(t.ageing[1])!, days61to90: money(t.ageing[2])!, over90: money(t.ageing[3])! } satisfies AgeingDto,
  notSent: money(t.notSent)!,
  retentionHeld: money(t.retentionHeld)!,
  depositHeld: money(t.depositHeld)!,
  tdsDeducted: money(t.tdsDeducted)!,
  gstTdsDeducted: money(t.gstTdsDeducted)!,
});

const addMonths = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/**
 * Receivables (v3 item 19): money received from clients against RA bills, with the deductions the client actually made
 * (TDS, GST TDS, retention, security deposit, advance recovery, cess, other), and releases of the retention and deposit it
 * held. A bill is paid once its receipts settle work + GST. The summary ages what is outstanding from the day each bill
 * was sent, per project and per client, with retention held and when it falls due.
 */
@Injectable()
export class ReceivablesService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private notifications: NotificationsService) {}

  toDto(r: Row): ReceiptDto {
    return {
      id: r.id,
      kind: r.kind,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      clientName: r.project.client?.name ?? r.project.clientName,
      billId: r.billId,
      billLabel: r.bill ? billLabel(r.bill.billNo, r.bill.isFinal, r.bill.omYear !== null) : null,
      receiptDate: dateOnly(r.receiptDate)!,
      amount: money(r.amount)!,
      currency: r.project.currency,
      contractRate: fxRate(r.project.exchangeRate),
      exchangeRate: fxRate(r.exchangeRate),
      bankCredit: money(bankCredit(r.amount, r.project.exchangeRate, r.exchangeRate))!,
      mode: r.mode,
      reference: r.reference,
      tdsAmount: money(r.tdsAmount)!,
      gstTdsAmount: money(r.gstTdsAmount)!,
      retentionAmount: money(r.retentionAmount)!,
      securityDepositAmount: money(r.securityDepositAmount)!,
      advanceRecoveryAmount: money(r.advanceRecoveryAmount)!,
      labourCessAmount: money(r.labourCessAmount)!,
      otherDeduction: money(r.otherDeduction)!,
      otherDeductionNote: r.otherDeductionNote,
      deductedAmount: money(deductedOn(r))!,
      remarks: r.remarks,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt)!,
      exportedToTally: !!r.tallyExportId,
    };
  }

  private assertCanSee(user: RequestUser) {
    if (!canViewContract(user.roleKey)) throw new ForbiddenException('Your role cannot see receivables');
  }

  private assertCanRecord(user: RequestUser) {
    if (!canRecordReceipt(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts record receipts');
  }

  async list(user: RequestUser, q: ListReceiptsQuery): Promise<Paginated<ReceiptDto>> {
    this.assertCanSee(user);
    const where: Prisma.ReceiptWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.billId) where.billId = q.billId;
    if (q.kind) where.kind = q.kind;
    if (q.from || q.to) where.receiptDate = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ reference: ilike(w) }, { remarks: ilike(w) }, { project: { name: ilike(w) } }, { project: { code: ilike(w) } }, { project: { clientName: ilike(w) } }],
      }));
    const sortBy = q.sortBy ?? 'receiptDate';
    const order = q.sortOrder ?? (sortBy === 'project' || sortBy === 'kind' ? 'asc' : 'desc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.receipt.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.receipt.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<ReceiptDto> {
    this.assertCanSee(user);
    const row = await this.prisma.receipt.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Receipt not found');
    return this.toDto(row);
  }

  /** Amounts of a receipt as decimals, with the checks every receipt passes. */
  private amounts(dto: Partial<Record<'amount' | (typeof DEDUCTION_FIELDS)[number], string>>, current?: Record<'amount' | (typeof DEDUCTION_FIELDS)[number], Prisma.Decimal>) {
    const out = {} as Record<'amount' | (typeof DEDUCTION_FIELDS)[number], Prisma.Decimal>;
    for (const k of ['amount', ...DEDUCTION_FIELDS] as const) {
      const v = dto[k] !== undefined ? D(dto[k]!) : (current?.[k] ?? ZERO);
      if (v.lt(0)) throw new BadRequestException('Amounts cannot be negative');
      if (v.decimalPlaces() > 2) throw new BadRequestException('Amounts are in rupees and paise');
      out[k] = v;
    }
    return out;
  }

  private checkDate(date: string, after: Date | null, what: string) {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The receipt date cannot be in the future');
    if (after && parseDate(date) < after) throw new BadRequestException(`The receipt date cannot be before ${what} (${dateOnly(after)})`);
  }

  /** A receipt against a bill must not settle more than the bill has outstanding (other receipts excluded). */
  private async checkBillBalance(tx: Prisma.TransactionClient, billId: string, excludeId: string | null, adds: Prisma.Decimal) {
    const bill = await tx.raBill.findUniqueOrThrow({ where: { id: billId }, include: { receipts: { where: excludeId ? { id: { not: excludeId } } : {}, select: RECEIPT_SUMS } } });
    const outstanding = invoiceOf(bill).sub(settlement(bill.receipts).settled);
    if (adds.gt(outstanding.add(TOLERANCE))) {
      throw new BadRequestException(`This settles ₹${adds.toFixed(2)} (received plus deducted) but only ₹${Prisma.Decimal.max(outstanding, ZERO).toFixed(2)} is outstanding on the bill`);
    }
  }

  /** Retention (or deposit) the client still holds on a project, other receipts excluded. */
  private async held(tx: Prisma.TransactionClient, projectId: string, kind: 'RETENTION_RELEASE' | 'DEPOSIT_RELEASE', excludeId: string | null) {
    const field = kind === 'RETENTION_RELEASE' ? 'retentionAmount' : 'securityDepositAmount';
    const not = excludeId ? { id: { not: excludeId } } : {};
    const [deducted, released] = await Promise.all([
      tx.receipt.aggregate({ where: { projectId, kind: 'BILL', ...not }, _sum: { [field]: true } }),
      tx.receipt.aggregate({ where: { projectId, kind, ...not }, _sum: { amount: true } }),
    ]);
    return ((deducted._sum as Record<string, Prisma.Decimal | null>)[field] ?? ZERO).sub(released._sum.amount ?? ZERO);
  }

  /** After a bill receipt changes or goes, what was released must still be covered by what was deducted. */
  private async assertReleasesCovered(tx: Prisma.TransactionClient, projectId: string) {
    for (const [kind, what] of [['RETENTION_RELEASE', 'retention'], ['DEPOSIT_RELEASE', 'security deposit']] as const) {
      const held = await this.held(tx, projectId, kind, null);
      if (held.lt(TOLERANCE.neg())) throw new BadRequestException(`More ${what} has been released on this project than would then be deducted. Correct the release first.`);
    }
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.receipt.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateReceiptDto): Promise<ReceiptDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    this.assertCanRecord(user);
    const kind = dto.kind ?? 'BILL';
    const a = this.amounts(dto);
    let projectId: string;
    let billId: string | null = null;
    if (kind === 'BILL') {
      if (!dto.billId) throw new BadRequestException('Choose the bill this payment is for');
      const bill = await this.prisma.raBill.findFirst({ where: { id: dto.billId, organizationId: user.organizationId } });
      if (!bill) throw new NotFoundException('Bill not found');
      await this.access.assertCanAccessProject(user, bill.projectId);
      if (bill.status !== 'APPROVED' || bill.stage === 'NOT_SENT') throw new BadRequestException('Payments are recorded against bills sent to the client');
      this.checkDate(dto.receiptDate, bill.sentDate, 'the date the bill was sent');
      projectId = bill.projectId;
      billId = bill.id;
    } else {
      if (!dto.projectId) throw new BadRequestException('Choose the project');
      if (dto.billId) throw new BadRequestException('A release is recorded against the project, not a bill');
      if (DEDUCTION_FIELDS.some((k) => !a[k].isZero())) throw new BadRequestException('A release has no deductions');
      await this.access.assertCanAccessProject(user, dto.projectId);
      this.checkDate(dto.receiptDate, null, '');
      projectId = dto.projectId;
    }
    const settles = a.amount.add(deductedOn(a));
    if (settles.lte(0)) throw new BadRequestException('Enter the amount received');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RCPT:${projectId}`}))`;
        if (billId) await this.checkBillBalance(tx, billId, null, settles);
        else {
          const held = await this.held(tx, projectId, kind as 'RETENTION_RELEASE' | 'DEPOSIT_RELEASE', null);
          if (a.amount.gt(held.add(TOLERANCE))) throw new BadRequestException(`The client holds ₹${Prisma.Decimal.max(held, ZERO).toFixed(2)} on this project`);
        }
        const row = await tx.receipt.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId,
            billId,
            kind,
            receiptDate: parseDate(dto.receiptDate),
            mode: dto.mode ?? 'BANK',
            reference: dto.reference ?? null,
            otherDeductionNote: dto.otherDeductionNote ?? null,
            remarks: dto.remarks ?? null,
            exchangeRate: await this.dayRate(tx, projectId, dto.exchangeRate),
            createdById: user.id,
            ...a,
          },
          select: { id: true },
        });
        if (billId) await syncBillStage(tx, billId);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.audit.log(user, 'RECEIPT', id, 'CREATED', billId ? `₹${a.amount.toFixed(2)} received` : null);
    if (billId) await this.audit.log(user, 'BILL', billId, 'PAYMENT_RECEIVED', `₹${a.amount.toFixed(2)} received on ${dto.receiptDate}${dto.reference ? ` (${dto.reference})` : ''}`);
    await this.notifications.onClientReceipt(user, id);
    return this.get(user, id);
  }

  private async load(user: RequestUser, id: string) {
    this.assertCanRecord(user);
    const row = await this.prisma.receipt.findFirst({ where: { id, organizationId: user.organizationId }, include: { bill: { select: { sentDate: true } } } });
    if (!row) throw new NotFoundException('Receipt not found');
    await this.access.assertCanAccessProject(user, row.projectId);
    return row;
  }

  async update(user: RequestUser, id: string, dto: UpdateReceiptDto): Promise<ReceiptDto> {
    const row = await this.load(user, id);
    assertNotExported(row, 'This receipt');
    const a = this.amounts(dto, row);
    if (row.kind !== 'BILL' && DEDUCTION_FIELDS.some((k) => !a[k].isZero())) throw new BadRequestException('A release has no deductions');
    if (dto.receiptDate !== undefined) this.checkDate(dto.receiptDate, row.bill?.sentDate ?? null, 'the date the bill was sent');
    const settles = a.amount.add(deductedOn(a));
    if (settles.lte(0)) throw new BadRequestException('Enter the amount received');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RCPT:${row.projectId}`}))`;
      if (row.billId) await this.checkBillBalance(tx, row.billId, id, settles);
      else {
        const held = await this.held(tx, row.projectId, row.kind as 'RETENTION_RELEASE' | 'DEPOSIT_RELEASE', id);
        if (a.amount.gt(held.add(TOLERANCE))) throw new BadRequestException(`The client holds ₹${Prisma.Decimal.max(held, ZERO).toFixed(2)} on this project`);
      }
      await tx.receipt.update({
        where: { id },
        data: {
          ...a,
          ...(dto.receiptDate !== undefined ? { receiptDate: parseDate(dto.receiptDate) } : {}),
          ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
          ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
          ...(dto.otherDeductionNote !== undefined ? { otherDeductionNote: dto.otherDeductionNote } : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
          ...(dto.exchangeRate !== undefined ? { exchangeRate: await this.dayRate(tx, row.projectId, dto.exchangeRate) } : {}),
        },
      });
      if (row.billId) {
        await this.assertReleasesCovered(tx, row.projectId);
        await syncBillStage(tx, row.billId);
      }
    });
    await this.audit.log(user, 'RECEIPT', id, 'UPDATED');
    return this.get(user, id);
  }

  /**
   * The day's rate of a receipt on a project in another currency (item 130); none in rupees. Its amounts are kept at the
   * contract rate like the bills they settle, and what the bank credited is at the day's rate.
   */
  private async dayRate(tx: Prisma.TransactionClient, projectId: string, rate: string | null | undefined) {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { currency: true } });
    if (project.currency === 'INR' || !rate) return null;
    const r = new Prisma.Decimal(rate);
    if (r.lte(0)) throw new BadRequestException(`Give the rupees to one ${project.currency} on the day, or leave it empty for the contract rate`);
    return r;
  }

  /** Take a receipt off (entered by mistake); its bill goes back to unpaid if it no longer settles. */
  async remove(user: RequestUser, id: string) {
    const row = await this.load(user, id);
    assertNotExported(row, 'This receipt');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RCPT:${row.projectId}`}))`;
      await tx.receipt.delete({ where: { id } });
      if (row.billId) {
        await this.assertReleasesCovered(tx, row.projectId);
        await syncBillStage(tx, row.billId);
      }
    });
    await this.audit.log(user, 'RECEIPT', id, 'DELETED', `₹${row.amount.toFixed(2)} of ${dateOnly(row.receiptDate)}`);
    if (row.billId) await this.audit.log(user, 'BILL', row.billId, 'PAYMENT_REMOVED', `₹${row.amount.toFixed(2)} of ${dateOnly(row.receiptDate)} taken off`);
    return { ok: true };
  }

  /** Receivables as of today, for the projects the user can see. */
  async summary(user: RequestUser, q: ReceivablesQuery = {}): Promise<ReceivablesDto> {
    this.assertCanSee(user);
    // The sites' day (India), as the rest of the app counts it: the UTC date is a day behind from 18:30 UTC to midnight.
    const asOf = todayIn();
    const today = parseDate(asOf).getTime();
    const projects = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}) },
      select: {
        id: true,
        code: true,
        name: true,
        clientName: true,
        endDate: true,
        defectLiabilityMonths: true,
        client: { select: { name: true } },
        risks: { where: { eotGrantedDays: { not: null } }, select: { eotGrantedDays: true } },
      },
      orderBy: { code: 'asc' },
    });
    const ids = projects.map((p) => p.id);
    const [bills, receipts] = await Promise.all([
      this.prisma.raBill.findMany({
        where: { projectId: { in: ids }, status: 'APPROVED' },
        select: { id: true, projectId: true, billNo: true, isFinal: true, omYear: true, stage: true, billDate: true, sentDate: true, certifiedDate: true, grossAmount: true, pvAmount: true, gstAmount: true, receipts: { select: RECEIPT_SUMS } },
        orderBy: [{ projectId: 'asc' }, { billNo: 'asc' }],
      }),
      this.prisma.receipt.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, kind: true, ...RECEIPT_SUMS } }),
    ]);
    const byProject = new Map(ids.map((id) => [id, emptyTotals()]));
    const openBills: OpenBillDto[] = [];
    const project = new Map(projects.map((p) => [p.id, p]));
    for (const b of bills) {
      const t = byProject.get(b.projectId)!;
      const invoice = invoiceOf(b);
      if (b.stage === 'NOT_SENT' || !b.sentDate) {
        t.notSent = t.notSent.add(invoice);
        continue;
      }
      const { received, settled } = settlement(b.receipts);
      const outstanding = Prisma.Decimal.max(invoice.sub(settled), ZERO);
      t.billed = t.billed.add(invoice);
      t.received = t.received.add(received);
      t.deducted = t.deducted.add(settled.sub(received));
      t.outstanding = t.outstanding.add(outstanding);
      if (outstanding.gt(0)) {
        const days = Math.max(0, Math.floor((today - b.sentDate.getTime()) / DAY));
        const bucket = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
        t.ageing[bucket] = t.ageing[bucket].add(outstanding);
        const p = project.get(b.projectId)!;
        openBills.push({
          billId: b.id,
          billLabel: billLabel(b.billNo, b.isFinal, b.omYear !== null),
          projectId: p.id,
          projectCode: p.code,
          projectName: p.name,
          clientName: p.client?.name ?? p.clientName,
          stage: b.stage,
          billDate: dateOnly(b.billDate)!,
          sentDate: dateOnly(b.sentDate)!,
          certifiedDate: dateOnly(b.certifiedDate),
          invoiceAmount: money(invoice)!,
          settledAmount: money(settled)!,
          outstanding: money(outstanding)!,
          daysOutstanding: days,
        });
      }
    }
    for (const r of receipts) {
      const t = byProject.get(r.projectId)!;
      if (r.kind === 'BILL') {
        t.retentionHeld = t.retentionHeld.add(r.retentionAmount);
        t.depositHeld = t.depositHeld.add(r.securityDepositAmount);
        t.tdsDeducted = t.tdsDeducted.add(r.tdsAmount);
        t.gstTdsDeducted = t.gstTdsDeducted.add(r.gstTdsAmount);
      } else if (r.kind === 'RETENTION_RELEASE') t.retentionHeld = t.retentionHeld.sub(r.amount);
      else t.depositHeld = t.depositHeld.sub(r.amount);
    }

    const projectRows: ProjectReceivableDto[] = projects.map((p) => {
      const t = byProject.get(p.id)!;
      const completion = revisedCompletion(dateOnly(p.endDate), p.risks.reduce((s, r) => s + (r.eotGrantedDays ?? 0), 0));
      return {
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        clientName: p.client?.name ?? p.clientName,
        retentionReleaseDate: completion && p.defectLiabilityMonths !== null ? addMonths(completion, p.defectLiabilityMonths) : null,
        ...totalsDto(t),
      };
    });
    const clients = new Map<string, { totals: Totals; projects: number }>();
    for (const p of projects) {
      const name = p.client?.name ?? p.clientName ?? 'No client';
      const c = clients.get(name) ?? { totals: emptyTotals(), projects: 0 };
      clients.set(name, { totals: addTotals(c.totals, byProject.get(p.id)!), projects: c.projects + 1 });
    }
    const clientRows: ClientReceivableDto[] = [...clients.entries()]
      .map(([clientName, c]) => ({ clientName, projectCount: c.projects, ...totalsDto(c.totals) }))
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding) || a.clientName.localeCompare(b.clientName));
    const totals = [...byProject.values()].reduce(addTotals, emptyTotals());
    openBills.sort((a, b) => b.daysOutstanding - a.daysOutstanding || Number(b.outstanding) - Number(a.outstanding));
    return { asOf, totals: totalsDto(totals), projects: projectRows, clients: clientRows, openBills };
  }
}

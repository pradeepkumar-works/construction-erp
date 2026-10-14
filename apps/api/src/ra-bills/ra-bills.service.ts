import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BILL_DEDUCTION_LABELS, billLabel, canPrepareBill, isGuest, type BillDeductionKey, type BillSortField, type Paginated, type RaBillDeductionDto, type RaBillDto, type SortOrder } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService } from '../common/attachments.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { BillDateDto, CertifyBillDto, CreateRaBillDto, ListRaBillsQuery, UpdateRaBillDto } from './ra-bills.dto';
import { invoiceOf, RECEIPT_SUMS, settlement, syncBillStage } from '../receivables/bill-settlement';
import { ReceivablesService } from '../receivables/receivables.service';
import { assertNotExported } from '../tally/exported';
import { NotificationsService } from '../notifications/notifications.service';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const round2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const pctOf = (base: Prisma.Decimal, pct: Prisma.Decimal) => round2(base.mul(pct).div(100));
const pctStr = (d: Prisma.Decimal) => d.toFixed(2).replace(/\.?0+$/, '') || '0';

const include = {
  project: {
    select: {
      name: true,
      code: true,
      workOrderNo: true,
      agreementNo: true,
      agreementDate: true,
      clientName: true,
      client: { select: { name: true, department: true, gstin: true, billingAddress: true, stateCode: true } },
    },
  },
  items: { include: { boqItem: { select: { itemNo: true, description: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: true,
  receipts: { select: RECEIPT_SUMS },
  _count: { select: { measurements: true } },
} satisfies Prisma.RaBillInclude;
type Row = Prisma.RaBillGetPayload<{ include: typeof include }>;

const sheetInclude = { boqItem: { select: { itemNo: true, unit: true } }, lines: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.MeasurementSheetInclude;
type SheetRow = Prisma.MeasurementSheetGetPayload<{ include: typeof sheetInclude }>;

const ORDER: Record<BillSortField, (o: SortOrder) => Prisma.RaBillOrderByWithRelationInput[]> = {
  billDate: (o) => [{ billDate: o }, { billNo: o }],
  billNo: (o) => [{ billNo: o }],
  grossAmount: (o) => [{ grossAmount: o }],
  netPayable: (o) => [{ netPayable: o }],
  status: (o) => [{ status: o }, { billDate: 'desc' }],
  stage: (o) => [{ stage: o }, { billDate: 'desc' }],
  project: (o) => [{ project: { name: o } }, { billNo: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['billDate', 'billNo', 'grossAmount', 'netPayable', 'createdAt']);

/** Deduction percentages of a bill, in the order the bill shows them. */
const PCT_DEDUCTIONS = [
  ['retention', 'retentionPct', 'retentionAmount'],
  ['securityDeposit', 'securityDepositPct', 'securityDepositAmount'],
  ['advanceRecovery', 'advanceRecoveryPct', 'advanceRecoveryAmount'],
  ['tds', 'tdsPct', 'tdsAmount'],
  ['gstTds', 'gstTdsPct', 'gstTdsAmount'],
  ['labourCess', 'labourCessPct', 'labourCessAmount'],
] as const;

type Percentages = Record<(typeof PCT_DEDUCTIONS)[number][1] | 'gstRate', Prisma.Decimal>;

interface Line {
  boqItemId: string;
  boqQty: Prisma.Decimal;
  rate: Prisma.Decimal;
  prevQty: Prisma.Decimal;
  thisQty: Prisma.Decimal;
  uptoQty: Prisma.Decimal;
  certifiedQty: Prisma.Decimal | null;
  sortOrder: number;
}

/** A day can be at most 36 hours ahead of the server clock (time zones). */
const checkNotFuture = (date: string, what: string) => {
  if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException(`The ${what} cannot be in the future`);
};

/**
 * Running-account bills (v3 item 18). A bill takes the approved measurements up to a date that no earlier bill took, and
 * prices them at the BOQ rates: previous / this bill / up-to-date quantities per BOQ item, GST on the work value, and the
 * contract's deductions (retention, security deposit, advance recovery capped at the advance still outstanding, TDS, GST
 * TDS, labour cess, any other). It is approved like any submission, then recorded as sent and certified (the client may
 * cut quantities; the claim is kept); receipts (`ReceivablesService`) mark it paid once they settle it. One bill per project
 * is open at a time, so "previous" is always well defined.
 */
@Injectable()
export class RaBillsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private rights: ApprovalRightsService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
    private receivables: ReceivablesService,
    private notifications: NotificationsService,
  ) {}

  toDto(r: Row, sheets?: SheetRow[], receipts?: RaBillDto['receipts']): RaBillDto {
    const { received, settled } = settlement(r.receipts);
    const invoice = invoiceOf(r);
    const deductions: RaBillDeductionDto[] = [];
    for (const [key, pctKey, amountKey] of PCT_DEDUCTIONS) {
      if (r[amountKey].isZero()) continue;
      deductions.push({ key, label: BILL_DEDUCTION_LABELS[key], pct: pctStr(r[pctKey]), amount: money(r[amountKey])! });
    }
    if (!r.otherDeduction.isZero()) {
      const key: BillDeductionKey = 'other';
      deductions.push({ key, label: r.otherDeductionNote || BILL_DEDUCTION_LABELS.other, pct: null, amount: money(r.otherDeduction)! });
    }
    const p = r.project;
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: p.name,
      projectCode: p.code,
      billNo: r.billNo,
      billLabel: billLabel(r.billNo, r.isFinal),
      isFinal: r.isFinal,
      billDate: dateOnly(r.billDate)!,
      measuredUpTo: dateOnly(r.measuredUpTo)!,
      remarks: r.remarks,
      workOrderNo: p.workOrderNo,
      agreementNo: p.agreementNo,
      agreementDate: dateOnly(p.agreementDate),
      client: p.client,
      clientName: p.client?.name ?? p.clientName,
      grossPrevious: money(r.grossPrevious)!,
      grossAmount: money(r.grossAmount)!,
      grossUpto: money(r.grossUpto)!,
      gstRate: pctStr(r.gstRate),
      gstAmount: money(r.gstAmount)!,
      deductions,
      otherDeduction: money(r.otherDeduction)!,
      otherDeductionNote: r.otherDeductionNote,
      totalDeductions: money(r.totalDeductions)!,
      netPayable: money(r.netPayable)!,
      claimedGross: money(r.claimedGross),
      claimedNet: money(r.claimedNet),
      stage: r.stage,
      exportedToTally: !!r.tallyExportId,
      sentDate: dateOnly(r.sentDate),
      certifiedDate: dateOnly(r.certifiedDate),
      certificateNo: r.certificateNo,
      paidDate: dateOnly(r.paidDate),
      measurementCount: r._count.measurements,
      invoiceAmount: money(invoice)!,
      receivedAmount: money(received)!,
      settledAmount: money(settled)!,
      outstanding: money(Prisma.Decimal.max(invoice.sub(settled), ZERO))!,
      receipts,
      items: r.items.map((i) => {
        const prevAmount = round2(i.prevQty.mul(i.rate));
        const extraItem = i.boqQty.isZero();
        const excess = i.uptoQty.sub(i.boqQty);
        return {
          id: i.id,
          boqItemId: i.boqItemId,
          itemNo: i.boqItem.itemNo,
          description: i.boqItem.description,
          unit: i.boqItem.unit,
          boqQty: dec(i.boqQty)!,
          rate: money(i.rate)!,
          prevQty: dec(i.prevQty)!,
          thisQty: dec(i.thisQty)!,
          uptoQty: dec(i.uptoQty)!,
          certifiedQty: dec(i.certifiedQty),
          prevAmount: money(prevAmount)!,
          amount: money(i.amount)!,
          uptoAmount: money(prevAmount.add(i.amount))!,
          excessQty: !extraItem && excess.gt(0) ? dec(excess)! : '0',
          extraItem,
        };
      }),
      measurements: sheets?.map((s) => ({
        id: s.id,
        mbNo: s.mbNo,
        date: dateOnly(s.date)!,
        boqItemNo: s.boqItem.itemNo,
        unit: s.boqItem.unit,
        location: s.location,
        totalQty: dec(s.totalQty)!,
        lines: s.lines.map((l) => ({
          id: l.id,
          description: l.description,
          nos: dec(l.nos),
          length: dec(l.length),
          breadth: dec(l.breadth),
          depth: dec(l.depth),
          deduct: l.deduct,
          quantity: dec(l.quantity)!,
        })),
      })),
      status: r.status,
      submittedById: r.submittedById,
      submittedByName: r.submittedBy.fullName,
      submittedAt: iso(r.submittedAt),
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      reviewedAt: iso(r.reviewedAt),
      reviewNote: r.reviewNote,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  /** Billing roles, plus any role the approval matrix lets approve bills. */
  private async assertCanSee(user: RequestUser) {
    if (canPrepareBill(user.roleKey)) return;
    const rights = await this.rights.rightsFor(user.organizationId, user.roleKey);
    if (!rights.some((r) => r.type === 'BILL')) throw new ForbiddenException('Your role cannot see RA bills');
  }

  private async assertCanPrepare(user: RequestUser, projectId: string) {
    if (!canPrepareBill(user.roleKey)) throw new ForbiddenException('Your role cannot prepare RA bills');
    await this.access.assertCanAccessProject(user, projectId);
  }

  async list(user: RequestUser, q: ListRaBillsQuery): Promise<Paginated<RaBillDto>> {
    await this.assertCanSee(user);
    const where: Prisma.RaBillWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    if (q.stage) where.stage = q.stage;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          ...(/^\d{1,6}$/.test(w) ? [{ billNo: Number(w) }] : []),
          { project: { name: ilike(w) } },
          { project: { code: ilike(w) } },
          { project: { clientName: ilike(w) } },
          { certificateNo: ilike(w) },
          { remarks: ilike(w) },
        ],
      }));
    const sortBy = q.sortBy ?? 'billDate';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.raBill.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.raBill.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<RaBillDto> {
    await this.assertCanSee(user);
    const row = await this.prisma.raBill.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('RA bill not found');
    const [sheets, receipts] = await Promise.all([
      this.prisma.measurementSheet.findMany({ where: { raBillId: id }, include: sheetInclude, orderBy: [{ date: 'asc' }, { mbNo: 'asc' }] }),
      this.receivables.list(user, { billId: id, pageSize: 100, sortBy: 'receiptDate', sortOrder: 'asc' }).catch(() => null),
    ]);
    return this.toDto(row, sheets, receipts?.items);
  }

  /** Work value, GST, deductions and net payable of a set of lines priced on certified (else claimed) quantities. */
  private async totals(tx: Prisma.TransactionClient, bill: { id: string; projectId: string; billNo: number; otherDeduction: Prisma.Decimal }, lines: Line[], pcts: Percentages, advance: Prisma.Decimal) {
    const amounts = lines.map((l) => round2((l.certifiedQty ?? l.thisQty).mul(l.rate)));
    const grossAmount = amounts.reduce((s, a) => s.add(a), ZERO);
    const grossPrevious = lines.reduce((s, l) => s.add(round2(l.prevQty.mul(l.rate))), ZERO);
    const recovered = await tx.raBill.aggregate({ where: { projectId: bill.projectId, billNo: { lt: bill.billNo } }, _sum: { advanceRecoveryAmount: true } });
    const outstanding = Prisma.Decimal.max(advance.sub(recovered._sum.advanceRecoveryAmount ?? ZERO), ZERO);
    const base = Prisma.Decimal.max(grossAmount, ZERO);
    const data = {
      grossPrevious,
      grossAmount,
      grossUpto: grossPrevious.add(grossAmount),
      gstRate: pcts.gstRate,
      gstAmount: pctOf(base, pcts.gstRate),
      retentionPct: pcts.retentionPct,
      securityDepositPct: pcts.securityDepositPct,
      advanceRecoveryPct: pcts.advanceRecoveryPct,
      tdsPct: pcts.tdsPct,
      gstTdsPct: pcts.gstTdsPct,
      labourCessPct: pcts.labourCessPct,
      retentionAmount: pctOf(base, pcts.retentionPct),
      securityDepositAmount: pctOf(base, pcts.securityDepositPct),
      advanceRecoveryAmount: Prisma.Decimal.min(pctOf(base, pcts.advanceRecoveryPct), outstanding),
      tdsAmount: pctOf(base, pcts.tdsPct),
      gstTdsAmount: pctOf(base, pcts.gstTdsPct),
      labourCessAmount: pctOf(base, pcts.labourCessPct),
    };
    const totalDeductions = PCT_DEDUCTIONS.reduce((s, [, , k]) => s.add(data[k]), ZERO).add(bill.otherDeduction);
    return { amounts, data: { ...data, totalDeductions, netPayable: grossAmount.add(data.gstAmount).sub(totalDeductions) } };
  }

  /**
   * Re-take the bill's measurements and re-price it with the project's current BOQ and contract terms. Only for a bill
   * that is not approved; `strict` refuses a bill with nothing new in it.
   */
  private async recompute(tx: Prisma.TransactionClient, id: string, strict = true) {
    const bill = await tx.raBill.findUniqueOrThrow({
      where: { id },
      include: { project: { select: { retentionPct: true, securityDepositPct: true, advanceRecoveryPct: true, tdsPct: true, gstTdsPct: true, labourCessPct: true, gstRate: true, mobilisationAdvance: true } } },
    });
    await tx.measurementSheet.updateMany({ where: { raBillId: id }, data: { raBillId: null } });
    await tx.measurementSheet.updateMany({ where: { projectId: bill.projectId, status: 'APPROVED', raBillId: null, date: { lte: bill.measuredUpTo } }, data: { raBillId: id } });
    const earlier = { projectId: bill.projectId, billNo: { lt: bill.billNo } };
    const [measured, billed, boq] = await Promise.all([
      tx.measurementSheet.groupBy({ by: ['boqItemId'], where: { OR: [{ raBillId: id }, { raBill: earlier }] }, _sum: { totalQty: true } }),
      tx.raBillItem.findMany({ where: { bill: earlier }, select: { boqItemId: true, thisQty: true, certifiedQty: true } }),
      tx.boqItem.findMany({ where: { projectId: bill.projectId }, orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }] }),
    ]);
    const upto = new Map(measured.map((m) => [m.boqItemId, m._sum.totalQty ?? ZERO]));
    const prev = new Map<string, Prisma.Decimal>();
    for (const b of billed) prev.set(b.boqItemId, (prev.get(b.boqItemId) ?? ZERO).add(b.certifiedQty ?? b.thisQty));
    const lines: Line[] = [];
    boq.forEach((b, i) => {
      const uptoQty = upto.get(b.id) ?? ZERO;
      const prevQty = prev.get(b.id) ?? ZERO;
      if (uptoQty.lte(0) && prevQty.isZero()) return;
      lines.push({ boqItemId: b.id, boqQty: b.revisedQty ?? b.originalQty, rate: b.rate, prevQty, thisQty: uptoQty.sub(prevQty), uptoQty, certifiedQty: null, sortOrder: i });
    });
    const { amounts, data } = await this.totals(tx, bill, lines, bill.project, bill.project.mobilisationAdvance);
    if (strict && data.grossAmount.lte(0)) {
      throw new BadRequestException('Nothing new to bill: there are no approved measurements up to this date beyond what earlier bills took');
    }
    await tx.raBillItem.deleteMany({ where: { billId: id } });
    await tx.raBillItem.createMany({ data: lines.map((l, i) => ({ ...l, billId: id, amount: amounts[i] })) });
    await tx.raBill.update({ where: { id }, data });
  }

  private checkDates(billDate: string, measuredUpTo: string) {
    checkNotFuture(billDate, 'bill date');
    if (measuredUpTo > billDate) throw new BadRequestException('Measurements can only be billed up to the bill date');
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.raBill.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateRaBillDto): Promise<RaBillDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.assertCanPrepare(user, dto.projectId);
    const measuredUpTo = dto.measuredUpTo ?? dto.billDate;
    this.checkDates(dto.billDate, measuredUpTo);
    const otherDeduction = D(dto.otherDeduction ?? 0);
    if (otherDeduction.lt(0)) throw new BadRequestException('The other deduction cannot be negative');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RA:${dto.projectId}`}))`;
        const bills = await tx.raBill.findMany({ where: { projectId: dto.projectId }, select: { billNo: true, isFinal: true, status: true }, orderBy: { billNo: 'desc' } });
        const open = bills.find((b) => b.status !== 'APPROVED');
        if (open) throw new ConflictException(`${billLabel(open.billNo, open.isFinal)} is not approved yet. Finish or delete it before preparing the next bill.`);
        if (bills.some((b) => b.isFinal)) throw new ConflictException('The final bill of this project has already been made');
        const last = bills[0];
        if (last) {
          const lastDate = await tx.raBill.findFirstOrThrow({ where: { projectId: dto.projectId, billNo: last.billNo }, select: { measuredUpTo: true } });
          if (dateOnly(lastDate.measuredUpTo)! > measuredUpTo) throw new BadRequestException(`RA bill ${last.billNo} already took measurements up to ${dateOnly(lastDate.measuredUpTo)}`);
        }
        const row = await tx.raBill.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            billNo: (last?.billNo ?? 0) + 1,
            isFinal: !!dto.isFinal,
            billDate: parseDate(dto.billDate),
            measuredUpTo: parseDate(measuredUpTo),
            remarks: dto.remarks || null,
            otherDeduction,
            otherDeductionNote: dto.otherDeductionNote || null,
            ...Object.fromEntries(
              ['grossPrevious', 'grossAmount', 'grossUpto', 'gstRate', 'gstAmount', 'totalDeductions', 'netPayable', ...PCT_DEDUCTIONS.flatMap(([, p, a]) => [p, a])].map((k) => [k, ZERO]),
            ),
            submittedById: user.id,
            status: 'DRAFT',
          } as Prisma.RaBillUncheckedCreateInput,
          select: { id: true },
        });
        await this.recompute(tx, row.id);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.attachments.link(user, 'raBillId', id, dto.attachmentIds);
    await this.audit.log(user, 'BILL', id, 'CREATED');
    if (dto.submit) await this.lifecycle.submit(user, 'BILL', id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateRaBillDto): Promise<RaBillDto> {
    const row = await this.lifecycle.load(user, 'BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    const cur = await this.prisma.raBill.findUniqueOrThrow({ where: { id }, select: { billDate: true, measuredUpTo: true, billNo: true, projectId: true } });
    const billDate = dto.billDate ?? dateOnly(cur.billDate)!;
    const measuredUpTo = dto.measuredUpTo ?? dateOnly(cur.measuredUpTo)!;
    this.checkDates(billDate, measuredUpTo);
    const data: Prisma.RaBillUncheckedUpdateInput = {};
    if (dto.billDate !== undefined) data.billDate = parseDate(dto.billDate);
    if (dto.measuredUpTo !== undefined) {
      const before = await this.prisma.raBill.findFirst({ where: { projectId: cur.projectId, billNo: cur.billNo - 1 }, select: { measuredUpTo: true } });
      if (before && dateOnly(before.measuredUpTo)! > measuredUpTo) throw new BadRequestException(`RA bill ${cur.billNo - 1} already took measurements up to ${dateOnly(before.measuredUpTo)}`);
      data.measuredUpTo = parseDate(dto.measuredUpTo);
    }
    if (dto.isFinal !== undefined) data.isFinal = dto.isFinal;
    if (dto.otherDeduction !== undefined) {
      if (Number(dto.otherDeduction) < 0) throw new BadRequestException('The other deduction cannot be negative');
      data.otherDeduction = D(dto.otherDeduction);
    }
    if (dto.otherDeductionNote !== undefined) data.otherDeductionNote = dto.otherDeductionNote || null;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.raBill.update({ where: { id }, data });
      await this.recompute(tx, id);
    });
    await this.attachments.sync(user, 'raBillId', id, dto.attachmentIds);
    await this.audit.log(user, 'BILL', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'BILL', id);
    return this.get(user, id);
  }

  /** Re-takes the measurements approved since the bill was prepared, then submits it. */
  async submit(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.$transaction((tx) => this.recompute(tx, id));
    await this.lifecycle.submit(user, 'BILL', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.raBill.delete({ where: { id } });
    await this.audit.log(user, 'BILL', id, 'DELETED');
    return { ok: true };
  }

  /** An approved bill the user may move along with the client. */
  private async approvedBill(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    if (row.status !== 'APPROVED') throw new BadRequestException('Only an approved bill can be sent or certified');
    return this.prisma.raBill.findUniqueOrThrow({ where: { id }, include: { items: true, project: { select: { mobilisationAdvance: true } } } });
  }

  async send(user: RequestUser, id: string, dto: BillDateDto) {
    const bill = await this.approvedBill(user, id);
    if (bill.stage !== 'NOT_SENT' && bill.stage !== 'SENT') throw new BadRequestException('This bill is already certified');
    checkNotFuture(dto.date, 'date sent');
    if (dto.date < dateOnly(bill.billDate)!) throw new BadRequestException('A bill cannot be sent before its bill date');
    await this.prisma.raBill.update({ where: { id }, data: { stage: 'SENT', sentDate: parseDate(dto.date) } });
    await this.audit.log(user, 'BILL', id, 'SENT', `Sent to the client on ${dto.date}`);
    const out = await this.get(user, id);
    // The client's engineer and consultant on the project get it in their portal.
    if (bill.stage === 'NOT_SENT') {
      const guests = await this.access.projectGuests(user.organizationId, bill.projectId);
      if (guests.length)
        await this.notifications.notify({
          organizationId: user.organizationId,
          userIds: guests.map((g) => g.id),
          type: 'PORTAL',
          title: `${out.billLabel} sent for your certificate`,
          body: `${out.projectName}: work value ₹${out.grossAmount}, net payable ₹${out.netPayable}. Check the quantities and certify it in the client portal.`,
          projectId: bill.projectId,
          entityId: id,
        });
    }
    return out;
  }

  /**
   * The client's certificate: the quantities it passed (items not listed pass as claimed). The first certificate keeps
   * the claimed gross and net; the bill is re-priced on the certified quantities, and the next bill, if still open,
   * re-reads what was certified as its "previous".
   */
  async certify(user: RequestUser, id: string, dto: CertifyBillDto) {
    const bill = await this.approvedBill(user, id);
    await this.applyCertificate(user, bill, dto);
    return this.get(user, id);
  }

  /* ---------- the client portal ---------- */

  private clientWhere(user: RequestUser): Prisma.RaBillWhereInput {
    return { organizationId: user.organizationId, status: 'APPROVED', stage: { not: 'NOT_SENT' }, project: this.access.projectWhere(user) };
  }

  /** Bills sent to the client (and later stages) on a project the user can see, newest first: the client portal's list. */
  async listForClient(user: RequestUser, projectId: string): Promise<RaBillDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.raBill.findMany({ where: { ...this.clientWhere(user), projectId }, include, orderBy: { billNo: 'desc' } });
    return rows.map((r) => this.toDto(r));
  }

  /** One bill as the client sees it: only once sent, with its measurements. */
  async getForClient(user: RequestUser, id: string): Promise<RaBillDto> {
    const row = await this.prisma.raBill.findFirst({ where: { id, ...this.clientWhere(user) }, include });
    if (!row) throw new NotFoundException('RA bill not found');
    const sheets = await this.prisma.measurementSheet.findMany({ where: { raBillId: id }, include: sheetInclude, orderBy: [{ date: 'asc' }, { mbNo: 'asc' }] });
    return this.toDto(row, sheets);
  }

  /** The client's engineer or consultant certifies a sent bill from the portal; the QS and approvers are told. */
  async certifyAsClient(user: RequestUser, id: string, dto: CertifyBillDto) {
    const row = await this.prisma.raBill.findFirst({ where: { id, ...this.clientWhere(user) }, select: { projectId: true } });
    if (!row) throw new NotFoundException('RA bill not found');
    await this.access.assertCanActAsClient(user, row.projectId);
    const bill = await this.prisma.raBill.findUniqueOrThrow({ where: { id }, include: { items: true, project: { select: { mobilisationAdvance: true } } } });
    if (bill.stage !== 'SENT') throw new BadRequestException(bill.stage === 'PAID' ? 'This bill is already paid' : 'This bill is already certified');
    await this.applyCertificate(user, bill, dto);
    const dtoOut = await this.getForClient(user, id);
    const told = await this.access.approversForProject(user.organizationId, bill.projectId, 'BILL');
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: [...new Set([bill.submittedById, ...told.map((u) => u.id)])],
      type: 'PORTAL',
      title: `${dtoOut.billLabel} certified by the client`,
      body: `${user.fullName} certified ${dtoOut.billLabel} on ${dtoOut.projectName}${dto.certificateNo ? ` (certificate ${dto.certificateNo})` : ''}: work value ₹${dtoOut.grossAmount}${dtoOut.claimedGross && dtoOut.claimedGross !== dtoOut.grossAmount ? ` against ₹${dtoOut.claimedGross} claimed` : ''}.`,
      projectId: bill.projectId,
      entityType: 'BILL',
      entityId: id,
    });
    return dtoOut;
  }

  private async applyCertificate(user: RequestUser, bill: Awaited<ReturnType<RaBillsService['approvedBill']>>, dto: CertifyBillDto) {
    const id = bill.id;
    assertNotExported(bill, 'This bill');
    if (bill.stage !== 'SENT' && bill.stage !== 'CERTIFIED') throw new BadRequestException(bill.stage === 'PAID' ? 'This bill is already paid' : 'Record the bill as sent first');
    checkNotFuture(dto.date, 'certificate date');
    if (bill.sentDate && dto.date < dateOnly(bill.sentDate)!) throw new BadRequestException('The certificate date cannot be before the date the bill was sent');
    const cut = new Map<string, Prisma.Decimal>();
    for (const c of dto.items ?? []) {
      const item = bill.items.find((i) => i.boqItemId === c.boqItemId);
      if (!item) throw new BadRequestException('A certified item is not in this bill');
      const q = D(c.certifiedQty);
      if (q.lt(0)) throw new BadRequestException('A certified quantity cannot be negative');
      if (q.gt(item.thisQty)) throw new BadRequestException('A certified quantity cannot be more than the quantity claimed in this bill');
      cut.set(c.boqItemId, q);
    }
    const lines: Line[] = bill.items.map((i) => ({ ...i, certifiedQty: cut.get(i.boqItemId) ?? i.thisQty }));
    await this.prisma.$transaction(async (tx) => {
      const { amounts, data } = await this.totals(tx, bill, lines, bill, bill.project.mobilisationAdvance);
      for (const [i, l] of lines.entries()) await tx.raBillItem.update({ where: { id: bill.items[i].id }, data: { certifiedQty: l.certifiedQty, amount: amounts[i] } });
      await tx.raBill.update({
        where: { id },
        data: {
          ...data,
          stage: 'CERTIFIED',
          certifiedDate: parseDate(dto.date),
          certificateNo: dto.certificateNo ?? null,
          ...(bill.claimedGross === null ? { claimedGross: bill.grossAmount, claimedNet: bill.netPayable } : {}),
        },
      });
      await syncBillStage(tx, id);
      const next = await tx.raBill.findFirst({ where: { projectId: bill.projectId, billNo: bill.billNo + 1, status: { not: 'APPROVED' } }, select: { id: true } });
      if (next) await this.recompute(tx, next.id, false);
    });
    const by = isGuest(user.roleKey) ? ' by the client in the portal' : '';
    await this.audit.log(user, 'BILL', id, 'CERTIFIED', dto.certificateNo ? `Certificate ${dto.certificateNo} of ${dto.date}${by}` : `Certified on ${dto.date}${by}`);
  }

}

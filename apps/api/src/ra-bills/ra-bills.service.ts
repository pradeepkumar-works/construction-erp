import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BILL_DEDUCTION_LABELS, billLabel, canPrepareBill, isGuest, type BillDeductionKey, type BillSortField, type Paginated, type RaBillDeductionDto, type RaBillDto, type SlippageLineDto, type SortOrder } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { UNAPPROVED_EXTRA_ITEM } from '../variations/variations.service';
import { dateOnly, dec, fxRate, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords, dateRange } from '../common/paging';
import { BillDateDto, BillPriceVariationDto, CertifyBillDto, CreateRaBillDto, ListRaBillsQuery, UpdateRaBillDto } from './ra-bills.dto';
import { StageBillingService } from '../stage-billing/stage-billing.service';
import { BILL_TERMS_SELECT, PCT_DEDUCTIONS, TERMS_SELECT, billTotals, measuredLines, writeBill, type Line } from './ra-bill-pricing';
import { ClaimStageDto } from '../stage-billing/stage-billing.dto';
import { invoiceOf, RECEIPT_SUMS, settlement, syncBillStage } from '../receivables/bill-settlement';
import { ReceivablesService } from '../receivables/receivables.service';
import { assertNotExported } from '../tally/exported';
import { NotificationsService } from '../notifications/notifications.service';
import { omBillDto, omPercentages, omPricing, storedOmPricing } from '../om/om-bill';
import { loadOm } from '../om/om-load';
import { billProblem } from '../om/om-rules';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const round2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const pctStr = (d: Prisma.Decimal) => d.toFixed(2).replace(/\.?0+$/, '') || '0';
const pct3 = (d: Prisma.Decimal) => d.toFixed(3).replace(/\.?0+$/, '') || '0';

const include = {
  project: {
    select: {
      name: true,
      code: true,
      workOrderNo: true,
      agreementNo: true,
      agreementDate: true,
      clientName: true,
      tenderFactor: true,
      currency: true,
      exchangeRate: true,
      client: { select: { name: true, department: true, gstin: true, billingAddress: true, stateCode: true } },
    },
  },
  stageLines: { include: { stage: { select: { name: true, pct: true, trigger: true, component: { select: { code: true, name: true } } } } }, orderBy: { sortOrder: 'asc' } },
  items: { include: { boqItem: { select: { itemNo: true, description: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
  pvLines: { orderBy: { sortOrder: 'asc' } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
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

const idx = (d: Prisma.Decimal) => d.toFixed(3).replace(/\.?0+$/, '');

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
    private stageBilling: StageBillingService,
  ) {}

  toDto(r: Row, sheets?: SheetRow[], receipts?: RaBillDto['receipts']): RaBillDto {
    const { received, settled } = settlement(r.receipts);
    const invoice = invoiceOf(r);
    const deductions: RaBillDeductionDto[] = [];
    for (const [key, pctKey, amountKey] of PCT_DEDUCTIONS) {
      if (r[amountKey].isZero()) continue;
      deductions.push({ key, label: BILL_DEDUCTION_LABELS[key], pct: pctStr(r[pctKey]), amount: money(r[amountKey])! });
    }
    if (!r.slippageWithheld.isZero()) {
      const key: BillDeductionKey = 'slippage';
      deductions.push({ key, label: r.slippageWithheld.gt(0) ? BILL_DEDUCTION_LABELS.slippage : 'Milestone slippage released', pct: null, amount: money(r.slippageWithheld)! });
    }
    if (!r.omPenalty.isZero()) {
      const key: BillDeductionKey = 'omPenalty';
      deductions.push({ key, label: BILL_DEDUCTION_LABELS.omPenalty, pct: null, amount: money(r.omPenalty)! });
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
      currency: p.currency,
      exchangeRate: fxRate(p.exchangeRate),
      billNo: r.billNo,
      billLabel: billLabel(r.billNo, r.isFinal, r.omYear !== null),
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
      pvAmount: money(r.pvAmount)!,
      pvIndexMonth: dateOnly(r.pvIndexMonth),
      pvNote: r.pvNote,
      stageLines: r.stageLines.map((l) => {
        const prevAmount = round2(l.stageValue.mul(l.prevPct).div(100));
        return {
          id: l.id,
          stageId: l.stageId,
          componentCode: l.stage.component.code,
          componentName: l.stage.component.name,
          stageName: l.stage.name,
          trigger: l.stage.trigger,
          stagePct: pctStr(l.stage.pct),
          stageValue: money(l.stageValue)!,
          prevPct: pct3(l.prevPct),
          suggestedPct: pct3(l.suggestedPct),
          thisPct: pct3(l.thisPct),
          uptoPct: pct3(l.prevPct.add(l.thisPct)),
          claimedByHand: l.claimedByHand,
          note: l.note,
          certifiedPct: l.certifiedPct === null ? null : pct3(l.certifiedPct),
          prevAmount: money(prevAmount)!,
          amount: money(l.amount)!,
          evidenceText: l.evidenceText,
        };
      }),
      slippageWithheld: money(r.slippageWithheld)!,
      slippageLines: (r.slippageLines as SlippageLineDto[] | null) ?? [],
      om: omBillDto(r),
      tenderFactor: r.stageLines.length && r.project.tenderFactor ? r.project.tenderFactor.toFixed(6).replace(/\.?0+$/, '') : null,
      pvLines: r.pvLines.map((l) => ({ id: l.id, name: l.name, sharePct: pctStr(l.sharePct), baseIndex: idx(l.baseIndex), currentIndex: idx(l.currentIndex), amount: money(l.amount)! })),
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
    if (q.mine) where.submittedById = user.id;
    const days = dateRange(q.from, q.to);
    if (days) where.billDate = days;
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
    const [sheets, receipts, held] = await Promise.all([
      this.prisma.measurementSheet.findMany({ where: { raBillId: id }, include: sheetInclude, orderBy: [{ date: 'asc' }, { mbNo: 'asc' }] }),
      this.receivables.list(user, { billId: id, pageSize: 100, sortBy: 'receiptDate', sortOrder: 'asc' }).catch(() => null),
      row.status === 'APPROVED'
        ? []
        : this.prisma.measurementSheet.groupBy({
            by: ['boqItemId'],
            where: { projectId: row.projectId, status: 'APPROVED', raBillId: null, date: { lte: row.measuredUpTo }, boqItem: UNAPPROVED_EXTRA_ITEM },
            _sum: { totalQty: true },
          }),
    ]);
    const heldItems = held.length ? await this.prisma.boqItem.findMany({ where: { id: { in: held.map((h) => h.boqItemId) } }, select: { id: true, itemNo: true, description: true, unit: true } }) : [];
    const heldExtraItems = heldItems.map((b) => ({ boqItemId: b.id, itemNo: b.itemNo, description: b.description, unit: b.unit, qty: dec(held.find((h) => h.boqItemId === b.id)!._sum.totalQty)! }));
    return { ...this.toDto(row, sheets, receipts?.items), ...(row.status === 'APPROVED' ? {} : { heldExtraItems }) };
  }

  /**
   * Re-take the bill's measurements and re-price it with the project's current BOQ and contract terms. Only for a bill
   * that is not approved; `strict` refuses a bill with nothing new in it.
   */
  private async recompute(tx: Prisma.TransactionClient, id: string, strict = true) {
    const bill = await tx.raBill.findUniqueOrThrow({ where: { id }, include: { project: { select: BILL_TERMS_SELECT } } });
    // An O&M bill (item 131) bills its period's instalment, less staff short and the service level penalties.
    if (bill.omYear !== null && bill.omInstalment !== null) {
      const { pricing, detail } = await omPricing(tx, { ...bill, omYear: bill.omYear, omInstalment: bill.omInstalment });
      const { amounts, data } = await billTotals(tx, bill, [], omPercentages(bill.project), bill.project, null, pricing);
      if (strict && data.grossAmount.lte(0)) throw new BadRequestException('Nothing to bill: the pay of the staff short this period takes the whole instalment');
      await writeBill(tx, id, [], amounts, data, null);
      await tx.raBill.update({ where: { id }, data: { omDetail: detail as unknown as Prisma.InputJsonValue } });
      return;
    }
    // A lump-sum project with a billing break-up (item 129) bills its stages, and measures only its unit-rate items.
    const plan = await this.stageBilling.planFor(tx, bill);
    const lines = await measuredLines(tx, bill, plan);
    const { amounts, data } = await billTotals(tx, bill, lines, bill.project, bill.project, plan);
    if (strict && data.grossAmount.lte(0)) {
      throw new BadRequestException(
        plan
          ? 'Nothing new to bill: no stage has moved and no unit-rate item has been measured since the last bill'
          : 'Nothing new to bill: there are no approved measurements up to this date beyond what earlier bills took',
      );
    }
    await writeBill(tx, id, lines, amounts, data, plan);
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
    const om = dto.omYear !== undefined || dto.omInstalment !== undefined;
    if (om && (dto.omYear === undefined || dto.omInstalment === undefined)) throw new BadRequestException('Give both the O&M year and the instalment the bill is for');
    if (om && dto.isFinal) throw new BadRequestException('An O&M bill cannot be the final bill');
    let measuredUpTo = dto.measuredUpTo ?? dto.billDate;
    this.checkDates(dto.billDate, om ? dto.billDate : measuredUpTo);
    const otherDeduction = D(dto.otherDeduction ?? 0);
    if (otherDeduction.lt(0)) throw new BadRequestException('The other deduction cannot be negative');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RA:${dto.projectId}`}))`;
        const bills = await tx.raBill.findMany({ where: { projectId: dto.projectId }, select: { billNo: true, isFinal: true, status: true, omYear: true, omInstalment: true }, orderBy: { billNo: 'desc' } });
        const open = bills.find((b) => b.status !== 'APPROVED');
        if (open) throw new ConflictException(`${billLabel(open.billNo, open.isFinal, open.omYear !== null)} is not approved yet. Finish or delete it before preparing the next bill.`);
        const last = bills[0];
        if (om) {
          // An O&M bill follows the works' final bill; its period decides what it covers.
          const contract = await loadOm(tx, dto.projectId);
          if (!contract) throw new BadRequestException('This project has no O&M contract: set it up on its O&M tab first');
          const period = contract.periods.find((p) => p.year === dto.omYear && p.instalment === dto.omInstalment) ?? null;
          const billed = bills.filter((b) => b.omYear !== null).map((b) => ({ year: b.omYear!, instalment: b.omInstalment! }));
          const problem = billProblem(period, dto.billDate, billed, contract.periods);
          if (problem) throw new BadRequestException(problem);
          measuredUpTo = period!.to;
        } else if (bills.some((b) => b.isFinal)) {
          throw new ConflictException('The final bill of this project has already been made');
        } else if (last) {
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
            omYear: dto.omYear ?? null,
            omInstalment: dto.omInstalment ?? null,
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
    const cur = await this.prisma.raBill.findUniqueOrThrow({ where: { id }, select: { billDate: true, measuredUpTo: true, billNo: true, projectId: true, omYear: true } });
    if (cur.omYear !== null && (dto.measuredUpTo !== undefined || dto.isFinal)) throw new BadRequestException('An O&M bill covers its period: only its date, deductions and remarks can change');
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

  /**
   * The price variation on a bill not yet approved (v4 item 50): this bill's index for each component of the contract's
   * formula. The components are copied from the contract so later changes to it leave this bill alone. No indices
   * clears it.
   */
  async setPriceVariation(user: RequestUser, id: string, dto: BillPriceVariationDto): Promise<RaBillDto> {
    const row = await this.lifecycle.load(user, 'BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: row.projectId },
      select: { priceVariation: true, pvComponents: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    const indices = dto.indices ?? [];
    if (indices.length && !project.priceVariation) throw new BadRequestException("This project's contract has no price variation clause");
    const lines = indices.map((x) => {
      const c = project.pvComponents.find((p) => p.id === x.componentId);
      if (!c) throw new BadRequestException('A component is not in the contract\'s price variation formula; reload and try again');
      const currentIndex = D(x.currentIndex);
      if (currentIndex.lte(0)) throw new BadRequestException(`${c.name}: the current index must be more than 0`);
      return { name: c.name, sharePct: c.sharePct, baseIndex: c.baseIndex, currentIndex, sortOrder: c.sortOrder };
    });
    if (new Set(indices.map((x) => x.componentId)).size < indices.length) throw new BadRequestException('A component is listed twice');
    await this.prisma.$transaction(async (tx) => {
      await tx.raBillPvLine.deleteMany({ where: { billId: id } });
      await tx.raBillPvLine.createMany({ data: lines.map((l) => ({ ...l, billId: id, amount: ZERO })) });
      await tx.raBill.update({
        where: { id },
        data: lines.length ? { pvIndexMonth: dto.indexMonth ? parseDate(dto.indexMonth) : null, pvNote: dto.note || null } : { pvIndexMonth: null, pvNote: null, pvAmount: ZERO },
      });
      await this.recompute(tx, id, false);
    });
    await this.audit.log(user, 'BILL', id, 'PRICE_VARIATION', lines.length ? `${lines.length} component${lines.length === 1 ? '' : 's'}` : 'Cleared');
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

  /**
   * Claim a stage by hand on a bill being prepared (item 129): less than its evidence gives, or more with a note; an
   * empty % goes back to the evidence. The bill is re-priced.
   */
  async claimStage(user: RequestUser, id: string, stageId: string, dto: ClaimStageDto) {
    const row = await this.lifecycle.load(user, 'BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.$transaction(async (tx) => {
      await this.stageBilling.checkClaim(tx, id, stageId, dto);
      await this.recompute(tx, id, false);
    });
    const stage = await this.prisma.billingStage.findFirst({ where: { id: stageId }, select: { name: true, component: { select: { code: true } } } });
    const what = stage ? `${stage.component.code} ${stage.name}` : 'A stage';
    await this.audit.log(user, 'BILL', id, 'STAGE_CLAIMED', dto.pct === undefined || dto.pct === null ? `${what} back to the evidence` : `${what} claimed at ${dto.pct}%${dto.note ? `: ${dto.note}` : ''}`);
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
    return this.prisma.raBill.findUniqueOrThrow({ where: { id }, include: { items: true, stageLines: true, project: { select: TERMS_SELECT } } });
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
    const bill = await this.prisma.raBill.findUniqueOrThrow({ where: { id }, include: { items: true, stageLines: true, project: { select: TERMS_SELECT } } });
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
    const passed = new Map<string, Prisma.Decimal>();
    for (const c of dto.stages ?? []) {
      const line = bill.stageLines.find((l) => l.stageId === c.stageId);
      if (!line) throw new BadRequestException('A certified stage is not in this bill');
      const p = D(c.certifiedPct);
      if (p.lt(0)) throw new BadRequestException('A certified % cannot be negative');
      if (p.gt(line.thisPct)) throw new BadRequestException('A certified % cannot be more than this bill claimed for the stage');
      passed.set(c.stageId, p);
    }
    for (const l of bill.stageLines) if (!passed.has(l.stageId)) passed.set(l.stageId, l.thisPct);
    await this.prisma.$transaction(async (tx) => {
      const plan = bill.stageLines.length ? await this.stageBilling.planFor(tx, bill, { certified: passed }) : null;
      if (plan) for (const l of plan.lines) await tx.raBillStageLine.update({ where: { billId_stageId: { billId: id, stageId: l.stageId } }, data: { certifiedPct: l.certifiedPct, amount: l.amount } });
      const { amounts, data } = await billTotals(tx, bill, lines, bill, bill.project, plan, bill.omYear !== null ? storedOmPricing(bill) : null);
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

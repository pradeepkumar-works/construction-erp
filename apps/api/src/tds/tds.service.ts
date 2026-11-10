import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  TDS_SECTIONS,
  canFileTds,
  challanInterest,
  challanLabel,
  challanProblem,
  depositDue,
  formatINR,
  interest201,
  isTdsSection,
  lateFee234E,
  quarterOf,
  rateText,
  returnDue,
  returnProblems,
  rupeesOfPaise,
  tdsDeductionState,
  tdsPaise,
  tdsQuarterState,
  tdsRate,
  tdsSectionName,
  thresholdReached,
  tdsOn,
  totalsBySection,
  validPan,
  type TdsCertificateDto,
  type TdsChallanDetailDto,
  type TdsChallanDto,
  type TdsDeducteeDto,
  type TdsDeductionDto,
  type TdsQuarter,
  type TdsQuarterDto,
  type TdsReturnDeduction,
  type TdsReturnForm,
  type TdsStatementDto,
  type TdsSuggestDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, formatDay, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { todayIn } from '../notifications/time';
import { BooksService } from '../books/books.service';
import { assertNotExported } from '../tally/exported';
import { TdsDeductionsService } from './tds-deductions.service';
import { ConfirmSectionDto, CreateCertificateDto, FileReturnDto, RecordChallanDto, ReopenReturnDto, StatementQuery, SuggestQuery } from './tds.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const formWord = (f: TdsReturnForm) => (f === 'FORM_26Q' ? '26Q' : '24Q');

const DEDUCTION_INCLUDE = {
  challan: { select: { id: true, bsrCode: true, challanSerial: true, depositedOn: true } },
  project: { select: { name: true } },
  vendorPayment: { select: { tallyExportId: true, vendorBill: { select: { billNo: true } }, subcontractBill: { select: { billNo: true, workOrder: { select: { woNo: true } } } }, purchaseOrder: { select: { poNo: true } }, workOrder: { select: { woNo: true } }, paymentRequest: { select: { requestNo: true } } } },
  subcontractBill: { select: { id: true, billNo: true, isFinal: true, workOrder: { select: { woNo: true } } } },
  payslip: { select: { run: { select: { runNo: true } } } },
} satisfies Prisma.TdsDeductionInclude;
type DeductionRow = Prisma.TdsDeductionGetPayload<{ include: typeof DEDUCTION_INCLUDE }>;

const CHALLAN_INCLUDE = { createdBy: { select: { fullName: true } }, deductions: { select: { paidOn: true, tdsAmount: true } } } satisfies Prisma.TdsChallanInclude;
type ChallanRow = Prisma.TdsChallanGetPayload<{ include: typeof CHALLAN_INCLUDE }>;

/**
 * TDS returns (ARCHITECTURE "TDS returns"): a quarter's deductions, challans and what blocks filing, the challans
 * recorded against deductions, a return marked filed (and reopened for a correction), lower deduction certificates,
 * the rate a payment form suggests and the Form 16A statement. Admin, management and accounts (`canFileTds`). The
 * deductions themselves are written only by their sources through `TdsDeductionsService`.
 */
@Injectable()
export class TdsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private books: BooksService,
    private deductions: TdsDeductionsService,
  ) {}

  private assertCan(user: RequestUser) {
    if (!canFileTds(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts see TDS');
  }

  private quarterAt(periodFrom: string): TdsQuarter {
    const q = quarterOf(periodFrom);
    if (q.from !== periodFrom) throw new BadRequestException('Choose a quarter by its first day: 1 April, 1 July, 1 October or 1 January');
    return q;
  }

  private deductionDto(r: DeductionRow, filed: boolean, today: string): TdsDeductionDto {
    const paidOn = dateOnly(r.paidOn);
    const tds = r.tdsAmount.toString();
    const deposited = r.challan ? dateOnly(r.challan.depositedOn) : null;
    const due = depositDue(paidOn);
    const late = interest201({ deductedOn: paidOn, depositedOn: deposited ?? (today > due ? today : due), tds });
    const vp = r.vendorPayment;
    const sourceLabel = r.vendorPaymentId
      ? `Payment against ${vp?.vendorBill?.billNo ?? (vp?.subcontractBill ? `${vp.subcontractBill.workOrder.woNo} bill ${vp.subcontractBill.billNo}` : (vp?.purchaseOrder?.poNo ?? vp?.workOrder?.woNo ?? vp?.paymentRequest?.requestNo ?? ''))}`
      : r.subcontractBill
        ? `${r.subcontractBill.workOrder.woNo} bill ${r.subcontractBill.billNo}${r.subcontractBill.isFinal ? ' (final)' : ''}`
        : `Salary ${r.payslip?.run.runNo ?? ''}`;
    return {
      id: r.id,
      form: r.form,
      section: r.section,
      sectionName: tdsSectionName(r.section),
      state: tdsDeductionState(r),
      source: r.vendorPaymentId ? 'VENDOR_PAYMENT' : r.subcontractBillId ? 'SUBCONTRACT_BILL' : 'PAYSLIP',
      sourceLabel,
      sourceHref: r.vendorPaymentId ? '/payables?tab=payments' : r.subcontractBillId ? `/subcontract-bills/${r.subcontractBillId}` : '/payroll?tab=runs',
      vendorId: r.vendorId,
      employeeId: r.employeeId,
      deducteeName: r.deducteeName,
      deducteePan: r.deducteePan,
      deducteeRef: r.deducteeRef,
      projectName: r.project?.name ?? null,
      paidOn,
      amountPaid: money(r.amountPaid),
      rate: r.rate ? r.rate.toString() : null,
      tdsAmount: money(r.tdsAmount),
      reason: (r.reason as TdsDeductionDto['reason']) ?? null,
      certificateNo: r.certificateNo,
      challanId: r.challanId,
      challanLabel: r.challan ? challanLabel({ ...r.challan, depositedOn: dateOnly(r.challan.depositedOn) }) : null,
      depositDue: due,
      interest: late.interest,
      interestMonths: late.months,
      backfilled: r.backfilled,
      canConfirm: !!r.vendorPaymentId && !r.challanId && !filed && !(vp?.tallyExportId && !r.backfilled),
    };
  }

  private challanDto(c: ChallanRow, filedQuarters: Set<string>): TdsChallanDto {
    const depositedOn = dateOnly(c.depositedOn);
    const due = challanInterest(
      depositedOn,
      c.deductions.map((d) => ({ paidOn: dateOnly(d.paidOn), tdsAmount: d.tdsAmount.toString() })),
    );
    const quarters = new Set(c.deductions.map((d) => quarterOf(dateOnly(d.paidOn)).from));
    return {
      id: c.id,
      form: c.form,
      label: challanLabel({ bsrCode: c.bsrCode, challanSerial: c.challanSerial, depositedOn }),
      bsrCode: c.bsrCode,
      challanSerial: c.challanSerial,
      depositedOn,
      tax: money(c.tax),
      interest: money(c.interest),
      fee: money(c.fee),
      other: money(c.other),
      total: money(c.tax.add(c.interest).add(c.fee).add(c.other)),
      minorHead: c.minorHead,
      deductions: c.deductions.length,
      interestDue: due.interest,
      interestMonths: due.months,
      late: due.months > 0,
      createdByName: c.createdBy.fullName,
      createdAt: iso(c.createdAt),
      exportedToTally: !!c.tallyExportId,
      canDelete: !c.tallyExportId && ![...quarters].some((q) => filedQuarters.has(`${c.form}:${q}`)),
    };
  }

  /** The quarter's return: deductions, challans, deductees, totals by section, what blocks filing, the fee and interest. */
  async quarter(user: RequestUser, form: TdsReturnForm, periodFrom: string): Promise<TdsQuarterDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const q = this.quarterAt(periodFrom);
    const today = todayIn();
    const [o, ret, rows] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: org }, select: { tan: true } }),
      this.prisma.tdsReturn.findUnique({ where: { organizationId_form_periodFrom: { organizationId: org, form, periodFrom: parseDate(q.from) } } }),
      this.prisma.tdsDeduction.findMany({ where: { organizationId: org, form, paidOn: { gte: parseDate(q.from), lte: parseDate(q.to) } }, include: DEDUCTION_INCLUDE, orderBy: [{ paidOn: 'asc' }, { deducteeName: 'asc' }, { id: 'asc' }] }),
    ]);
    const filed = ret?.status === 'FILED';
    const challanIds = [...new Set(rows.flatMap((r) => (r.challanId ? [r.challanId] : [])))];
    const challans = challanIds.length ? await this.prisma.tdsChallan.findMany({ where: { id: { in: challanIds } }, include: CHALLAN_INCLUDE, orderBy: [{ depositedOn: 'asc' }, { bsrCode: 'asc' }, { challanSerial: 'asc' }] }) : [];
    const deductions = rows.map((r) => this.deductionDto(r, filed, today));
    const forReturn: TdsReturnDeduction[] = deductions.map((d) => ({ ...d }));
    const problems = returnProblems({
      tan: o.tan,
      deductions: forReturn,
      challans: challans.map((c) => ({ id: c.id, bsrCode: c.bsrCode, challanSerial: c.challanSerial, depositedOn: dateOnly(c.depositedOn), tax: c.tax.toString(), interest: c.interest.toString(), fee: c.fee.toString(), other: c.other.toString(), minorHead: c.minorHead })),
    });
    const filedQuarters = new Set(filed ? [`${form}:${q.from}`] : []);
    const sum = (xs: string[]) => rupeesOfPaise(xs.reduce((n, x) => n + (tdsPaise(x) ?? 0n), 0n));
    const tds = sum(deductions.map((d) => d.tdsAmount));
    const deposited = sum(deductions.filter((d) => d.challanId).map((d) => d.tdsAmount));
    const due = returnDue(q);
    const fee = today > due || (ret && dateOnly(ret.filedOn) > due) ? lateFee234E({ due, filedOn: ret ? dateOnly(ret.filedOn) : today, tds }) : { days: 0, fee: '0.00', capped: false };
    const deductees = new Map<string, TdsDeducteeDto>();
    for (const d of deductions) {
      const key = d.vendorId ? `V:${d.vendorId}` : d.employeeId ? `E:${d.employeeId}` : `N:${d.deducteeName}`;
      const t = deductees.get(key) ?? { key, vendorId: d.vendorId, employeeId: d.employeeId, name: d.deducteeName, pan: d.deducteePan, deductions: 0, paid: '0.00', tds: '0.00', deposited: '0.00' };
      t.deductions += 1;
      t.paid = sum([t.paid, d.amountPaid]);
      t.tds = sum([t.tds, d.tdsAmount]);
      if (d.challanId) t.deposited = sum([t.deposited, d.tdsAmount]);
      t.pan = t.pan ?? d.deducteePan;
      deductees.set(key, t);
    }
    const blocks = problems.some((p) => p.blocks);
    const may = canFileTds(user.roleKey);
    return {
      form,
      quarter: q,
      state: tdsQuarterState(q, ret?.status ?? null, today),
      tan: o.tan,
      returnDue: due,
      filedOn: ret ? dateOnly(ret.filedOn) : null,
      receiptNo: ret?.receiptNo ?? null,
      corrections: ret?.corrections ?? 0,
      reopenNote: ret?.status === 'REOPENED' ? ret.reopenNote : null,
      totals: {
        deductions: deductions.length,
        paid: sum(deductions.map((d) => d.amountPaid)),
        tds,
        deposited,
        notDeposited: rupeesOfPaise((tdsPaise(tds) ?? 0n) - (tdsPaise(deposited) ?? 0n)),
        interest: sum(deductions.map((d) => d.interest)),
        lateFee: fee.fee,
        lateDays: fee.days,
      },
      bySection: totalsBySection(deductions),
      deductions,
      challans: challans.map((c) => this.challanDto(c, filedQuarters)),
      deductees: [...deductees.values()].sort((a, b) => a.name.localeCompare(b.name)),
      problems,
      can: { record: may && !filed, file: may && !filed && !blocks && today > q.to && deductions.length > 0, reopen: may && filed, exportFile: !blocks && deductions.length > 0 },
    };
  }

  async challan(user: RequestUser, id: string): Promise<TdsChallanDetailDto> {
    this.assertCan(user);
    const c = await this.prisma.tdsChallan.findFirst({ where: { id, organizationId: user.organizationId }, include: CHALLAN_INCLUDE });
    if (!c) throw new NotFoundException('Challan not found');
    const rows = await this.prisma.tdsDeduction.findMany({ where: { challanId: id }, include: DEDUCTION_INCLUDE, orderBy: [{ paidOn: 'asc' }, { deducteeName: 'asc' }] });
    const filed = await this.filedQuarters(user.organizationId, c.form, rows.map((r) => dateOnly(r.paidOn)));
    const today = todayIn();
    return { ...this.challanDto(c, filed), items: rows.map((r) => this.deductionDto(r, filed.has(`${r.form}:${quarterOf(dateOnly(r.paidOn)).from}`), today)) };
  }

  private async filedQuarters(organizationId: string, form: TdsReturnForm, days: string[]) {
    const froms = [...new Set(days.map((d) => quarterOf(d).from))];
    const rows = froms.length ? await this.prisma.tdsReturn.findMany({ where: { organizationId, form, status: 'FILED', periodFrom: { in: froms.map(parseDate) } }, select: { periodFrom: true } }) : [];
    return new Set(rows.map((r) => `${form}:${dateOnly(r.periodFrom)}`));
  }

  /**
   * Record a challan for chosen deductions of one form and one quarter: its tax is their sum, its interest the 201(1A)
   * interest unless given. The deductions are claimed with one update that must take every one of them, so two challans
   * at once cannot both cover a deduction; the quarter's shared lock keeps it from being filed meanwhile.
   */
  async recordChallan(user: RequestUser, dto: RecordChallanDto): Promise<TdsChallanDetailDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const problem = challanProblem(dto, todayIn());
    if (problem) throw new BadRequestException(problem);
    const { lockedUpTo } = await this.books.period(org);
    if (lockedUpTo && dto.depositedOn <= lockedUpTo) throw new BadRequestException(`The books are locked up to ${formatDay(lockedUpTo)}, so a challan deposited then cannot go in. Ask management to move the lock under Accounts › Opening and year close.`);
    const ids = [...new Set(dto.deductionIds)];
    const rows = await this.prisma.tdsDeduction.findMany({ where: { id: { in: ids }, organizationId: org }, select: { id: true, form: true, section: true, paidOn: true, tdsAmount: true, challanId: true, deducteeName: true } });
    if (rows.length !== ids.length) throw new NotFoundException('A deduction was not found; reload the quarter');
    if (rows.some((r) => r.form !== dto.form)) throw new BadRequestException(`A challan covers deductions of one return: choose only ${formWord(dto.form)} deductions`);
    const unconfirmed = rows.find((r) => !isTdsSection(r.section));
    if (unconfirmed) throw new BadRequestException(`Confirm the section of ${unconfirmed.deducteeName}'s deduction first`);
    const quarters = new Set(rows.map((r) => quarterOf(dateOnly(r.paidOn)).from));
    if (quarters.size > 1) throw new BadRequestException('A challan covers deductions of one quarter: record one challan per quarter');
    const later = rows.find((r) => dateOnly(r.paidOn) > dto.depositedOn);
    if (later) throw new BadRequestException(`${later.deducteeName}'s TDS of ${formatDay(dateOnly(later.paidOn))} was deducted after this deposit`);
    const tax = rows.reduce((n, r) => n.add(r.tdsAmount), ZERO);
    const interest = dto.interest !== undefined && dto.interest !== null ? D(dto.interest) : D(challanInterest(dto.depositedOn, rows.map((r) => ({ paidOn: dateOnly(r.paidOn), tdsAmount: r.tdsAmount.toString() }))).interest);
    const fee = D(dto.fee ?? 0);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await this.deductions.holdQuarters(tx, org, rows.map((r) => ({ form: r.form, paidOn: dateOnly(r.paidOn) })), 'a challan');
        const c = await tx.tdsChallan.create({
          data: { organizationId: org, form: dto.form, bsrCode: dto.bsrCode, challanSerial: dto.challanSerial.padStart(5, '0'), depositedOn: parseDate(dto.depositedOn), tax, interest, fee, createdById: user.id },
        });
        const { count } = await tx.tdsDeduction.updateMany({ where: { id: { in: ids }, challanId: null }, data: { challanId: c.id } });
        if (count !== ids.length) throw new ConflictException('Some of these deductions went into another challan a moment ago. Reload the quarter and choose again.');
        return c.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Challan ${challanLabel(dto)} is already recorded`);
      throw e;
    }
    await this.audit.log(user, 'TDS_CHALLAN', id, 'CREATED', `${challanLabel(dto)}: TDS ${formatINR(tax.toString(), true)} for ${rows.length} ${rows.length === 1 ? 'deduction' : 'deductions'}${interest.gt(0) ? `, interest ${formatINR(interest.toString(), true)}` : ''}${fee.gt(0) ? `, fee ${formatINR(fee.toString(), true)}` : ''}`);
    return this.challan(user, id);
  }

  /** Delete a challan entered by mistake: its deductions wait for a challan again. Never in a filed quarter or once in Tally. */
  async deleteChallan(user: RequestUser, id: string) {
    this.assertCan(user);
    const c = await this.prisma.tdsChallan.findFirst({ where: { id, organizationId: user.organizationId }, include: { deductions: { select: { form: true, paidOn: true } } } });
    if (!c) throw new NotFoundException('Challan not found');
    assertNotExported(c, 'This challan');
    await this.prisma.$transaction(async (tx) => {
      await this.deductions.holdQuarters(tx, user.organizationId, c.deductions.map((d) => ({ form: d.form, paidOn: dateOnly(d.paidOn) })), 'its challans');
      const { count } = await tx.tdsChallan.deleteMany({ where: { id, tallyExportId: null } });
      if (!count) throw new ConflictException('This challan went to Tally a moment ago. Undo that Tally export first.');
    });
    await this.audit.log(user, 'TDS_CHALLAN', id, 'DELETED', challanLabel({ ...c, depositedOn: dateOnly(c.depositedOn) }));
    return { ok: true };
  }

  /**
   * Mark a quarter's return filed with the utility's provisional receipt number, or filed again after a reopening (a
   * correction). Under the quarter's exclusive lock, so no deduction or challan of the quarter changes meanwhile, and
   * only with nothing blocking.
   */
  async fileReturn(user: RequestUser, dto: FileReturnDto): Promise<TdsQuarterDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const q = this.quarterAt(dto.periodFrom);
    const today = todayIn();
    if (today <= q.to) throw new BadRequestException(`${q.label} has not ended yet; file it from ${formatDay(dateOnly(new Date(parseDate(q.to).getTime() + 86_400_000)))}`);
    if (dto.filedOn > today) throw new BadRequestException('The filing date cannot be in the future');
    if (dto.filedOn <= q.to) throw new BadRequestException(`A return for ${q.label} is filed after the quarter ends`);
    const corrected = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`TDSQ:${org}:${dto.form}:${q.from}`}))`;
      const now = await tx.tdsReturn.findUnique({ where: { organizationId_form_periodFrom: { organizationId: org, form: dto.form, periodFrom: parseDate(q.from) } } });
      if (now?.status === 'FILED') throw new ConflictException(`${formWord(dto.form)} for ${q.label} is already filed`);
      const view = await this.quarterIn(tx, org, dto.form, q);
      const blocking = view.problems.filter((p) => p.blocks);
      if (blocking.length) throw new BadRequestException(`${blocking.length === 1 ? 'One thing blocks' : `${blocking.length} things block`} filing: ${blocking[0].text}`);
      if (!view.count) throw new BadRequestException(`No ${formWord(dto.form)} deductions in ${q.label} to file`);
      if (!now) {
        await tx.tdsReturn.create({ data: { organizationId: org, form: dto.form, periodFrom: parseDate(q.from), filedOn: parseDate(dto.filedOn), receiptNo: dto.receiptNo, filedById: user.id } });
        return false;
      }
      const { count } = await tx.tdsReturn.updateMany({ where: { id: now.id, status: 'REOPENED' }, data: { status: 'FILED', filedOn: parseDate(dto.filedOn), receiptNo: dto.receiptNo, filedById: user.id, corrections: { increment: 1 }, reopenNote: null } });
      if (!count) throw new ConflictException(`${formWord(dto.form)} for ${q.label} was just filed by someone else`);
      return true;
    });
    const ret = await this.prisma.tdsReturn.findUniqueOrThrow({ where: { organizationId_form_periodFrom: { organizationId: org, form: dto.form, periodFrom: parseDate(q.from) } }, select: { id: true } });
    await this.audit.log(user, 'TDS_RETURN', ret.id, corrected ? 'CORRECTED' : 'FILED', `${formWord(dto.form)} ${q.label} ${corrected ? 'correction ' : ''}filed on ${formatDay(dto.filedOn)}, receipt ${dto.receiptNo}`);
    return this.quarter(user, dto.form, q.from);
  }

  /** What blocks filing, read inside the filing's transaction. */
  private async quarterIn(tx: Prisma.TransactionClient, org: string, form: TdsReturnForm, q: TdsQuarter) {
    const [o, rows] = await Promise.all([
      tx.organization.findUniqueOrThrow({ where: { id: org }, select: { tan: true } }),
      tx.tdsDeduction.findMany({ where: { organizationId: org, form, paidOn: { gte: parseDate(q.from), lte: parseDate(q.to) } }, select: { id: true, section: true, deducteeName: true, deducteePan: true, deducteeRef: true, paidOn: true, amountPaid: true, rate: true, tdsAmount: true, reason: true, certificateNo: true, challanId: true } }),
    ]);
    const ids = [...new Set(rows.flatMap((r) => (r.challanId ? [r.challanId] : [])))];
    const challans = ids.length ? await tx.tdsChallan.findMany({ where: { id: { in: ids } } }) : [];
    const problems = returnProblems({
      tan: o.tan,
      deductions: rows.map((r) => ({ ...r, paidOn: dateOnly(r.paidOn), amountPaid: r.amountPaid.toString(), rate: r.rate?.toString() ?? null, tdsAmount: r.tdsAmount.toString(), reason: (r.reason as 'A' | 'C' | null) ?? null })),
      challans: challans.map((c) => ({ id: c.id, bsrCode: c.bsrCode, challanSerial: c.challanSerial, depositedOn: dateOnly(c.depositedOn), tax: c.tax.toString(), interest: c.interest.toString(), fee: c.fee.toString(), other: c.other.toString(), minorHead: c.minorHead })),
    });
    return { problems, count: rows.length };
  }

  /** Open a filed quarter again for a correction statement: its deductions and challans may change until it is filed again. */
  async reopenReturn(user: RequestUser, dto: ReopenReturnDto): Promise<TdsQuarterDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const q = this.quarterAt(dto.periodFrom);
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`TDSQ:${org}:${dto.form}:${q.from}`}))`;
      const now = await tx.tdsReturn.findUnique({ where: { organizationId_form_periodFrom: { organizationId: org, form: dto.form, periodFrom: parseDate(q.from) } }, select: { id: true } });
      const { count } = now ? await tx.tdsReturn.updateMany({ where: { id: now.id, status: 'FILED' }, data: { status: 'REOPENED', reopenedById: user.id, reopenedAt: new Date(), reopenNote: dto.note } }) : { count: 0 };
      if (!count) throw new ConflictException(`${formWord(dto.form)} for ${q.label} is not filed, so there is nothing to reopen`);
      return now!.id;
    });
    await this.audit.log(user, 'TDS_RETURN', id, 'REOPENED', `${formWord(dto.form)} ${q.label}: ${dto.note}`);
    return this.quarter(user, dto.form, q.from);
  }

  /**
   * Confirm (or change) the section of a vendor payment's deduction: the rate becomes the section's for the vendor, and
   * the base may be set. Only a payment's, while in no challan and its quarter not filed, and never one whose voucher
   * is already in Tally under its section's ledger.
   */
  async confirmSection(user: RequestUser, id: string, dto: ConfirmSectionDto): Promise<TdsDeductionDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const r = await this.prisma.tdsDeduction.findFirst({ where: { id, organizationId: org }, include: DEDUCTION_INCLUDE });
    if (!r) throw new NotFoundException('Deduction not found');
    if (!r.vendorPaymentId) throw new BadRequestException(r.subcontractBillId ? 'A subcontractor bill’s TDS is always 194C' : 'Salary TDS is always 192');
    if (!isTdsSection(dto.section) || TDS_SECTIONS[dto.section].form !== 'FORM_26Q') throw new BadRequestException('Choose a TDS section for vendors and contractors');
    if (r.vendorPayment?.tallyExportId && !r.backfilled) throw new BadRequestException('This payment’s voucher is in Tally. Undo that Tally export first, then change its section');
    const base = dto.amountPaid ? D(dto.amountPaid) : r.amountPaid;
    if (base.lte(0) || base.lt(r.tdsAmount)) throw new BadRequestException('The amount TDS is worked out on must be more than the TDS');
    const paidOn = dateOnly(r.paidOn);
    const vendor = r.vendorId ? await this.prisma.vendor.findUniqueOrThrow({ where: { id: r.vendorId }, select: { pan: true } }) : { pan: r.deducteePan };
    const cert = r.vendorId && validPan(vendor.pan) ? await this.deductions.certificateFor(this.prisma, org, r.vendorId, dto.section, paidOn) : null;
    const rate = tdsRate(dto.section, { pan: vendor.pan, certificate: cert }, paidOn, base.toString());
    await this.prisma.$transaction(async (tx) => {
      await this.deductions.holdQuarters(tx, org, [{ form: r.form, paidOn }], 'this deduction');
      const { count } = await tx.tdsDeduction.updateMany({ where: { id, challanId: null }, data: { section: dto.section, amountPaid: base, rate: D(rateText(rate.rate)), reason: rate.reason, certificateNo: rate.certificateNo } });
      if (!count) throw new ConflictException('This deduction went into a challan a moment ago. Delete that challan first to change its section.');
    });
    await this.audit.log(user, 'VENDOR_PAYMENT', r.vendorPaymentId, 'UPDATED', `TDS section ${tdsSectionName(dto.section)} at ${rateText(rate.rate)}% on ${formatINR(base.toString(), true)}`);
    const row = await this.prisma.tdsDeduction.findUniqueOrThrow({ where: { id }, include: DEDUCTION_INCLUDE });
    return this.deductionDto(row, false, todayIn());
  }

  /**
   * The rate and TDS a payment form suggests for a vendor, a section, an amount and a day: the vendor's PAN and
   * certificate, and whether the year's (or month's) payments to them cross the section's threshold. The payments
   * counted are every payment to the vendor in the financial year before this one, a suggestion the form shows as such.
   */
  async suggest(user: RequestUser, q: SuggestQuery): Promise<TdsSuggestDto> {
    this.assertCan(user);
    const org = user.organizationId;
    if (!isTdsSection(q.section)) throw new BadRequestException('Choose the TDS section');
    const vendor = await this.prisma.vendor.findFirst({ where: { id: q.vendorId, organizationId: org }, select: { pan: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const fyStart = quarterOf(q.on).fy.slice(0, 4) + '-04-01';
    const before = { organizationId: org, vendorId: q.vendorId, ...(q.paymentId ? { id: { not: q.paymentId } } : {}) };
    const [year, month] = await Promise.all([
      this.prisma.vendorPayment.aggregate({ where: { ...before, paymentDate: { gte: parseDate(fyStart), lte: parseDate(q.on) } }, _sum: { amount: true, tdsAmount: true, otherDeduction: true } }),
      this.prisma.vendorPayment.aggregate({ where: { ...before, paymentDate: { gte: parseDate(`${q.on.slice(0, 7)}-01`), lte: parseDate(q.on) } }, _sum: { amount: true, tdsAmount: true, otherDeduction: true } }),
    ]);
    const settled = (a: typeof year) => (a._sum.amount ?? ZERO).add(a._sum.tdsAmount ?? ZERO).add(a._sum.otherDeduction ?? ZERO);
    const threshold = thresholdReached(q.section, { amount: q.amount, yearBefore: settled(year).toString(), monthBefore: settled(month).toString() });
    const cert = validPan(vendor.pan) ? await this.deductions.certificateFor(this.prisma, org, q.vendorId, q.section, q.on) : null;
    const r = tdsRate(q.section, { pan: vendor.pan, certificate: cert }, q.on, q.amount);
    return { section: q.section, rate: rateText(r.rate), reason: r.reason, certificateNo: r.certificateNo, why: r.why, threshold, tds: threshold.due ? tdsOn(threshold.base, r.rate) : '0.00', yearBefore: money(settled(year)) };
  }

  /** What the Form 16A (or, for an employee, the salary TDS statement) prints for one deductee in one quarter. */
  async statement(user: RequestUser, q: StatementQuery): Promise<TdsStatementDto> {
    this.assertCan(user);
    if (!q.vendorId === !q.employeeId) throw new BadRequestException('Choose the vendor or the employee');
    const view = await this.quarter(user, q.form, q.periodFrom);
    const deductions = view.deductions.filter((d) => (q.vendorId ? d.vendorId === q.vendorId : d.employeeId === q.employeeId));
    if (!deductions.length) throw new NotFoundException(`No ${formWord(q.form)} deductions for them in ${view.quarter.label}`);
    const challanIds = new Set(deductions.flatMap((d) => (d.challanId ? [d.challanId] : [])));
    const o = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { name: true, legalName: true, billingAddress: true, tan: true, pan: true } });
    const sum = (xs: string[]) => rupeesOfPaise(xs.reduce((n, x) => n + (tdsPaise(x) ?? 0n), 0n));
    return {
      form: q.form,
      quarter: view.quarter,
      deductor: { name: o.legalName ?? o.name, address: o.billingAddress, tan: o.tan, pan: o.pan },
      deductee: { name: deductions[0].deducteeName, pan: deductions.find((d) => d.deducteePan)?.deducteePan ?? null, ref: deductions[0].deducteeRef },
      receiptNo: view.state === 'FILED' ? view.receiptNo : null,
      deductions,
      challans: view.challans.filter((c) => challanIds.has(c.id)),
      total: { paid: sum(deductions.map((d) => d.amountPaid)), tds: sum(deductions.map((d) => d.tdsAmount)), deposited: sum(deductions.filter((d) => d.challanId).map((d) => d.tdsAmount)) },
    };
  }

  async certificates(user: RequestUser): Promise<TdsCertificateDto[]> {
    this.assertCan(user);
    const rows = await this.prisma.tdsCertificate.findMany({ where: { organizationId: user.organizationId }, include: { vendor: { select: { name: true } } }, orderBy: [{ validTo: 'desc' }, { certificateNo: 'asc' }] });
    const used = rows.length
      ? await this.prisma.tdsDeduction.groupBy({ by: ['certificateNo'], where: { organizationId: user.organizationId, certificateNo: { in: rows.map((r) => r.certificateNo) } }, _sum: { amountPaid: true } })
      : [];
    const usedOf = new Map(used.map((u) => [u.certificateNo, u._sum.amountPaid ?? ZERO]));
    return rows.map((r) => ({
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      section: r.section,
      sectionName: tdsSectionName(r.section),
      certificateNo: r.certificateNo,
      rate: r.rate.toString(),
      validFrom: dateOnly(r.validFrom),
      validTo: dateOnly(r.validTo),
      limit: money(r.limitAmount),
      used: money(usedOf.get(r.certificateNo) ?? ZERO),
    }));
  }

  async addCertificate(user: RequestUser, dto: CreateCertificateDto): Promise<TdsCertificateDto[]> {
    this.assertCan(user);
    if (!isTdsSection(dto.section) || TDS_SECTIONS[dto.section].form !== 'FORM_26Q') throw new BadRequestException('Choose a TDS section for vendors and contractors');
    if (dto.validTo < dto.validFrom) throw new BadRequestException('The certificate ends after it starts');
    const vendor = await this.prisma.vendor.findFirst({ where: { id: dto.vendorId, organizationId: user.organizationId }, select: { name: true, pan: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!validPan(vendor.pan)) throw new BadRequestException(`${vendor.name} has no PAN in the vendor master; a certificate is issued against one. Add it first`);
    try {
      const c = await this.prisma.tdsCertificate.create({
        data: { organizationId: user.organizationId, vendorId: dto.vendorId, section: dto.section, certificateNo: dto.certificateNo, rate: D(dto.rate), validFrom: parseDate(dto.validFrom), validTo: parseDate(dto.validTo), limitAmount: D(dto.limit), createdById: user.id },
      });
      await this.audit.log(user, 'VENDOR', dto.vendorId, 'UPDATED', `Lower deduction certificate ${c.certificateNo}: ${tdsSectionName(c.section)} at ${dto.rate}% up to ${formatINR(dto.limit, true)}, ${formatDay(dto.validFrom)} to ${formatDay(dto.validTo)}`);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Certificate ${dto.certificateNo} is already recorded`);
      throw e;
    }
    return this.certificates(user);
  }

  async removeCertificate(user: RequestUser, id: string) {
    this.assertCan(user);
    const c = await this.prisma.tdsCertificate.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!c) throw new NotFoundException('Certificate not found');
    const used = await this.prisma.tdsDeduction.count({ where: { organizationId: user.organizationId, certificateNo: c.certificateNo } });
    if (used) throw new BadRequestException(`Certificate ${c.certificateNo} is already used on ${used} ${used === 1 ? 'deduction' : 'deductions'}, which the return quotes; it stays`);
    await this.prisma.tdsCertificate.delete({ where: { id } });
    await this.audit.log(user, 'VENDOR', c.vendorId, 'UPDATED', `Lower deduction certificate ${c.certificateNo} removed`);
    return { ok: true };
  }
}

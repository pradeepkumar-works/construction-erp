import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canRecordPayment,
  canViewPayables,
  subBillLabel,
  type MsmeCategory,
  type Paginated,
  type PayableBillDto,
  type PayableBillType,
  type PayablesDto,
  type PayableTotalsDto,
  type ProjectPayableDto,
  type SortOrder,
  type VendorPayableDto,
  type VendorPaymentDto,
  type VendorPaymentSortField,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreatePaymentDto, ListPaymentsQuery, PayablesQuery, UpdatePaymentDto } from './payables.dto';
import { assertNotExported } from '../tally/exported';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const DAY = 24 * 3600 * 1000;
/** A payment may settle a bill to within a rupee of rounding. */
const TOLERANCE = D(1);
/** Micro and small enterprises are flagged this many days before their bill falls due. */
const MSME_WARN_DAYS = 7;

export const PAYMENT_SUMS = { amount: true, tdsAmount: true, otherDeduction: true, paymentDate: true } as const;
type Sums = { amount: Prisma.Decimal; tdsAmount: Prisma.Decimal; otherDeduction: Prisma.Decimal };
const settles = (p: Sums) => p.amount.add(p.tdsAmount).add(p.otherDeduction);
const settledOf = (rows: Sums[]) => rows.reduce((s, p) => s.add(settles(p)), ZERO);
const isSmall = (m: MsmeCategory | null | undefined) => m === 'MICRO' || m === 'SMALL';

const include = {
  project: { select: { code: true, name: true } },
  vendor: { select: { name: true } },
  vendorBill: { select: { billNo: true } },
  subcontractBill: { select: { billNo: true, isFinal: true, workOrder: { select: { woNo: true } } } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.VendorPaymentInclude;
type Row = Prisma.VendorPaymentGetPayload<{ include: typeof include }>;

const ORDER: Record<VendorPaymentSortField, (o: SortOrder) => Prisma.VendorPaymentOrderByWithRelationInput[]> = {
  paymentDate: (o) => [{ paymentDate: o }, { createdAt: o }],
  amount: (o) => [{ amount: o }],
  vendor: (o) => [{ vendor: { name: o } }, { paymentDate: 'desc' }],
  project: (o) => [{ project: { name: o } }, { paymentDate: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};

/** The bill a payment is against, as payables sees it. */
interface Bill {
  type: PayableBillType;
  id: string;
  label: string;
  projectId: string;
  vendorId: string;
  status: string;
  billDate: Date;
  payable: Prisma.Decimal;
}

/**
 * Keep a bill's `paidAmount` and `paidDate` in step with its payments: paid in full (to the rupee) on the date of the
 * last payment, otherwise unpaid.
 */
export async function syncPaid(tx: Prisma.TransactionClient, type: PayableBillType, billId: string) {
  const where = type === 'VENDOR_BILL' ? { vendorBillId: billId } : { subcontractBillId: billId };
  const payments = await tx.vendorPayment.findMany({ where, select: PAYMENT_SUMS, orderBy: { paymentDate: 'desc' } });
  const paid = settledOf(payments);
  if (type === 'VENDOR_BILL') {
    const bill = await tx.vendorBill.findUniqueOrThrow({ where: { id: billId }, select: { total: true } });
    await tx.vendorBill.update({ where: { id: billId }, data: { paidAmount: paid, paidDate: payments.length && paid.add(TOLERANCE).gte(bill.total) ? payments[0].paymentDate : null } });
  } else {
    const bill = await tx.subcontractBill.findUniqueOrThrow({ where: { id: billId }, select: { netPayable: true } });
    await tx.subcontractBill.update({ where: { id: billId }, data: { paidAmount: paid, paidDate: payments.length && paid.add(TOLERANCE).gte(bill.netPayable) ? payments[0].paymentDate : null } });
  }
}

interface Totals {
  billed: Prisma.Decimal;
  paid: Prisma.Decimal;
  deducted: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  overdue: Prisma.Decimal;
  dueSoon: Prisma.Decimal;
  ageing: [Prisma.Decimal, Prisma.Decimal, Prisma.Decimal, Prisma.Decimal, Prisma.Decimal];
  msmeAtRisk: Prisma.Decimal;
  retentionHeld: Prisma.Decimal;
  tdsDeducted: Prisma.Decimal;
  openBills: number;
}
const emptyTotals = (): Totals => ({
  billed: ZERO,
  paid: ZERO,
  deducted: ZERO,
  outstanding: ZERO,
  overdue: ZERO,
  dueSoon: ZERO,
  ageing: [ZERO, ZERO, ZERO, ZERO, ZERO],
  msmeAtRisk: ZERO,
  retentionHeld: ZERO,
  tdsDeducted: ZERO,
  openBills: 0,
});
const totalsDto = (t: Totals): PayableTotalsDto => ({
  billed: money(t.billed)!,
  paid: money(t.paid)!,
  deducted: money(t.deducted)!,
  outstanding: money(t.outstanding)!,
  overdue: money(t.overdue)!,
  dueSoon: money(t.dueSoon)!,
  ageing: { notDue: money(t.ageing[0])!, days1to30: money(t.ageing[1])!, days31to60: money(t.ageing[2])!, days61to90: money(t.ageing[3])!, over90: money(t.ageing[4])! },
  msmeAtRisk: money(t.msmeAtRisk)!,
  retentionHeld: money(t.retentionHeld)!,
  tdsDeducted: money(t.tdsDeducted)!,
});

/**
 * Payables (v3 item 23): money paid to vendors and subcontractors against their approved bills, with TDS or anything
 * else deducted at payment. A bill is paid once its payments settle what it says is payable (a vendor bill's total, a
 * subcontractor bill's net payable). The summary is the due list: outstanding by vendor and project, aged from each
 * bill's due date, with micro and small enterprises flagged as their 45 days run out.
 */
@Injectable()
export class PayablesService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService) {}

  toDto(r: Row): VendorPaymentDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      billType: r.vendorBillId ? 'VENDOR_BILL' : 'SUBCONTRACT_BILL',
      vendorBillId: r.vendorBillId,
      subcontractBillId: r.subcontractBillId,
      billLabel: r.vendorBill ? r.vendorBill.billNo : r.subcontractBill ? subBillLabel(r.subcontractBill.workOrder.woNo, r.subcontractBill.billNo, r.subcontractBill.isFinal) : '',
      paymentDate: dateOnly(r.paymentDate)!,
      amount: money(r.amount)!,
      mode: r.mode,
      reference: r.reference,
      tdsAmount: money(r.tdsAmount)!,
      otherDeduction: money(r.otherDeduction)!,
      otherDeductionNote: r.otherDeductionNote,
      settledAmount: money(settles(r))!,
      remarks: r.remarks,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt)!,
      exportedToTally: !!r.tallyExportId,
    };
  }

  private assertCanSee(user: RequestUser) {
    if (!canViewPayables(user.roleKey)) throw new ForbiddenException('Your role cannot see payables');
  }

  private assertCanRecord(user: RequestUser) {
    if (!canRecordPayment(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts record payments');
  }

  async list(user: RequestUser, q: ListPaymentsQuery): Promise<Paginated<VendorPaymentDto>> {
    this.assertCanSee(user);
    const where: Prisma.VendorPaymentWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.vendorBillId) where.vendorBillId = q.vendorBillId;
    if (q.subcontractBillId) where.subcontractBillId = q.subcontractBillId;
    if (q.from || q.to) where.paymentDate = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { reference: ilike(w) },
          { remarks: ilike(w) },
          { vendor: { name: ilike(w) } },
          { project: { name: ilike(w) } },
          { project: { code: ilike(w) } },
          { vendorBill: { billNo: ilike(w) } },
          { subcontractBill: { workOrder: { woNo: ilike(w) } } },
        ],
      }));
    const sortBy = q.sortBy ?? 'paymentDate';
    const order = q.sortOrder ?? (sortBy === 'project' || sortBy === 'vendor' ? 'asc' : 'desc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.vendorPayment.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.vendorPayment.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<VendorPaymentDto> {
    this.assertCanSee(user);
    const row = await this.prisma.vendorPayment.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Payment not found');
    return this.toDto(row);
  }

  private async bill(user: RequestUser, dto: { vendorBillId?: string; subcontractBillId?: string }): Promise<Bill> {
    if (!!dto.vendorBillId === !!dto.subcontractBillId) throw new BadRequestException('Choose the one bill this payment is for');
    const org = user.organizationId;
    let bill: Bill | null = null;
    if (dto.vendorBillId) {
      const b = await this.prisma.vendorBill.findFirst({ where: { id: dto.vendorBillId, organizationId: org } });
      if (b) bill = { type: 'VENDOR_BILL', id: b.id, label: b.billNo, projectId: b.projectId, vendorId: b.vendorId, status: b.status, billDate: b.invoiceDate, payable: b.total };
    } else {
      const b = await this.prisma.subcontractBill.findFirst({ where: { id: dto.subcontractBillId, organizationId: org }, include: { workOrder: { select: { woNo: true, vendorId: true } } } });
      if (b) bill = { type: 'SUBCONTRACT_BILL', id: b.id, label: subBillLabel(b.workOrder.woNo, b.billNo, b.isFinal), projectId: b.projectId, vendorId: b.workOrder.vendorId, status: b.status, billDate: b.billDate, payable: b.netPayable };
    }
    if (!bill) throw new NotFoundException('Bill not found');
    await this.access.assertCanAccessProject(user, bill.projectId);
    return bill;
  }

  private async billOf(row: { vendorBillId: string | null; subcontractBillId: string | null }, user: RequestUser) {
    return this.bill(user, { vendorBillId: row.vendorBillId ?? undefined, subcontractBillId: row.subcontractBillId ?? undefined });
  }

  /** Amounts of a payment as decimals, with the checks every payment passes. */
  private amounts(bill: Bill, dto: Partial<Record<'amount' | 'tdsAmount' | 'otherDeduction', string>>, current?: Sums) {
    const out = {} as Sums;
    for (const k of ['amount', 'tdsAmount', 'otherDeduction'] as const) {
      const v = dto[k] !== undefined ? D(dto[k]!) : (current?.[k] ?? ZERO);
      if (v.lt(0)) throw new BadRequestException('Amounts cannot be negative');
      if (v.decimalPlaces() > 2) throw new BadRequestException('Amounts are in rupees and paise');
      out[k] = v;
    }
    if (bill.type === 'SUBCONTRACT_BILL' && !out.tdsAmount.isZero()) throw new BadRequestException("A subcontractor bill already deducts its TDS; it is not deducted again at payment");
    if (settles(out).lte(0)) throw new BadRequestException('Enter the amount paid');
    return out;
  }

  private checkDate(date: string, bill: Bill) {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The payment date cannot be in the future');
    if (parseDate(date) < bill.billDate) throw new BadRequestException(`The payment date cannot be before the bill (${dateOnly(bill.billDate)})`);
  }

  /** A payment must not settle more than the bill has outstanding (other payments excluded). */
  private async checkBalance(tx: Prisma.TransactionClient, bill: Bill, excludeId: string | null, adds: Prisma.Decimal) {
    const others = await tx.vendorPayment.findMany({
      where: { ...(bill.type === 'VENDOR_BILL' ? { vendorBillId: bill.id } : { subcontractBillId: bill.id }), ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: PAYMENT_SUMS,
    });
    const outstanding = bill.payable.sub(settledOf(others));
    if (adds.gt(outstanding.add(TOLERANCE))) {
      throw new BadRequestException(`This settles ₹${adds.toFixed(2)} (paid plus deducted) but only ₹${Prisma.Decimal.max(outstanding, ZERO).toFixed(2)} is outstanding on ${bill.label}`);
    }
  }

  private lock(tx: Prisma.TransactionClient, bill: Bill) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PAY:${bill.id}`}))`;
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.vendorPayment.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreatePaymentDto): Promise<VendorPaymentDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    this.assertCanRecord(user);
    const bill = await this.bill(user, dto);
    if (bill.status !== 'APPROVED') throw new BadRequestException(`${bill.label} is not approved yet; only approved bills are paid`);
    this.checkDate(dto.paymentDate, bill);
    const a = this.amounts(bill, dto);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, bill);
        await this.checkBalance(tx, bill, null, settles(a));
        const row = await tx.vendorPayment.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: bill.projectId,
            vendorId: bill.vendorId,
            vendorBillId: bill.type === 'VENDOR_BILL' ? bill.id : null,
            subcontractBillId: bill.type === 'SUBCONTRACT_BILL' ? bill.id : null,
            paymentDate: parseDate(dto.paymentDate),
            mode: dto.mode ?? 'BANK',
            reference: dto.reference ?? null,
            otherDeductionNote: dto.otherDeductionNote ?? null,
            remarks: dto.remarks ?? null,
            createdById: user.id,
            ...a,
          },
          select: { id: true },
        });
        await syncPaid(tx, bill.type, bill.id);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.audit.log(user, 'VENDOR_PAYMENT', id, 'CREATED', `₹${a.amount.toFixed(2)} paid against ${bill.label}`);
    await this.audit.log(user, bill.type, bill.id, 'PAYMENT_MADE', `₹${a.amount.toFixed(2)} paid on ${dto.paymentDate}${dto.reference ? ` (${dto.reference})` : ''}`);
    return this.get(user, id);
  }

  private async load(user: RequestUser, id: string) {
    this.assertCanRecord(user);
    const row = await this.prisma.vendorPayment.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Payment not found');
    return { row, bill: await this.billOf(row, user) };
  }

  async update(user: RequestUser, id: string, dto: UpdatePaymentDto): Promise<VendorPaymentDto> {
    const { row, bill } = await this.load(user, id);
    assertNotExported(row, 'This payment');
    if (dto.paymentDate !== undefined) this.checkDate(dto.paymentDate, bill);
    const a = this.amounts(bill, dto, row);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, bill);
      await this.checkBalance(tx, bill, id, settles(a));
      await tx.vendorPayment.update({
        where: { id },
        data: {
          ...a,
          ...(dto.paymentDate !== undefined ? { paymentDate: parseDate(dto.paymentDate) } : {}),
          ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
          ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
          ...(dto.otherDeductionNote !== undefined ? { otherDeductionNote: dto.otherDeductionNote } : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
        },
      });
      await syncPaid(tx, bill.type, bill.id);
    });
    await this.audit.log(user, 'VENDOR_PAYMENT', id, 'UPDATED');
    return this.get(user, id);
  }

  /** Take off a payment entered by mistake; its bill goes back to unpaid if it no longer settles. */
  async remove(user: RequestUser, id: string) {
    const { row, bill } = await this.load(user, id);
    assertNotExported(row, 'This payment');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, bill);
      await tx.vendorPayment.delete({ where: { id } });
      await syncPaid(tx, bill.type, bill.id);
    });
    await this.audit.log(user, 'VENDOR_PAYMENT', id, 'DELETED', `₹${row.amount.toFixed(2)} of ${dateOnly(row.paymentDate)}`);
    await this.audit.log(user, bill.type, bill.id, 'PAYMENT_REMOVED', `₹${row.amount.toFixed(2)} of ${dateOnly(row.paymentDate)} taken off`);
    return { ok: true };
  }

  /** Payables as of today, for the projects the user can see. */
  async summary(user: RequestUser, q: PayablesQuery = {}): Promise<PayablesDto> {
    this.assertCanSee(user);
    const asOf = new Date().toISOString().slice(0, 10);
    const today = parseDate(asOf).getTime();
    const projectWhere = { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}) };
    const vendorSel = { select: { id: true, name: true, msmeCategory: true } } as const;
    const projectSel = { select: { id: true, code: true, name: true } } as const;
    const [vbills, sbills, payments] = await Promise.all([
      this.prisma.vendorBill.findMany({
        where: { project: projectWhere, status: 'APPROVED', ...(q.vendorId ? { vendorId: q.vendorId } : {}) },
        select: { id: true, billNo: true, invoiceDate: true, dueDate: true, total: true, paidAmount: true, vendor: vendorSel, project: projectSel },
      }),
      this.prisma.subcontractBill.findMany({
        where: { project: projectWhere, status: 'APPROVED', ...(q.vendorId ? { workOrder: { vendorId: q.vendorId } } : {}) },
        select: {
          id: true,
          billNo: true,
          isFinal: true,
          billDate: true,
          dueDate: true,
          netPayable: true,
          paidAmount: true,
          retentionAmount: true,
          tdsAmount: true,
          workOrder: { select: { woNo: true, vendor: vendorSel } },
          project: projectSel,
        },
      }),
      this.prisma.vendorPayment.findMany({
        where: { project: projectWhere, ...(q.vendorId ? { vendorId: q.vendorId } : {}) },
        select: { projectId: true, vendorId: true, amount: true, tdsAmount: true, otherDeduction: true },
      }),
    ]);

    type V = { id: string; name: string; msmeCategory: MsmeCategory | null };
    type P = { id: string; code: string; name: string };
    const byVendor = new Map<string, { v: V; t: Totals }>();
    const byProject = new Map<string, { p: P; t: Totals }>();
    const all = emptyTotals();
    const tallies = (v: V, p: P) => {
      if (!byVendor.has(v.id)) byVendor.set(v.id, { v, t: emptyTotals() });
      if (!byProject.has(p.id)) byProject.set(p.id, { p, t: emptyTotals() });
      return [all, byVendor.get(v.id)!.t, byProject.get(p.id)!.t];
    };
    const openBills: PayableBillDto[] = [];
    const take = (type: PayableBillType, id: string, label: string, v: V, p: P, billDate: Date, dueDate: Date, payable: Prisma.Decimal, paid: Prisma.Decimal) => {
      const outstanding = Prisma.Decimal.max(payable.sub(paid), ZERO);
      const open = outstanding.gt(TOLERANCE);
      const daysToDue = Math.round((dueDate.getTime() - today) / DAY);
      const msmeFlag = open && isSmall(v.msmeCategory) && daysToDue <= MSME_WARN_DAYS;
      for (const t of tallies(v, p)) {
        t.billed = t.billed.add(payable);
        if (!open) continue;
        t.outstanding = t.outstanding.add(outstanding);
        t.openBills += 1;
        if (daysToDue < 0) t.overdue = t.overdue.add(outstanding);
        else if (daysToDue <= 7) t.dueSoon = t.dueSoon.add(outstanding);
        const late = -daysToDue;
        const bucket = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
        t.ageing[bucket] = t.ageing[bucket].add(outstanding);
        if (msmeFlag) t.msmeAtRisk = t.msmeAtRisk.add(outstanding);
      }
      if (open)
        openBills.push({
          billType: type,
          billId: id,
          billLabel: label,
          vendorId: v.id,
          vendorName: v.name,
          vendorMsme: v.msmeCategory,
          projectId: p.id,
          projectCode: p.code,
          projectName: p.name,
          billDate: dateOnly(billDate)!,
          dueDate: dateOnly(dueDate)!,
          payable: money(payable)!,
          paid: money(paid)!,
          outstanding: money(outstanding)!,
          daysToDue,
          msmeFlag,
        });
    };
    for (const b of vbills) take('VENDOR_BILL', b.id, b.billNo, b.vendor, b.project, b.invoiceDate, b.dueDate, b.total, b.paidAmount);
    for (const b of sbills) {
      take('SUBCONTRACT_BILL', b.id, subBillLabel(b.workOrder.woNo, b.billNo, b.isFinal), b.workOrder.vendor, b.project, b.billDate, b.dueDate, b.netPayable, b.paidAmount);
      for (const t of tallies(b.workOrder.vendor, b.project)) {
        t.retentionHeld = t.retentionHeld.add(b.retentionAmount);
        t.tdsDeducted = t.tdsDeducted.add(b.tdsAmount);
      }
    }
    for (const r of payments) {
      for (const t of [all, byVendor.get(r.vendorId)?.t, byProject.get(r.projectId)?.t]) {
        if (!t) continue;
        t.paid = t.paid.add(r.amount);
        t.deducted = t.deducted.add(r.tdsAmount).add(r.otherDeduction);
        t.tdsDeducted = t.tdsDeducted.add(r.tdsAmount);
      }
    }

    const vendors: VendorPayableDto[] = [...byVendor.values()]
      .map(({ v, t }) => ({ vendorId: v.id, vendorName: v.name, vendorMsme: v.msmeCategory, openBills: t.openBills, ...totalsDto(t) }))
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding) || a.vendorName.localeCompare(b.vendorName));
    const projects: ProjectPayableDto[] = [...byProject.values()]
      .map(({ p, t }) => ({ projectId: p.id, projectCode: p.code, projectName: p.name, ...totalsDto(t) }))
      .sort((a, b) => a.projectCode.localeCompare(b.projectCode));
    openBills.sort((a, b) => a.daysToDue - b.daysToDue || Number(b.outstanding) - Number(a.outstanding));
    return { asOf, totals: totalsDto(all), vendors, projects, openBills };
  }
}

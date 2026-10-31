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
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreatePaymentDto, ListPaymentsQuery, PayablesQuery, UpdatePaymentDto } from './payables.dto';
import { assertNotExported } from '../tally/exported';
import { advanceAdjusted, advancePaid, advanceRecovered } from './advances';
import { SUB_BILL_PAYABLE, VENDOR_BILL_PAYABLE, subBillPayable, vendorBillPayable } from './payable';
import { syncRequestPaid, targetLabel } from './payment-requests.service';

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
  purchaseOrder: { select: { poNo: true } },
  workOrder: { select: { woNo: true } },
  paymentRequest: { select: { requestNo: true } },
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

/**
 * The bill a payment is against, as payables sees it; or, for an advance, the order; or, for a site's
 * fund request paid to a party, the request itself: a payment on account.
 */
interface Bill {
  type: PayableBillType | 'ADVANCE' | 'ON_ACCOUNT';
  id: string;
  label: string;
  projectId: string;
  vendorId: string;
  status: string;
  billDate: Date;
  /** What the bill says is payable; null for an advance or a payment on account (its request caps it) */
  payable: Prisma.Decimal | null;
  /** An advance's order */
  order?: { purchaseOrderId: string } | { workOrderId: string };
}

type Request = { id: string; requestNo: string; amount: Prisma.Decimal };

/** A bill proper, whose paid amount follows its payments. */
const isBill = (b: Bill): b is Bill & { type: PayableBillType } => b.type === 'VENDOR_BILL' || b.type === 'SUBCONTRACT_BILL';

/**
 * Keep a bill's `paidAmount` and `paidDate` in step with its payments: paid in full (to the rupee) on the date of the
 * last payment, otherwise unpaid.
 */
export async function syncPaid(tx: Prisma.TransactionClient, type: PayableBillType, billId: string) {
  const where = type === 'VENDOR_BILL' ? { vendorBillId: billId } : { subcontractBillId: billId };
  const payments = await tx.vendorPayment.findMany({ where, select: PAYMENT_SUMS, orderBy: { paymentDate: 'desc' } });
  const paid = settledOf(payments);
  if (type === 'VENDOR_BILL') {
    const bill = await tx.vendorBill.findUniqueOrThrow({ where: { id: billId }, select: VENDOR_BILL_PAYABLE });
    const payable = vendorBillPayable(bill);
    await tx.vendorBill.update({ where: { id: billId }, data: { paidAmount: paid, paidDate: payments.length && paid.add(TOLERANCE).gte(payable) ? payments[0].paymentDate : null } });
  } else {
    const bill = await tx.subcontractBill.findUniqueOrThrow({ where: { id: billId }, select: SUB_BILL_PAYABLE });
    await tx.subcontractBill.update({ where: { id: billId }, data: { paidAmount: paid, paidDate: payments.length && paid.add(TOLERANCE).gte(subBillPayable(bill)) ? payments[0].paymentDate : null } });
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
  advanceOutstanding: Prisma.Decimal;
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
  advanceOutstanding: ZERO,
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
  advanceOutstanding: money(t.advanceOutstanding)!,
});

/**
 * Payables: money paid to vendors and subcontractors against their approved bills, with TDS or anything
 * else deducted at payment. A bill is paid once its payments settle what it says is payable (a vendor bill's total, a
 * subcontractor bill's net payable). The summary is the due list: outstanding by vendor and project, aged from each
 * bill's due date, with micro and small enterprises flagged as their 45 days run out.
 */
@Injectable()
export class PayablesService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  toDto(r: Row): VendorPaymentDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      billType: r.vendorBillId ? 'VENDOR_BILL' : r.subcontractBillId ? 'SUBCONTRACT_BILL' : null,
      vendorBillId: r.vendorBillId,
      subcontractBillId: r.subcontractBillId,
      purchaseOrderId: r.purchaseOrderId,
      workOrderId: r.workOrderId,
      billLabel: r.vendorBill || r.subcontractBill ? targetLabel(r) : r.purchaseOrder || r.workOrder ? `Advance on ${targetLabel(r)}` : `On account (${r.paymentRequest?.requestNo ?? ''})`,
      paymentRequestId: r.paymentRequestId,
      requestNo: r.paymentRequest?.requestNo ?? null,
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
    if (q.paymentRequestId) where.paymentRequestId = q.paymentRequestId;
    if (q.purchaseOrderId) Object.assign(where, { purchaseOrderId: q.purchaseOrderId, vendorBillId: null });
    if (q.workOrderId) Object.assign(where, { workOrderId: q.workOrderId, subcontractBillId: null });
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
          { purchaseOrder: { poNo: ilike(w) } },
          { workOrder: { woNo: ilike(w) } },
          { paymentRequest: { requestNo: ilike(w) } },
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
      if (b) bill = { type: 'VENDOR_BILL', id: b.id, label: b.billNo, projectId: b.projectId, vendorId: b.vendorId, status: b.status, billDate: b.invoiceDate, payable: vendorBillPayable(b) };
    } else {
      const b = await this.prisma.subcontractBill.findFirst({ where: { id: dto.subcontractBillId, organizationId: org }, include: { workOrder: { select: { woNo: true, vendorId: true } } } });
      if (b) bill = { type: 'SUBCONTRACT_BILL', id: b.id, label: subBillLabel(b.workOrder.woNo, b.billNo, b.isFinal), projectId: b.projectId, vendorId: b.workOrder.vendorId, status: b.status, billDate: b.billDate, payable: subBillPayable(b) };
    }
    if (!bill) throw new NotFoundException('Bill not found');
    await this.access.assertCanAccessProject(user, bill.projectId);
    return bill;
  }

  /** The order an advance is paid against. */
  private async advance(user: RequestUser, order: { purchaseOrderId: string | null; workOrderId: string | null }): Promise<Bill> {
    const org = user.organizationId;
    let bill: Bill | null = null;
    if (order.purchaseOrderId) {
      const o = await this.prisma.purchaseOrder.findFirst({ where: { id: order.purchaseOrderId, organizationId: org } });
      if (o) bill = { type: 'ADVANCE', id: o.id, label: `Advance on ${o.poNo}`, projectId: o.projectId, vendorId: o.vendorId, status: o.status, billDate: o.poDate, payable: null, order: { purchaseOrderId: o.id } };
    } else if (order.workOrderId) {
      const o = await this.prisma.workOrder.findFirst({ where: { id: order.workOrderId, organizationId: org } });
      if (o) bill = { type: 'ADVANCE', id: o.id, label: `Advance on ${o.woNo}`, projectId: o.projectId, vendorId: o.vendorId, status: o.status, billDate: o.woDate, payable: null, order: { workOrderId: o.id } };
    }
    if (!bill) throw new NotFoundException('Order not found');
    await this.access.assertCanAccessProject(user, bill.projectId);
    return bill;
  }

  /** A fund request paid to a party: the payment is on account, capped by the request. */
  private async onAccount(user: RequestUser, r: { id: string; requestNo: string; projectId: string; vendorId: string | null; createdAt: Date }): Promise<Bill> {
    if (!r.vendorId) throw new BadRequestException(`${r.requestNo} goes into the site's imprest: release it from the request instead`);
    await this.access.assertCanAccessProject(user, r.projectId);
    return { type: 'ON_ACCOUNT', id: r.id, label: `On account (${r.requestNo})`, projectId: r.projectId, vendorId: r.vendorId, status: 'APPROVED', billDate: new Date(r.createdAt.toISOString().slice(0, 10)), payable: null };
  }

  private async billOf(row: { vendorBillId: string | null; subcontractBillId: string | null; purchaseOrderId: string | null; workOrderId: string | null; paymentRequestId: string | null }, user: RequestUser) {
    if (!row.vendorBillId && !row.subcontractBillId && !row.purchaseOrderId && !row.workOrderId && row.paymentRequestId)
      return this.onAccount(user, await this.prisma.paymentRequest.findUniqueOrThrow({ where: { id: row.paymentRequestId } }));
    if (!row.vendorBillId && !row.subcontractBillId) return this.advance(user, row);
    return this.bill(user, { vendorBillId: row.vendorBillId ?? undefined, subcontractBillId: row.subcontractBillId ?? undefined });
  }

  /** An approved payment request to draw on, and the bill or order it is for. */
  private async request(user: RequestUser, dto: CreatePaymentDto): Promise<{ request: Request; bill: Bill }> {
    const r = await this.prisma.paymentRequest.findFirst({ where: { id: dto.paymentRequestId, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Payment request not found');
    if (r.status !== 'APPROVED') throw new BadRequestException(`${r.requestNo} is not approved yet; payments draw only on approved requests`);
    if ((dto.vendorBillId && dto.vendorBillId !== r.vendorBillId) || (dto.subcontractBillId && dto.subcontractBillId !== r.subcontractBillId)) throw new BadRequestException(`${r.requestNo} is for another bill`);
    const bill = r.kind === 'FUND_REQUEST' ? await this.onAccount(user, r) : await this.billOf({ ...r, paymentRequestId: null }, user);
    return { request: { id: r.id, requestNo: r.requestNo, amount: r.amount }, bill };
  }

  /** A payment drawing on a request must not settle more than the request has left (other payments excluded). */
  private async checkRequest(tx: Prisma.TransactionClient, request: Request, excludeId: string | null, adds: Prisma.Decimal) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PAYREQ:${request.id}`}))`;
    const others = await tx.vendorPayment.findMany({ where: { paymentRequestId: request.id, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: PAYMENT_SUMS });
    const left = request.amount.sub(settledOf(others));
    if (adds.gt(left.add(TOLERANCE))) throw new BadRequestException(`This settles ₹${adds.toFixed(2)} but only ₹${Prisma.Decimal.max(left, ZERO).toFixed(2)} of ${request.requestNo} is left to pay`);
  }

  /**
   * Taking an advance payment down (editing or deleting it) must leave enough paid to cover what bills have already
   * taken off: the advance adjusted on the PO's vendor bills, or recovered on the work order's bills.
   */
  private async checkAdvanceCovers(tx: Prisma.TransactionClient, bill: Bill, paymentId: string, remains: Prisma.Decimal | null) {
    if (!bill.order) return;
    const others = await advancePaid(tx, bill.order, paymentId);
    const paid = others.paid.add(remains ?? ZERO);
    if ('purchaseOrderId' in bill.order) {
      const adjusted = await advanceAdjusted(tx, bill.order.purchaseOrderId);
      if (adjusted.gt(paid.add(TOLERANCE))) throw new BadRequestException(`₹${adjusted.toFixed(2)} of the advance is already taken off bills against this PO; that much must stay paid`);
      return;
    }
    const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: bill.order.workOrderId }, select: { advanceAmount: true } });
    const base = others.count + (remains === null ? 0 : 1) > 0 ? paid : wo.advanceAmount;
    const recovered = await advanceRecovered(tx, bill.order.workOrderId);
    if (recovered.gt(base.add(TOLERANCE))) throw new BadRequestException(`₹${recovered.toFixed(2)} of the advance is already recovered on their bills; that much must stay paid`);
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
    if (parseDate(date) < bill.billDate) throw new BadRequestException(`The payment date cannot be before the ${bill.type === 'ADVANCE' ? 'order' : bill.type === 'ON_ACCOUNT' ? 'request' : 'bill'} (${dateOnly(bill.billDate)})`);
  }

  /** A payment must not settle more than the bill has outstanding (other payments excluded). */
  private async checkBalance(tx: Prisma.TransactionClient, bill: Bill, excludeId: string | null, adds: Prisma.Decimal) {
    if (bill.payable === null) return;
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
    let request: Request | null = null;
    let bill: Bill;
    if (dto.paymentRequestId) ({ request, bill } = await this.request(user, dto));
    else {
      bill = await this.bill(user, dto);
      const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { paymentsNeedRequest: true } });
      if (org.paymentsNeedRequest) throw new BadRequestException(`Payments here need an approved payment request: ask for one on ${bill.label} (Request payment), then pay against it`);
    }
    if (isBill(bill) && bill.status !== 'APPROVED') throw new BadRequestException(`${bill.label} is not approved yet; only approved bills are paid`);
    this.checkDate(dto.paymentDate, bill);
    const a = this.amounts(bill, dto);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, bill);
        await this.checkBalance(tx, bill, null, settles(a));
        if (request) await this.checkRequest(tx, request, null, settles(a));
        const row = await tx.vendorPayment.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: bill.projectId,
            vendorId: bill.vendorId,
            vendorBillId: bill.type === 'VENDOR_BILL' ? bill.id : null,
            subcontractBillId: bill.type === 'SUBCONTRACT_BILL' ? bill.id : null,
            purchaseOrderId: bill.order && 'purchaseOrderId' in bill.order ? bill.order.purchaseOrderId : null,
            workOrderId: bill.order && 'workOrderId' in bill.order ? bill.order.workOrderId : null,
            paymentRequestId: request?.id ?? null,
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
        if (isBill(bill)) await syncPaid(tx, bill.type, bill.id);
        if (request) await syncRequestPaid(tx, request.id);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    const paidOn = `₹${a.amount.toFixed(2)} paid on ${dto.paymentDate}${dto.reference ? ` (${dto.reference})` : ''}`;
    await this.audit.log(user, 'VENDOR_PAYMENT', id, 'CREATED', `₹${a.amount.toFixed(2)} paid against ${bill.label}${request ? ` (${request.requestNo})` : ''}`);
    if (isBill(bill)) await this.audit.log(user, bill.type, bill.id, 'PAYMENT_MADE', paidOn);
    if (request) await this.audit.log(user, 'PAYMENT_REQUEST', request.id, 'PAYMENT_MADE', paidOn);
    // The supplier's portal logins see it on their statement.
    await this.notifications.notifyVendor(user.organizationId, bill.vendorId, {
      title: `Payment of ₹${a.amount.toFixed(2)} made`,
      body: `Against ${bill.label}, on ${dto.paymentDate}${dto.reference ? `, reference ${dto.reference}` : ''}.`,
      entityType: 'PORTAL_PAYMENT',
      entityId: id,
    });
    return this.get(user, id);
  }

  private async load(user: RequestUser, id: string) {
    this.assertCanRecord(user);
    const row = await this.prisma.vendorPayment.findFirst({ where: { id, organizationId: user.organizationId }, include: { paymentRequest: { select: { id: true, requestNo: true, amount: true } } } });
    if (!row) throw new NotFoundException('Payment not found');
    return { row, bill: await this.billOf(row, user), request: row.paymentRequest as Request | null };
  }

  async update(user: RequestUser, id: string, dto: UpdatePaymentDto): Promise<VendorPaymentDto> {
    const { row, bill, request } = await this.load(user, id);
    assertNotExported(row, 'This payment');
    if (dto.paymentDate !== undefined) this.checkDate(dto.paymentDate, bill);
    const a = this.amounts(bill, dto, row);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, bill);
      await this.checkBalance(tx, bill, id, settles(a));
      if (request) await this.checkRequest(tx, request, id, settles(a));
      await this.checkAdvanceCovers(tx, bill, id, settles(a));
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
      if (isBill(bill)) await syncPaid(tx, bill.type, bill.id);
      if (request) await syncRequestPaid(tx, request.id);
    });
    await this.audit.log(user, 'VENDOR_PAYMENT', id, 'UPDATED');
    return this.get(user, id);
  }

  /** Take off a payment entered by mistake; its bill goes back to unpaid if it no longer settles. */
  async remove(user: RequestUser, id: string) {
    const { row, bill, request } = await this.load(user, id);
    assertNotExported(row, 'This payment');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, bill);
      await this.checkAdvanceCovers(tx, bill, id, null);
      await tx.vendorPayment.delete({ where: { id } });
      if (isBill(bill)) await syncPaid(tx, bill.type, bill.id);
      if (request) await syncRequestPaid(tx, request.id);
    });
    const takenOff = `₹${row.amount.toFixed(2)} of ${dateOnly(row.paymentDate)} taken off`;
    await this.audit.log(user, 'VENDOR_PAYMENT', id, 'DELETED', `₹${row.amount.toFixed(2)} of ${dateOnly(row.paymentDate)}`);
    if (isBill(bill)) await this.audit.log(user, bill.type, bill.id, 'PAYMENT_REMOVED', takenOff);
    if (request) await this.audit.log(user, 'PAYMENT_REQUEST', request.id, 'PAYMENT_REMOVED', takenOff);
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
    const [org, vbills, sbills, payments] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { paymentsNeedRequest: true } }),
      this.prisma.vendorBill.findMany({
        where: { project: projectWhere, status: 'APPROVED', ...(q.vendorId ? { vendorId: q.vendorId } : {}) },
        select: { id: true, billNo: true, invoiceDate: true, dueDate: true, ...VENDOR_BILL_PAYABLE, paidAmount: true, purchaseOrderId: true, vendor: vendorSel, project: projectSel },
      }),
      this.prisma.subcontractBill.findMany({
        where: { project: projectWhere, status: 'APPROVED', ...(q.vendorId ? { workOrder: { vendorId: q.vendorId } } : {}) },
        select: {
          id: true,
          billNo: true,
          isFinal: true,
          billDate: true,
          dueDate: true,
          ...SUB_BILL_PAYABLE,
          paidAmount: true,
          retentionAmount: true,
          tdsAmount: true,
          advanceRecoveryAmount: true,
          workOrderId: true,
          workOrder: { select: { woNo: true, vendor: vendorSel } },
          project: projectSel,
        },
      }),
      this.prisma.vendorPayment.findMany({
        where: { project: projectWhere, ...(q.vendorId ? { vendorId: q.vendorId } : {}) },
        select: { projectId: true, vendorId: true, amount: true, tdsAmount: true, otherDeduction: true, vendorBillId: true, subcontractBillId: true, purchaseOrderId: true, workOrderId: true, vendor: vendorSel, project: projectSel },
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
          request: null,
        });
    };
    for (const b of vbills) take('VENDOR_BILL', b.id, b.billNo, b.vendor, b.project, b.invoiceDate, b.dueDate, vendorBillPayable(b), b.paidAmount);
    for (const b of sbills) {
      take('SUBCONTRACT_BILL', b.id, subBillLabel(b.workOrder.woNo, b.billNo, b.isFinal), b.workOrder.vendor, b.project, b.billDate, b.dueDate, subBillPayable(b), b.paidAmount);
      for (const t of tallies(b.workOrder.vendor, b.project)) {
        t.retentionHeld = t.retentionHeld.add(b.retentionAmount);
        t.tdsDeducted = t.tdsDeducted.add(b.tdsAmount);
      }
    }
    // Advances are not against a bill: they count as outstanding with the vendor until their order's
    // approved bills take them off (adjusted on vendor bills, recovered on subcontractor bills). A payment on account
    // of a site's fund request counts as paid.
    const advances = new Map<string, { v: V; p: P; paid: Prisma.Decimal; taken: Prisma.Decimal }>();
    for (const r of payments) {
      const key = r.vendorBillId || r.subcontractBillId ? null : (r.purchaseOrderId ?? r.workOrderId);
      if (key) {
        const a = advances.get(key) ?? { v: r.vendor, p: r.project, paid: ZERO, taken: ZERO };
        a.paid = a.paid.add(settles(r));
        advances.set(key, a);
        continue;
      }
      for (const t of [all, byVendor.get(r.vendorId)?.t, byProject.get(r.projectId)?.t]) {
        if (!t) continue;
        t.paid = t.paid.add(r.amount);
        t.deducted = t.deducted.add(r.tdsAmount).add(r.otherDeduction);
        t.tdsDeducted = t.tdsDeducted.add(r.tdsAmount);
      }
    }
    for (const b of vbills) if (b.purchaseOrderId && advances.has(b.purchaseOrderId)) advances.get(b.purchaseOrderId)!.taken = advances.get(b.purchaseOrderId)!.taken.add(b.advanceAdjusted);
    for (const b of sbills) if (advances.has(b.workOrderId)) advances.get(b.workOrderId)!.taken = advances.get(b.workOrderId)!.taken.add(b.advanceRecoveryAmount);
    for (const a of advances.values()) {
      const left = Prisma.Decimal.max(a.paid.sub(a.taken), ZERO);
      if (left.isZero()) continue;
      for (const t of tallies(a.v, a.p)) t.advanceOutstanding = t.advanceOutstanding.add(left);
    }

    // The latest open payment request on each bill: an approved one with something left to pay first.
    const requests = openBills.length
      ? await this.prisma.paymentRequest.findMany({
          where: {
            kind: 'BILL',
            status: { not: 'REJECTED' },
            paidDate: null,
            OR: [{ vendorBillId: { in: openBills.filter((b) => b.billType === 'VENDOR_BILL').map((b) => b.billId) } }, { subcontractBillId: { in: openBills.filter((b) => b.billType === 'SUBCONTRACT_BILL').map((b) => b.billId) } }],
          },
          select: { id: true, requestNo: true, status: true, amount: true, paidAmount: true, vendorBillId: true, subcontractBillId: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    for (const b of openBills) {
      const mine = requests.filter((r) => (r.vendorBillId ?? r.subcontractBillId) === b.billId);
      const r = mine.find((x) => x.status === 'APPROVED') ?? mine[0];
      if (r) b.request = { id: r.id, requestNo: r.requestNo, status: r.status, amount: money(r.amount)!, unpaid: money(r.status === 'APPROVED' ? Prisma.Decimal.max(r.amount.sub(r.paidAmount), ZERO) : ZERO)! };
    }

    const vendors: VendorPayableDto[] = [...byVendor.values()]
      .map(({ v, t }) => ({ vendorId: v.id, vendorName: v.name, vendorMsme: v.msmeCategory, openBills: t.openBills, ...totalsDto(t) }))
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding) || a.vendorName.localeCompare(b.vendorName));
    const projects: ProjectPayableDto[] = [...byProject.values()]
      .map(({ p, t }) => ({ projectId: p.id, projectCode: p.code, projectName: p.name, ...totalsDto(t) }))
      .sort((a, b) => a.projectCode.localeCompare(b.projectCode));
    openBills.sort((a, b) => a.daysToDue - b.daysToDue || Number(b.outstanding) - Number(a.outstanding));
    return { asOf, totals: totalsDto(all), vendors, projects, openBills, paymentsNeedRequest: org.paymentsNeedRequest };
  }
}

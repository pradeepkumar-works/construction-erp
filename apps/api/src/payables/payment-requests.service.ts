import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PAYMENT_REQUEST_KIND_LABELS,
  SUBMISSION_STATUS_LABELS,
  canRequestPayment,
  canViewPaymentRequests,
  subBillLabel,
  type Paginated,
  type PaymentRequestDto,
  type PaymentRequestKind,
  type PaymentRequestSortField,
  type SortOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { advanceRequested } from './advances';
import { SUB_BILL_PAYABLE, VENDOR_BILL_PAYABLE, subBillPayable, vendorBillPayable } from './payable';
import { CreatePaymentRequestDto, ListPaymentRequestsQuery, UpdatePaymentRequestDto } from './payables.dto';

type Db = Prisma.TransactionClient | PrismaService;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
/** A payment may settle a request to within a rupee of rounding, as it may a bill. */
const TOLERANCE = D(1);
const rupees = (d: Prisma.Decimal) => `₹${d.toFixed(2)}`;

const include = {
  project: { select: { code: true, name: true } },
  vendor: { select: { name: true, msmeCategory: true } },
  vendorBill: { select: { billNo: true, ...VENDOR_BILL_PAYABLE, dueDate: true } },
  subcontractBill: { select: { billNo: true, isFinal: true, ...SUB_BILL_PAYABLE, dueDate: true, workOrder: { select: { woNo: true } } } },
  purchaseOrder: { select: { poNo: true, total: true } },
  workOrder: { select: { woNo: true, value: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.PaymentRequestInclude;
type Row = Prisma.PaymentRequestGetPayload<{ include: typeof include }>;

const ORDER: Record<PaymentRequestSortField, (o: SortOrder) => Prisma.PaymentRequestOrderByWithRelationInput[]> = {
  requestNo: (o) => [{ requestNo: o }],
  neededBy: (o) => [{ neededBy: { sort: o, nulls: 'last' } }, { requestNo: 'desc' }],
  amount: (o) => [{ amount: o }],
  status: (o) => [{ status: o }, { requestNo: 'desc' }],
  vendor: (o) => [{ vendor: { name: o } }, { requestNo: 'desc' }],
  project: (o) => [{ project: { name: o } }, { requestNo: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['requestNo', 'amount', 'createdAt']);

/** What a request pays, as the checks see it. */
export interface RequestTarget {
  kind: PaymentRequestKind;
  label: string;
  projectId: string;
  vendorId: string;
  vendorBillId: string | null;
  subcontractBillId: string | null;
  purchaseOrderId: string | null;
  workOrderId: string | null;
  /** A bill's payable, or the order's value */
  value: Prisma.Decimal;
  /** What a request may still ask for (other requests excluded) */
  open: Prisma.Decimal;
}

/** The label of a request's bill or order. */
export const targetLabel = (r: {
  vendorBill: { billNo: string } | null;
  subcontractBill: { billNo: number; isFinal: boolean; workOrder: { woNo: string } } | null;
  purchaseOrder: { poNo: string } | null;
  workOrder: { woNo: string } | null;
}) =>
  r.vendorBill ? r.vendorBill.billNo : r.subcontractBill ? subBillLabel(r.subcontractBill.workOrder.woNo, r.subcontractBill.billNo, r.subcontractBill.isFinal) : (r.purchaseOrder?.poNo ?? r.workOrder?.woNo ?? '');

/** Keep a request's `paidAmount` and `paidDate` in step with the payments drawing on it. */
export async function syncRequestPaid(tx: Prisma.TransactionClient, requestId: string) {
  const [req, s, last] = await Promise.all([
    tx.paymentRequest.findUniqueOrThrow({ where: { id: requestId }, select: { amount: true } }),
    tx.vendorPayment.aggregate({ where: { paymentRequestId: requestId }, _sum: { amount: true, tdsAmount: true, otherDeduction: true } }),
    tx.vendorPayment.findFirst({ where: { paymentRequestId: requestId }, orderBy: { paymentDate: 'desc' }, select: { paymentDate: true } }),
  ]);
  const paid = (s._sum.amount ?? ZERO).add(s._sum.tdsAmount ?? ZERO).add(s._sum.otherDeduction ?? ZERO);
  await tx.paymentRequest.update({ where: { id: requestId }, data: { paidAmount: paid, paidDate: last && paid.add(TOLERANCE).gte(req.amount) ? last.paymentDate : null } });
}

/**
 * Payment requests (v5 item 90): before accounts releases money, someone asks for it to be paid (an approved bill) or
 * advanced (against an approved purchase order or work order), and the request goes through the approval matrix
 * (submission type PAYMENT_REQUEST). Payments then draw on an approved request up to its amount. A bill request asks
 * for at most what the bill still has unpaid less what other open requests on it already ask; an advance for at most
 * the order's value less advances already asked for. Both are checked again on submit and on approval, since the bill
 * may have been paid or another advance approved meanwhile.
 */
@Injectable()
export class PaymentRequestsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {
    lifecycle.beforeApprove('PAYMENT_REQUEST', async (_user, id) => {
      const r = await this.prisma.paymentRequest.findUniqueOrThrow({ where: { id } });
      await this.checkAmount(this.prisma, await this.targetOf(this.prisma, r, id), r.amount);
    });
  }

  toDto(r: Row, open: Prisma.Decimal | null = null): PaymentRequestDto {
    const value = r.vendorBill ? vendorBillPayable(r.vendorBill) : r.subcontractBill ? subBillPayable(r.subcontractBill) : (r.purchaseOrder?.total ?? r.workOrder?.value ?? ZERO);
    return {
      id: r.id,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      requestNo: r.requestNo,
      kind: r.kind,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      vendorMsme: r.vendor.msmeCategory,
      vendorBillId: r.vendorBillId,
      subcontractBillId: r.subcontractBillId,
      purchaseOrderId: r.purchaseOrderId,
      workOrderId: r.workOrderId,
      targetLabel: targetLabel(r),
      targetValue: money(value)!,
      targetOpen: open === null ? null : money(Prisma.Decimal.max(open, ZERO))!,
      dueDate: dateOnly(r.vendorBill?.dueDate ?? r.subcontractBill?.dueDate ?? null),
      amount: money(r.amount)!,
      mode: r.mode,
      neededBy: dateOnly(r.neededBy),
      reason: r.reason,
      paidAmount: money(r.paidAmount)!,
      outstanding: money(r.status === 'APPROVED' ? Prisma.Decimal.max(r.amount.sub(r.paidAmount), ZERO) : ZERO)!,
      paidDate: dateOnly(r.paidDate),
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

  private assertCanView(user: RequestUser) {
    if (!canViewPaymentRequests(user.roleKey)) throw new ForbiddenException('Your role cannot see payment requests');
  }

  private async assertCanRequest(user: RequestUser, projectId: string) {
    if (!canRequestPayment(user.roleKey)) throw new ForbiddenException('Only management, project managers, accounts, procurement and quantity surveyors ask for payments');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private where(user: RequestUser, q: ListPaymentRequestsQuery): Prisma.PaymentRequestWhereInput {
    const where: Prisma.PaymentRequestWhereInput = { ...this.access.submissionWhere(user) };
    for (const k of ['projectId', 'vendorId', 'kind', 'status', 'vendorBillId', 'subcontractBillId', 'purchaseOrderId', 'workOrderId'] as const) if (q[k]) (where as Record<string, unknown>)[k] = q[k];
    if (q.toPay) {
      where.status = 'APPROVED';
      where.paidDate = null;
    }
    if (q.mine) where.submittedById = user.id;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { requestNo: ilike(w) },
          { reason: ilike(w) },
          { vendor: { name: ilike(w) } },
          { project: { name: ilike(w) } },
          { project: { code: ilike(w) } },
          { vendorBill: { billNo: ilike(w) } },
          { subcontractBill: { workOrder: { woNo: ilike(w) } } },
          { purchaseOrder: { poNo: ilike(w) } },
          { workOrder: { woNo: ilike(w) } },
        ],
      }));
    return where;
  }

  async list(user: RequestUser, q: ListPaymentRequestsQuery): Promise<Paginated<PaymentRequestDto>> {
    this.assertCanView(user);
    const where = this.where(user, q);
    const sortBy = q.sortBy ?? 'requestNo';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.paymentRequest.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.paymentRequest.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<PaymentRequestDto> {
    this.assertCanView(user);
    const row = await this.prisma.paymentRequest.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Payment request not found');
    const open = row.status === 'APPROVED' ? null : await this.targetOf(this.prisma, row, row.id).then((t) => t.open, () => ZERO);
    return this.toDto(row, open);
  }

  /**
   * The bill or order a request is for, with what a request may still ask: an approved bill's payable less what is
   * settled and what other open requests (submitted, or approved and not yet paid) ask; an approved, open order's
   * value less the advances other requests ask for.
   */
  async target(db: Db, organizationId: string, kind: PaymentRequestKind, ids: { vendorBillId?: string | null; subcontractBillId?: string | null; purchaseOrderId?: string | null; workOrderId?: string | null }, exceptId?: string): Promise<RequestTarget> {
    const base = { kind, vendorBillId: null, subcontractBillId: null, purchaseOrderId: null, workOrderId: null };
    const notApproved = (label: string, status: keyof typeof SUBMISSION_STATUS_LABELS) => new ConflictException(`${label} is ${SUBMISSION_STATUS_LABELS[status].toLowerCase()}; only approved ${kind === 'BILL' ? 'bills are paid' : 'orders get an advance'}`);
    if (kind === 'BILL') {
      if (!!ids.vendorBillId === !!ids.subcontractBillId || ids.purchaseOrderId || ids.workOrderId) throw new BadRequestException('Choose the one bill to pay');
      const bill = ids.vendorBillId
        ? await db.vendorBill.findFirst({ where: { id: ids.vendorBillId, organizationId } }).then((b) => b && { label: b.billNo, projectId: b.projectId, vendorId: b.vendorId, status: b.status, payable: vendorBillPayable(b), paid: b.paidAmount, vendorBillId: b.id as string | null, subcontractBillId: null as string | null })
        : await db.subcontractBill
            .findFirst({ where: { id: ids.subcontractBillId!, organizationId }, include: { workOrder: { select: { woNo: true, vendorId: true } } } })
            .then((b) => b && { label: subBillLabel(b.workOrder.woNo, b.billNo, b.isFinal), projectId: b.projectId, vendorId: b.workOrder.vendorId, status: b.status, payable: subBillPayable(b), paid: b.paidAmount, vendorBillId: null as string | null, subcontractBillId: b.id as string | null });
      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.status !== 'APPROVED') throw notApproved(bill.label, bill.status);
      const others = await db.paymentRequest.findMany({
        where: { ...(ids.vendorBillId ? { vendorBillId: ids.vendorBillId } : { subcontractBillId: ids.subcontractBillId }), status: { in: ['SUBMITTED', 'APPROVED'] }, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { status: true, amount: true, paidAmount: true },
      });
      const asked = others.reduce((s, o) => s.add(o.status === 'APPROVED' ? Prisma.Decimal.max(o.amount.sub(o.paidAmount), ZERO) : o.amount), ZERO);
      return { ...base, vendorBillId: bill.vendorBillId, subcontractBillId: bill.subcontractBillId, label: bill.label, projectId: bill.projectId, vendorId: bill.vendorId, value: bill.payable, open: bill.payable.sub(bill.paid).sub(asked) };
    }
    if (kind === 'PO_ADVANCE') {
      if (!ids.purchaseOrderId || ids.vendorBillId || ids.subcontractBillId || ids.workOrderId) throw new BadRequestException('Choose the purchase order the advance is against');
      const po = await db.purchaseOrder.findFirst({ where: { id: ids.purchaseOrderId, organizationId } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status !== 'APPROVED') throw notApproved(po.poNo, po.status);
      if (po.closedAt) throw new ConflictException(`${po.poNo} is short-closed; no advance is paid against it`);
      const asked = await advanceRequested(db as Prisma.TransactionClient, { purchaseOrderId: po.id }, exceptId);
      return { ...base, purchaseOrderId: po.id, label: po.poNo, projectId: po.projectId, vendorId: po.vendorId, value: po.total, open: po.total.sub(asked) };
    }
    if (!ids.workOrderId || ids.vendorBillId || ids.subcontractBillId || ids.purchaseOrderId) throw new BadRequestException('Choose the work order the advance is against');
    const wo = await db.workOrder.findFirst({ where: { id: ids.workOrderId, organizationId } });
    if (!wo) throw new NotFoundException('Work order not found');
    if (wo.status !== 'APPROVED') throw notApproved(wo.woNo, wo.status);
    if (wo.closedAt) throw new ConflictException(`${wo.woNo} is closed; no advance is paid against it`);
    const asked = await advanceRequested(db as Prisma.TransactionClient, { workOrderId: wo.id }, exceptId);
    return { ...base, workOrderId: wo.id, label: wo.woNo, projectId: wo.projectId, vendorId: wo.vendorId, value: wo.value, open: wo.value.sub(asked) };
  }

  private targetOf(db: Db, r: { organizationId: string; kind: PaymentRequestKind; vendorBillId: string | null; subcontractBillId: string | null; purchaseOrderId: string | null; workOrderId: string | null }, exceptId: string) {
    return this.target(db, r.organizationId, r.kind, r, exceptId);
  }

  private parseAmount(v: string) {
    const a = D(v);
    if (a.lte(0)) throw new BadRequestException('Enter the amount to pay');
    if (a.decimalPlaces() > 2) throw new BadRequestException('Amounts are in rupees and paise');
    return a;
  }

  private async checkAmount(_db: Db, t: RequestTarget, amount: Prisma.Decimal) {
    if (amount.lte(t.open)) return;
    const open = Prisma.Decimal.max(t.open, ZERO);
    if (t.kind === 'BILL') throw new BadRequestException(`Ask for at most ${rupees(open)}: that is what ${t.label} still has unpaid, less what other open requests on it ask for`);
    throw new BadRequestException(`Ask for at most ${rupees(open)}: ${t.label} is worth ${rupees(t.value)} and other requests already ask for ${rupees(t.value.sub(t.open))} in advances`);
  }

  private checkNeededBy(v: string | null | undefined) {
    if (!v) return null;
    return parseDate(v);
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.paymentRequest.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreatePaymentRequestDto): Promise<PaymentRequestDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    const t = await this.target(this.prisma, user.organizationId, dto.kind, dto);
    await this.assertCanRequest(user, t.projectId);
    const amount = this.parseAmount(dto.amount);
    await this.checkAmount(this.prisma, t, amount);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const requestNo = await nextDocNo(tx, user.organizationId, 'PR', async (prefix) =>
          (await tx.paymentRequest.findFirst({ where: { organizationId: user.organizationId, requestNo: { startsWith: prefix } }, orderBy: { requestNo: 'desc' }, select: { requestNo: true } }))?.requestNo ?? null,
        );
        if (dto.id && (await tx.paymentRequest.count({ where: { id: dto.id } }))) return null;
        const row = await tx.paymentRequest.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: t.projectId,
            vendorId: t.vendorId,
            requestNo,
            kind: dto.kind,
            vendorBillId: t.vendorBillId,
            subcontractBillId: t.subcontractBillId,
            purchaseOrderId: t.purchaseOrderId,
            workOrderId: t.workOrderId,
            amount,
            mode: dto.mode ?? 'BANK',
            neededBy: this.checkNeededBy(dto.neededBy),
            reason: dto.reason ?? null,
            submittedById: user.id,
            status: 'DRAFT',
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    if (!id) return this.get(user, dto.id!);
    await this.attachments.link(user, 'paymentRequestId', id, dto.attachmentIds);
    await this.audit.log(user, 'PAYMENT_REQUEST', id, 'CREATED', `${PAYMENT_REQUEST_KIND_LABELS[dto.kind]}: ${rupees(amount)} against ${t.label}`);
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdatePaymentRequestDto): Promise<PaymentRequestDto> {
    const row = await this.lifecycle.load(user, 'PAYMENT_REQUEST', id);
    await this.assertCanRequest(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    const current = await this.prisma.paymentRequest.findUniqueOrThrow({ where: { id } });
    const amount = dto.amount !== undefined ? this.parseAmount(dto.amount) : current.amount;
    await this.checkAmount(this.prisma, await this.targetOf(this.prisma, current, id), amount);
    await this.prisma.paymentRequest.update({
      where: { id },
      data: {
        amount,
        ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
        ...(dto.neededBy !== undefined ? { neededBy: this.checkNeededBy(dto.neededBy) } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
      },
    });
    await this.attachments.sync(user, 'paymentRequestId', id, dto.attachmentIds);
    await this.audit.log(user, 'PAYMENT_REQUEST', id, 'UPDATED');
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  /** Submit for approval, checking the amount again: the bill may have been paid, or another request raised, since. */
  async submit(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'PAYMENT_REQUEST', id);
    const r = await this.prisma.paymentRequest.findUniqueOrThrow({ where: { id } });
    if (row.status !== 'SUBMITTED' && row.status !== 'APPROVED') await this.checkAmount(this.prisma, await this.targetOf(this.prisma, r, id), r.amount);
    await this.lifecycle.submit(user, 'PAYMENT_REQUEST', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'PAYMENT_REQUEST', id);
    await this.assertCanRequest(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    if (await this.prisma.vendorPayment.count({ where: { paymentRequestId: id } })) throw new ConflictException('Payments draw on this request; it cannot be deleted');
    await this.prisma.paymentRequest.delete({ where: { id } });
    await this.audit.log(user, 'PAYMENT_REQUEST', id, 'DELETED');
    return { ok: true };
  }
}

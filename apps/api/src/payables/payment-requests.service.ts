import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FUND_PURPOSE_LABELS,
  PAYMENT_REQUEST_KIND_LABELS,
  SUBMISSION_STATUS_LABELS,
  canReleaseFunds,
  canRequestFunds,
  canRequestPayment,
  canViewPaymentRequests,
  subBillLabel,
  type FundPurpose,
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
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentRequestDto, ListPaymentRequestsQuery, ReleaseFundsDto, UpdatePaymentRequestDto } from './payables.dto';

type Db = Prisma.TransactionClient | PrismaService;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
/** A payment may settle a request to within a rupee of rounding, as it may a bill. */
const TOLERANCE = D(1);
const rupees = (d: Prisma.Decimal) => `₹${d.toFixed(2)}`;

const include = {
  project: { select: { code: true, name: true } },
  vendor: { select: { name: true, msmeCategory: true } },
  imprest: { select: { holder: { select: { fullName: true } } } },
  raisedAtProject: { select: { name: true } },
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
  vendorId: string | null;
  /** A fund request's imprest */
  imprestId: string | null;
  vendorBillId: string | null;
  subcontractBillId: string | null;
  purchaseOrderId: string | null;
  workOrderId: string | null;
  /** A bill's payable, or the order's value */
  value: Prisma.Decimal;
  /** What a request may still ask for (other requests excluded); null when nothing caps it (a fund request) */
  open: Prisma.Decimal | null;
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
  const released = { paymentRequestId: requestId, kind: 'ADVANCE', status: 'PAID' } satisfies Prisma.ImprestEntryWhereInput;
  const [req, s, last, r, lastRelease] = await Promise.all([
    tx.paymentRequest.findUniqueOrThrow({ where: { id: requestId }, select: { amount: true } }),
    tx.vendorPayment.aggregate({ where: { paymentRequestId: requestId }, _sum: { amount: true, tdsAmount: true, otherDeduction: true } }),
    tx.vendorPayment.findFirst({ where: { paymentRequestId: requestId }, orderBy: { paymentDate: 'desc' }, select: { paymentDate: true } }),
    // A fund request released into an imprest (v6 item 107) is settled by the advances paid on it.
    tx.imprestEntry.aggregate({ where: released, _sum: { amount: true } }),
    tx.imprestEntry.findFirst({ where: released, orderBy: { date: 'desc' }, select: { date: true } }),
  ]);
  const paid = (s._sum.amount ?? ZERO).add(s._sum.tdsAmount ?? ZERO).add(s._sum.otherDeduction ?? ZERO).add(r._sum.amount ?? ZERO);
  const lastDate = [last?.paymentDate, lastRelease?.date].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  await tx.paymentRequest.update({ where: { id: requestId }, data: { paidAmount: paid, paidDate: lastDate && paid.add(TOLERANCE).gte(req.amount) ? lastDate : null } });
}

/** "Wages, into Ramesh Das's imprest" or "Local purchase, to Shiva Traders on account". */
const fundLabel = (purpose: FundPurpose | null, vendor: string | null, holder: string | null) =>
  `${purpose ? FUND_PURPOSE_LABELS[purpose] : 'Funds'}, ${vendor ? `to ${vendor} on account` : `into ${holder ?? 'the site'}'s imprest`}`;

/**
 * Payment requests (v5 item 90): before accounts releases money, someone asks for it to be paid (an approved bill) or
 * advanced (against an approved purchase order or work order), and the request goes through the approval matrix
 * (submission type PAYMENT_REQUEST). Payments then draw on an approved request up to its amount. A bill request asks
 * for at most what the bill still has unpaid less what other open requests on it already ask; an advance for at most
 * the order's value less advances already asked for. Both are checked again on submit and on approval, since the bill
 * may have been paid or another advance approved meanwhile. A site's fund request (v6 item 107) asks head office for
 * money for a purpose, with no bill or order: accounts release it into the site's imprest (`release`) or pay the
 * party on account through Payables.
 */
@Injectable()
export class PaymentRequestsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
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
      vendorName: r.vendor?.name ?? null,
      vendorMsme: r.vendor?.msmeCategory ?? null,
      purpose: r.purpose,
      imprestId: r.imprestId,
      imprestHolderName: r.imprest?.holder.fullName ?? null,
      raisedAtProjectId: r.raisedAtProjectId,
      raisedAtProjectName: r.raisedAtProject?.name ?? null,
      vendorBillId: r.vendorBillId,
      subcontractBillId: r.subcontractBillId,
      purchaseOrderId: r.purchaseOrderId,
      workOrderId: r.workOrderId,
      targetLabel: r.kind === 'FUND_REQUEST' ? fundLabel(r.purpose, r.vendor?.name ?? null, r.imprest?.holder.fullName ?? null) : targetLabel(r),
      targetValue: money(value),
      targetOpen: open === null ? null : money(Prisma.Decimal.max(open, ZERO)),
      dueDate: dateOnly(r.vendorBill?.dueDate ?? r.subcontractBill?.dueDate ?? null),
      amount: money(r.amount),
      mode: r.mode,
      neededBy: dateOnly(r.neededBy),
      reason: r.reason,
      paidAmount: money(r.paidAmount),
      outstanding: money(r.status === 'APPROVED' ? Prisma.Decimal.max(r.amount.sub(r.paidAmount), ZERO) : ZERO),
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
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  /** Site staff who ask for funds (v6 item 107) but not for payments see only fund requests. */
  private assertCanView(user: RequestUser) {
    if (!canViewPaymentRequests(user.roleKey) && !canRequestFunds(user.roleKey)) throw new ForbiddenException('Your role cannot see payment requests');
  }

  private visible(user: RequestUser): Prisma.PaymentRequestWhereInput {
    return { ...this.access.submissionWhere(user), ...(canViewPaymentRequests(user.roleKey) ? {} : { kind: 'FUND_REQUEST' as const }) };
  }

  private async assertCanRequest(user: RequestUser, projectId: string, kind: PaymentRequestKind) {
    if (kind === 'FUND_REQUEST' ? !canRequestFunds(user.roleKey) : !canRequestPayment(user.roleKey))
      throw new ForbiddenException(kind === 'FUND_REQUEST' ? 'Your role cannot ask for funds' : 'Only management, project managers, accounts, procurement and quantity surveyors ask for payments');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private where(user: RequestUser, q: ListPaymentRequestsQuery): Prisma.PaymentRequestWhereInput {
    const where: Prisma.PaymentRequestWhereInput = this.visible(user);
    for (const k of ['projectId', 'vendorId', 'kind', 'status', 'vendorBillId', 'subcontractBillId', 'purchaseOrderId', 'workOrderId', 'imprestId'] as const) if (q[k]) (where as Record<string, unknown>)[k] = q[k];
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
          { imprest: { holder: { fullName: ilike(w) } } },
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
    const row = await this.prisma.paymentRequest.findFirst({ where: { id, ...this.visible(user) }, include });
    if (!row) throw new NotFoundException('Payment request not found');
    const open = row.status === 'APPROVED' || row.kind === 'FUND_REQUEST' ? null : await this.targetOf(this.prisma, row, row.id).then((t) => t.open, () => ZERO);
    return this.toDto(row, open);
  }

  /**
   * The bill or order a request is for, with what a request may still ask: an approved bill's payable less what is
   * settled and what other open requests (submitted, or approved and not yet paid) ask; an approved, open order's
   * value less the advances other requests ask for.
   */
  async target(
    db: Db,
    organizationId: string,
    kind: PaymentRequestKind,
    ids: { vendorBillId?: string | null; subcontractBillId?: string | null; purchaseOrderId?: string | null; workOrderId?: string | null; projectId?: string | null; imprestId?: string | null; vendorId?: string | null },
    exceptId?: string,
  ): Promise<RequestTarget> {
    const base = { kind, imprestId: null, vendorBillId: null, subcontractBillId: null, purchaseOrderId: null, workOrderId: null };
    if (kind === 'FUND_REQUEST') return this.fundTarget(db, organizationId, ids);
    if (ids.imprestId) throw new BadRequestException('Only a fund request goes into an imprest');
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

  /**
   * A fund request (v6 item 107): a site the user's organisation has, and exactly one of an active imprest at that site
   * or an active party to pay on account. Nothing caps the amount; the approval matrix decides.
   */
  private async fundTarget(db: Db, organizationId: string, ids: { vendorBillId?: string | null; subcontractBillId?: string | null; purchaseOrderId?: string | null; workOrderId?: string | null; projectId?: string | null; imprestId?: string | null; vendorId?: string | null }): Promise<RequestTarget> {
    if (ids.vendorBillId || ids.subcontractBillId || ids.purchaseOrderId || ids.workOrderId) throw new BadRequestException('A fund request is not against a bill or an order');
    if (!ids.projectId) throw new BadRequestException('Choose the site the money is for');
    if (!!ids.imprestId === !!ids.vendorId) throw new BadRequestException("Choose where the money goes: into the site's imprest, or to a party");
    const base = { kind: 'FUND_REQUEST' as const, projectId: ids.projectId, vendorBillId: null, subcontractBillId: null, purchaseOrderId: null, workOrderId: null, value: ZERO, open: null };
    if (ids.imprestId) {
      const imp = await db.imprest.findFirst({ where: { id: ids.imprestId, organizationId }, include: { holder: { select: { fullName: true } } } });
      if (!imp || imp.projectId !== ids.projectId) throw new BadRequestException("Choose an imprest at this site; open one under Site imprest first");
      if (!imp.isActive) throw new ConflictException(`${imp.holder.fullName}'s imprest at this site is closed; reopen it under Site imprest, or ask for a payment to a party`);
      return { ...base, label: `${imp.holder.fullName}'s imprest`, vendorId: null, imprestId: imp.id };
    }
    const v = await db.vendor.findFirst({ where: { id: ids.vendorId!, organizationId }, select: { id: true, name: true, isActive: true } });
    if (!v) throw new NotFoundException('Vendor not found');
    if (!v.isActive) throw new ConflictException(`${v.name} is inactive; reactivate them under Vendors first`);
    return { ...base, label: v.name, vendorId: v.id, imprestId: null };
  }

  private targetOf(
    db: Db,
    r: { organizationId: string; kind: PaymentRequestKind; projectId: string; vendorId: string | null; imprestId: string | null; vendorBillId: string | null; subcontractBillId: string | null; purchaseOrderId: string | null; workOrderId: string | null },
    exceptId: string,
  ) {
    return this.target(db, r.organizationId, r.kind, r, exceptId);
  }

  private parseAmount(v: string) {
    const a = D(v);
    if (a.lte(0)) throw new BadRequestException('Enter the amount to pay');
    if (a.decimalPlaces() > 2) throw new BadRequestException('Amounts are in rupees and paise');
    return a;
  }

  private async checkAmount(_db: Db, t: RequestTarget, amount: Prisma.Decimal) {
    if (t.open === null || amount.lte(t.open)) return;
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
    await this.assertCanRequest(user, t.projectId, dto.kind);
    const fund = dto.kind === 'FUND_REQUEST';
    if (fund && !dto.purpose) throw new BadRequestException('Choose what the money is for');
    // Asking on behalf of another site: the asking site is one the user works at too.
    const raisedAt = fund && dto.raisedAtProjectId && dto.raisedAtProjectId !== t.projectId ? dto.raisedAtProjectId : null;
    if (raisedAt) await this.access.assertCanAccessProject(user, raisedAt);
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
            imprestId: t.imprestId,
            purpose: fund ? dto.purpose : null,
            raisedAtProjectId: raisedAt,
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
    await this.audit.log(user, 'PAYMENT_REQUEST', id, 'CREATED', fund ? `Fund request: ${rupees(amount)} for ${FUND_PURPOSE_LABELS[dto.purpose!].toLowerCase()}, ${t.imprestId ? 'into' : 'to'} ${t.label}` : `${PAYMENT_REQUEST_KIND_LABELS[dto.kind]}: ${rupees(amount)} against ${t.label}`);
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdatePaymentRequestDto): Promise<PaymentRequestDto> {
    const row = await this.lifecycle.load(user, 'PAYMENT_REQUEST', id);
    const current = await this.prisma.paymentRequest.findUniqueOrThrow({ where: { id } });
    await this.assertCanRequest(user, row.projectId, current.kind);
    await this.lifecycle.assertEditable(user, row);
    const amount = dto.amount !== undefined ? this.parseAmount(dto.amount) : current.amount;
    await this.checkAmount(this.prisma, await this.targetOf(this.prisma, current, id), amount);
    await this.prisma.paymentRequest.update({
      where: { id },
      data: {
        amount,
        ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
        ...(dto.neededBy !== undefined ? { neededBy: this.checkNeededBy(dto.neededBy) } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        ...(dto.purpose !== undefined && current.kind === 'FUND_REQUEST' ? { purpose: dto.purpose } : {}),
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
    const current = await this.prisma.paymentRequest.findUniqueOrThrow({ where: { id }, select: { kind: true } });
    await this.assertCanRequest(user, row.projectId, current.kind);
    await this.lifecycle.assertEditable(user, row);
    if ((await this.prisma.vendorPayment.count({ where: { paymentRequestId: id } })) || (await this.prisma.imprestEntry.count({ where: { paymentRequestId: id } }))) throw new ConflictException('Payments draw on this request; it cannot be deleted');
    await this.prisma.paymentRequest.delete({ where: { id } });
    await this.audit.log(user, 'PAYMENT_REQUEST', id, 'DELETED');
    return { ok: true };
  }

  /**
   * Release an approved fund request (v6 item 107) into its imprest: a paid advance on the imprest, up to what the
   * request has left, which raises the holder's cash in hand. A fund request to a party is paid under Payables instead.
   */
  async release(user: RequestUser, id: string, dto: ReleaseFundsDto): Promise<PaymentRequestDto> {
    if (!canReleaseFunds(user.roleKey)) throw new ForbiddenException('Only accounts and the company admins release funds into an imprest');
    const r = await this.prisma.paymentRequest.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: { imprest: { include: { holder: { select: { fullName: true } } } } } });
    if (!r) throw new NotFoundException('Payment request not found');
    if (r.kind !== 'FUND_REQUEST' || !r.imprest) throw new BadRequestException(`${r.requestNo} is paid to a party: record the payment against it under Payables`);
    if (r.status !== 'APPROVED') throw new BadRequestException(`${r.requestNo} is not approved yet; only approved requests are released`);
    if (!r.imprest.isActive) throw new ConflictException(`${r.imprest.holder.fullName}'s imprest is closed; reopen it under Site imprest to release into it`);
    const date = parseDate(dto.date);
    if (date.getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The release date cannot be in the future');
    const imprestId = r.imprest.id;
    const amount = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PAYREQ:${id}`}))`;
      const done = await tx.imprestEntry.aggregate({ where: { paymentRequestId: id, kind: 'ADVANCE', status: 'PAID' }, _sum: { amount: true } });
      const left = r.amount.sub(done._sum.amount ?? ZERO);
      const amt = dto.amount !== undefined ? this.parseAmount(dto.amount) : left;
      if (left.lte(0)) throw new ConflictException(`${r.requestNo} is released in full`);
      if (amt.gt(left.add(TOLERANCE))) throw new BadRequestException(`Release at most ${rupees(left)}: that is what ${r.requestNo} has left`);
      await tx.imprestEntry.create({
        data: {
          organizationId: r.organizationId,
          imprestId,
          kind: 'ADVANCE',
          status: 'PAID',
          amount: amt,
          date,
          paidOn: date,
          paymentMode: dto.mode ?? r.mode,
          reference: dto.reference ?? null,
          reason: `${r.requestNo}: ${r.purpose ? FUND_PURPOSE_LABELS[r.purpose].toLowerCase() : 'funds'}${r.reason ? `, ${r.reason}` : ''}`.slice(0, 1000),
          requestedById: r.submittedById,
          decidedById: user.id,
          decidedAt: new Date(),
          paymentRequestId: id,
        },
      });
      await syncRequestPaid(tx, id);
      return amt;
    });
    const what = `${rupees(amount)} released into ${r.imprest.holder.fullName}'s imprest on ${dto.date}${dto.reference ? ` (${dto.reference})` : ''}`;
    await this.audit.log(user, 'PAYMENT_REQUEST', id, 'PAYMENT_MADE', what);
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: [...new Set([r.imprest.holderId, r.submittedById])].filter((u) => u !== user.id),
      type: 'IMPREST',
      title: `${r.requestNo}: ${rupees(amount)} released`,
      body: `Into ${r.imprest.holder.fullName}'s imprest on ${dto.date}${dto.reference ? `, reference ${dto.reference}` : ''}.`,
      projectId: r.projectId,
      entityType: 'IMPREST',
      entityId: imprestId,
    });
    return this.get(user, id);
  }
}

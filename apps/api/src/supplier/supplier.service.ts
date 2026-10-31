import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  DEBIT_NOTE_REASON_LABELS,
  PAYMENT_ROLES,
  SUPPLIER_PROFILE_FIELDS,
  SUPPLIER_PROFILE_LABELS,
  STOCK_KEEPER_ROLES,
  VENDOR_BANK_ROLES,
  VENDOR_BILL_ROLES,
  type SupplierBillDto,
  type SupplierChangeDto,
  type SupplierDispatchDto,
  type SupplierEnquiryDto,
  type SupplierHomeDto,
  type SupplierInviteResultDto,
  type SupplierInvoiceDto,
  type SupplierInvoiceStage,
  type SupplierLoginDto,
  type SupplierOrderDto,
  type SupplierPaymentDto,
  type SupplierProfileDto,
  type SupplierProfileField,
  type SupplierStatementDto,
  type VendorPortalDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ATTACHMENT_FIELDS, AttachmentsService } from '../common/attachments.service';
import { ProjectAccessService } from '../common/project-access.service';
import { isUniqueViolation } from '../common/idempotency';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { NotificationsService } from '../notifications/notifications.service';
import { PasswordLinksService } from '../auth/password-links.service';
import { EnquiriesService } from '../enquiries/enquiries.service';
import { PublicQuoteDto } from '../enquiries/enquiries.dto';
import { subBillPayable, vendorBillPayable } from '../payables/payable';
import { inr } from '../checks/bill-rules';
import { dispatchProblem, dueSplit, invoiceStage, maskAccount, paymentDebit, profileChanges, statement, subBillCredit, toSend, touchesBank, vendorBillCredit, type ProfileValues, type StatementEntry } from './supplier-rules';
import type { AcceptOrderDto, CreateDispatchDto, CreateSupplierInvoiceDto, DecideChangeDto, InviteSupplierDto, InvoiceInboxQuery, ReturnInvoiceDto, StatementQuery, SupplierChangeInput } from './supplier.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const sum = <T>(rows: T[], f: (r: T) => Prisma.Decimal.Value) => rows.reduce((t, r) => t.add(D(f(r))), ZERO);

const PROFILE_SELECT = Object.fromEntries(SUPPLIER_PROFILE_FIELDS.map((f) => [f, true])) as Record<SupplierProfileField, true>;

const dispatchInclude = {
  purchaseOrder: { select: { poNo: true, project: { select: { name: true } } } },
  grn: { select: { id: true, entryNo: true, date: true } },
  lines: { include: { purchaseOrderLine: { select: { itemName: true, unit: true, sortOrder: true } } } },
} satisfies Prisma.SupplierDispatchInclude;
type DispatchRow = Prisma.SupplierDispatchGetPayload<{ include: typeof dispatchInclude }>;

const invoiceInclude = {
  vendor: { select: { name: true } },
  purchaseOrder: { select: { poNo: true, projectId: true, project: { select: { name: true } } } },
  workOrder: { select: { woNo: true, projectId: true, project: { select: { name: true } } } },
  createdBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.SupplierInvoiceInclude;
type InvoiceRow = Prisma.SupplierInvoiceGetPayload<{ include: typeof invoiceInclude }>;

const changeInclude = {
  vendor: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  decidedBy: { select: { fullName: true } },
} satisfies Prisma.SupplierChangeRequestInclude;
type ChangeRow = Prisma.SupplierChangeRequestGetPayload<{ include: typeof changeInclude }>;

const loginSelect = { id: true, fullName: true, email: true, phone: true, isActive: true, invitedAt: true, createdAt: true } satisfies Prisma.UserSelect;

/**
 * The supplier portal. The supplier's side acts only for the vendor its login belongs to
 * (`ProjectAccessService.supplierVendor`); the company's side (logins, the invoice inbox, profile changes) is for the
 * roles in `canManageSupplierLogins`, `canCheckSupplierInvoices` and `canApproveSupplierChange`.
 */
@Injectable()
export class SupplierService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
    private links: PasswordLinksService,
    private enquiries: EnquiriesService,
  ) {}

  // Home

  async home(user: RequestUser): Promise<SupplierHomeDto> {
    const vendorId = this.access.supplierVendor(user);
    const [vendor, org, enquiries, orders, invoices, changesPending, statement] = await Promise.all([
      this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true, name: true, gstin: true, msmeCategory: true } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { name: true } }),
      this.enquiries.forVendor(user.organizationId, vendorId),
      this.orders(user),
      this.invoices(user),
      this.prisma.supplierChangeRequest.count({ where: { vendorId, status: 'PENDING' } }),
      this.statement(user, {}),
    ]);
    const split = dueSplit(statement.bills.filter((b) => b.status === 'APPROVED'), todayIn());
    const last = statement.payments[0];
    return {
      organizationName: org.name,
      vendor: { id: vendor.id, name: vendor.name, gstin: vendor.gstin, msme: vendor.msmeCategory === 'MICRO' || vendor.msmeCategory === 'SMALL' },
      enquiriesOpen: enquiries.filter((e) => e.open).length,
      ordersToAccept: orders.filter((o) => !o.acceptedAt && !o.closed).length,
      ordersOpen: orders.filter((o) => o.kind === 'PO' && !o.closed && o.lines.some((l) => Number(l.toSend) > 0)).length,
      invoicesWithAccounts: invoices.filter((i) => i.stage === 'SUBMITTED').length,
      invoicesReturned: invoices.filter((i) => i.stage === 'RETURNED').length,
      changesPending,
      due: money(split.due)!,
      overdue: money(split.overdue)!,
      lastPayment: last ? { date: last.date, amount: last.amount } : null,
    };
  }

  // Enquiries

  enquiryList(user: RequestUser): Promise<SupplierEnquiryDto[]> {
    return this.enquiries.forVendor(user.organizationId, this.access.supplierVendor(user));
  }

  async quote(user: RequestUser, id: string, dto: PublicQuoteDto) {
    const vendorId = this.access.supplierVendor(user);
    const result = await this.enquiries.respondForVendor(user.organizationId, vendorId, id, dto);
    await this.audit.log(user, 'ENQUIRY_TOKEN', id, 'QUOTED', 'on the supplier portal');
    return result;
  }

  // Orders

  /** The vendor's approved purchase and work orders, newest first. */
  async orders(user: RequestUser, only?: { kind: 'PO' | 'WO'; id: string }): Promise<SupplierOrderDto[]> {
    const vendorId = this.access.supplierVendor(user);
    const [pos, wos] = await Promise.all([
      only?.kind === 'WO'
        ? []
        : this.prisma.purchaseOrder.findMany({
            where: { vendorId, status: 'APPROVED', ...(only ? { id: only.id } : {}) },
            include: {
              project: { select: { name: true } },
              supplierAcceptedBy: { select: { fullName: true } },
              lines: {
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                include: { stockTxns: { select: { quantity: true } }, dispatchLines: { where: { dispatch: { cancelledAt: null, grn: null } }, select: { quantity: true } } },
              },
            },
            orderBy: [{ poDate: 'desc' }, { poNo: 'desc' }],
            take: 200,
          }),
      only?.kind === 'PO'
        ? []
        : this.prisma.workOrder.findMany({
            where: { vendorId, status: 'APPROVED', ...(only ? { id: only.id } : {}) },
            include: { project: { select: { name: true } }, supplierAcceptedBy: { select: { fullName: true } }, lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
            orderBy: [{ woDate: 'desc' }, { woNo: 'desc' }],
            take: 200,
          }),
    ]);
    const out: (SupplierOrderDto & { sortDate: string })[] = [
      ...pos.map((p) => ({
        kind: 'PO' as const,
        id: p.id,
        number: p.poNo,
        date: dateOnly(p.poDate)!,
        sortDate: dateOnly(p.poDate)!,
        projectName: p.project.name,
        title: p.deliveryAddress ?? p.project.name,
        deliveryAddress: p.deliveryAddress,
        dueBy: dateOnly(p.deliveryBy),
        paymentTerms: p.paymentTerms,
        paymentDays: p.paymentDays,
        amount: money(p.total)!,
        acceptedAt: iso(p.supplierAcceptedAt),
        acceptedBy: p.supplierAcceptedBy?.fullName ?? null,
        supplierNote: p.supplierNote,
        closed: !!p.closedAt,
        lines: p.lines.map((l) => {
          const received = sum(l.stockTxns, (t) => t.quantity);
          const onTheWay = sum(l.dispatchLines, (d) => d.quantity);
          return {
            id: l.id,
            itemName: l.itemName,
            specification: l.specification,
            unit: l.unit,
            quantity: dec(l.quantity)!,
            rate: money(l.rate)!,
            amount: money(l.amount)!,
            onTheWay: dec(onTheWay)!,
            received: dec(received)!,
            toSend: dec(p.closedAt ? ZERO : toSend(l.quantity, received, onTheWay))!,
          };
        }),
      })),
      ...wos.map((w) => ({
        kind: 'WO' as const,
        id: w.id,
        number: w.woNo,
        date: dateOnly(w.woDate)!,
        sortDate: dateOnly(w.woDate)!,
        projectName: w.project.name,
        title: w.title,
        deliveryAddress: null,
        dueBy: dateOnly(w.endDate),
        paymentTerms: w.terms,
        paymentDays: w.paymentDays,
        amount: money(w.value)!,
        acceptedAt: iso(w.supplierAcceptedAt),
        acceptedBy: w.supplierAcceptedBy?.fullName ?? null,
        supplierNote: w.supplierNote,
        closed: !!w.closedAt,
        lines: w.lines.map((l) => ({ id: l.id, itemName: l.description, specification: null, unit: l.unit, quantity: dec(l.quantity)!, rate: money(l.rate)!, amount: money(l.amount)!, onTheWay: '0', received: '0', toSend: '0' })),
      })),
    ];
    return out.sort((a, b) => b.sortDate.localeCompare(a.sortDate) || b.number.localeCompare(a.number)).map(({ sortDate: _s, ...o }) => o);
  }

  async order(user: RequestUser, kind: 'PO' | 'WO', id: string): Promise<SupplierOrderDto> {
    const [o] = await this.orders(user, { kind, id });
    if (!o) throw new NotFoundException(kind === 'PO' ? 'Purchase order not found' : 'Work order not found');
    return o;
  }

  /** The supplier accepts an approved order, with a remark if they have one; whoever raised it is told. */
  async accept(user: RequestUser, kind: 'PO' | 'WO', id: string, dto: AcceptOrderDto): Promise<SupplierOrderDto> {
    const o = await this.order(user, kind, id);
    if (o.closed) throw new ConflictException(`${o.number} is closed`);
    if (o.acceptedAt) throw new ConflictException(`${o.number} was already accepted`);
    const data = { supplierAcceptedAt: new Date(), supplierAcceptedById: user.id, supplierNote: dto.note ?? null };
    const row =
      kind === 'PO'
        ? await this.prisma.purchaseOrder.update({ where: { id }, data, select: { submittedById: true, projectId: true } })
        : await this.prisma.workOrder.update({ where: { id }, data, select: { submittedById: true, projectId: true } });
    const type = kind === 'PO' ? 'PURCHASE_ORDER' : 'WORK_ORDER';
    await this.audit.log(user, type, id, 'SUPPLIER_ACCEPTED', dto.note ? `Accepted on the supplier portal: ${dto.note}` : 'Accepted on the supplier portal');
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: [row.submittedById],
      type: 'SUPPLIER',
      title: `${o.number} accepted by the supplier`,
      body: `${user.fullName} accepted it on the supplier portal.${dto.note ? ` Remark: ${dto.note}` : ''}`,
      projectId: row.projectId,
      entityType: type,
      entityId: id,
    });
    return this.order(user, kind, id);
  }

  // Dispatch notes

  private dispatchDto(d: DispatchRow): SupplierDispatchDto {
    return {
      id: d.id,
      dispatchNo: d.dispatchNo,
      date: dateOnly(d.date)!,
      purchaseOrderId: d.purchaseOrderId,
      poNo: d.purchaseOrder.poNo,
      projectName: d.purchaseOrder.project.name,
      vehicleNo: d.vehicleNo,
      lrNo: d.lrNo,
      transporter: d.transporter,
      remarks: d.remarks,
      status: d.cancelledAt ? 'CANCELLED' : d.grn ? 'RECEIVED' : 'ON_THE_WAY',
      grn: d.grn ? { id: d.grn.id, entryNo: d.grn.entryNo, date: dateOnly(d.grn.date)! } : null,
      lines: [...d.lines]
        .sort((a, b) => a.purchaseOrderLine.sortOrder - b.purchaseOrderLine.sortOrder)
        .map((l) => ({ purchaseOrderLineId: l.purchaseOrderLineId, itemName: l.purchaseOrderLine.itemName, unit: l.purchaseOrderLine.unit, quantity: dec(l.quantity)! })),
      createdAt: d.createdAt.toISOString(),
    };
  }

  async dispatches(user: RequestUser): Promise<SupplierDispatchDto[]> {
    const vendorId = this.access.supplierVendor(user);
    const rows = await this.prisma.supplierDispatch.findMany({ where: { vendorId }, include: dispatchInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200 });
    return rows.map((d) => this.dispatchDto(d));
  }

  /**
   * A dispatch note against one of the vendor's open purchase orders: no more than is still to send on each line.
   * Sending against an order accepts it. The site's store and whoever raised the order are told it is on the way.
   */
  async createDispatch(user: RequestUser, dto: CreateDispatchDto): Promise<SupplierDispatchDto> {
    const vendorId = this.access.supplierVendor(user);
    const o = await this.order(user, 'PO', dto.purchaseOrderId);
    if (o.closed) throw new ConflictException(`${o.number} is closed; nothing more is to be sent against it`);
    if (dto.date > todayIn()) throw new BadRequestException('The date sent cannot be in the future');
    const problem = dispatchProblem(
      dto.lines.map((l) => ({ lineId: l.purchaseOrderLineId, quantity: l.quantity })),
      o.lines.map((l) => ({ id: l.id, itemName: l.itemName, unit: l.unit, toSend: l.toSend })),
    );
    if (problem) throw new BadRequestException(problem);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const d = await tx.supplierDispatch.create({
          data: {
            organizationId: user.organizationId,
            vendorId,
            purchaseOrderId: o.id,
            dispatchNo: dto.dispatchNo,
            date: parseDate(dto.date),
            vehicleNo: dto.vehicleNo ?? null,
            lrNo: dto.lrNo ?? null,
            transporter: dto.transporter ?? null,
            remarks: dto.remarks ?? null,
            createdById: user.id,
            lines: { create: dto.lines.map((l) => ({ organizationId: user.organizationId, purchaseOrderLineId: l.purchaseOrderLineId, quantity: D(l.quantity) })) },
          },
          select: { id: true },
        });
        if (!o.acceptedAt) await tx.purchaseOrder.update({ where: { id: o.id }, data: { supplierAcceptedAt: new Date(), supplierAcceptedById: user.id } });
        return d.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`You already sent a dispatch note numbered ${dto.dispatchNo}`);
      throw e;
    }
    await this.audit.log(user, 'PURCHASE_ORDER', o.id, 'SUPPLIER_DISPATCHED', `Dispatch note ${dto.dispatchNo}${dto.vehicleNo ? `, vehicle ${dto.vehicleNo}` : ''}`);
    const po = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: o.id }, select: { projectId: true, submittedById: true } });
    const store = await this.access.usersWithRoles(user.organizationId, po.projectId, STOCK_KEEPER_ROLES.filter((r) => r === 'STORE_MANAGER' || r === 'SITE_ENGINEER'));
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: [...new Set([po.submittedById, ...store.map((u) => u.id)])],
      type: 'SUPPLIER',
      title: `Material on the way for ${o.number}`,
      body: `Dispatch note ${dto.dispatchNo}${dto.vehicleNo ? ` on ${dto.vehicleNo}` : ''}, sent ${dto.date}. Receive it with a GRN filled from the note.`,
      projectId: po.projectId,
      entityType: 'PURCHASE_ORDER',
      entityId: o.id,
    });
    return this.dispatchDto(await this.prisma.supplierDispatch.findUniqueOrThrow({ where: { id }, include: dispatchInclude }));
  }

  /** Take back a dispatch note the site has not received. */
  async cancelDispatch(user: RequestUser, id: string): Promise<SupplierDispatchDto> {
    const vendorId = this.access.supplierVendor(user);
    const d = await this.prisma.supplierDispatch.findFirst({ where: { id, vendorId }, include: dispatchInclude });
    if (!d) throw new NotFoundException('Dispatch note not found');
    if (d.grn) throw new ConflictException(`The site already received it as ${d.grn.entryNo}`);
    if (d.cancelledAt) return this.dispatchDto(d);
    await this.prisma.supplierDispatch.update({ where: { id }, data: { cancelledAt: new Date() } });
    await this.audit.log(user, 'PURCHASE_ORDER', d.purchaseOrderId, 'SUPPLIER_DISPATCH_CANCELLED', `Dispatch note ${d.dispatchNo}`);
    return this.dispatchDto(await this.prisma.supplierDispatch.findUniqueOrThrow({ where: { id }, include: dispatchInclude }));
  }

  // Invoices

  /** The bills recorded from these invoices: same vendor and invoice number, not rejected. */
  private async billsFor(rows: InvoiceRow[]) {
    const byVendor = new Map<string, string[]>();
    for (const r of rows) byVendor.set(r.vendorId, [...(byVendor.get(r.vendorId) ?? []), r.invoiceNo]);
    const out = new Map<string, NonNullable<SupplierInvoiceDto['bill']>>();
    await Promise.all(
      [...byVendor].map(async ([vendorId, invoiceNos]) => {
        const [vbills, sbills] = await Promise.all([
          this.prisma.vendorBill.findMany({
            where: { vendorId, invoiceNo: { in: invoiceNos }, status: { not: 'REJECTED' } },
            select: { id: true, billNo: true, invoiceNo: true, status: true, total: true, advanceAdjusted: true, fuelRecovery: true, debitNoteAmount: true, paidAmount: true },
          }),
          this.prisma.subcontractBill.findMany({
            where: { workOrder: { vendorId }, invoiceNo: { in: invoiceNos }, status: { not: 'REJECTED' } },
            select: { id: true, billNo: true, invoiceNo: true, status: true, netPayable: true, debitNoteAmount: true, paidAmount: true, workOrder: { select: { woNo: true } } },
          }),
        ]);
        for (const b of vbills) out.set(`${vendorId}|${b.invoiceNo}`, { kind: 'VENDOR_BILL', id: b.id, billNo: b.billNo, status: b.status, payable: money(vendorBillPayable(b))!, paid: money(b.paidAmount)! });
        for (const b of sbills)
          if (b.invoiceNo) out.set(`${vendorId}|${b.invoiceNo}`, { kind: 'SUBCONTRACT_BILL', id: b.id, billNo: `${b.workOrder.woNo} bill ${b.billNo}`, status: b.status, payable: money(subBillPayable(b))!, paid: money(b.paidAmount)! });
      }),
    );
    return out;
  }

  private async invoiceDtos(rows: InvoiceRow[]): Promise<SupplierInvoiceDto[]> {
    const bills = await this.billsFor(rows);
    return rows.map((r) => {
      const bill = bills.get(`${r.vendorId}|${r.invoiceNo}`) ?? null;
      const project = r.purchaseOrder ?? r.workOrder;
      return {
        id: r.id,
        vendorId: r.vendorId,
        vendorName: r.vendor.name,
        invoiceNo: r.invoiceNo,
        invoiceDate: dateOnly(r.invoiceDate)!,
        amount: money(r.amount)!,
        gstAmount: money(r.gstAmount),
        purchaseOrderId: r.purchaseOrderId,
        poNo: r.purchaseOrder?.poNo ?? null,
        workOrderId: r.workOrderId,
        woNo: r.workOrder?.woNo ?? null,
        projectId: project?.projectId ?? null,
        projectName: project?.project.name ?? null,
        notes: r.notes,
        status: r.status,
        stage: invoiceStage(r.status, bill),
        returnNote: r.returnNote,
        sentBy: r.createdBy.fullName,
        createdAt: r.createdAt.toISOString(),
        bill,
        attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      };
    });
  }

  async invoices(user: RequestUser): Promise<SupplierInvoiceDto[]> {
    const vendorId = this.access.supplierVendor(user);
    return this.invoiceDtos(await this.prisma.supplierInvoice.findMany({ where: { vendorId }, include: invoiceInclude, orderBy: [{ createdAt: 'desc' }], take: 200 }));
  }

  /**
   * Send an invoice. It is against one of the vendor's approved orders, or neither (a service with no order). A
   * returned or withdrawn invoice of the same number is sent again in its place; a billed one cannot be.
   */
  async createInvoice(user: RequestUser, dto: CreateSupplierInvoiceDto): Promise<SupplierInvoiceDto> {
    const vendorId = this.access.supplierVendor(user);
    if (dto.purchaseOrderId && dto.workOrderId) throw new BadRequestException('Choose the purchase order or the work order, not both');
    if (dto.invoiceDate > todayIn()) throw new BadRequestException('The invoice date cannot be in the future');
    if (dto.gstAmount != null && dto.gstAmount > dto.amount) throw new BadRequestException('GST cannot be more than the invoice amount');
    if (dto.purchaseOrderId) await this.order(user, 'PO', dto.purchaseOrderId);
    if (dto.workOrderId) await this.order(user, 'WO', dto.workOrderId);
    const files = await this.prisma.attachment.count({ where: { id: { in: dto.attachmentIds }, uploadedById: user.id, supplierInvoiceId: null } });
    if (files !== new Set(dto.attachmentIds).size) throw new BadRequestException('Attach the invoice again: a file was not found');
    const earlier = await this.prisma.supplierInvoice.findUnique({ where: { vendorId_invoiceNo: { vendorId, invoiceNo: dto.invoiceNo } }, include: invoiceInclude });
    if (earlier) {
      const [e] = await this.invoiceDtos([earlier]);
      if (e.stage !== 'RETURNED' && e.stage !== 'WITHDRAWN') throw new ConflictException(`Invoice ${dto.invoiceNo} was already sent`);
    }
    const data = {
      purchaseOrderId: dto.purchaseOrderId ?? null,
      workOrderId: dto.workOrderId ?? null,
      invoiceDate: parseDate(dto.invoiceDate),
      amount: D(dto.amount),
      gstAmount: dto.gstAmount != null ? D(dto.gstAmount) : null,
      notes: dto.notes ?? null,
      status: 'SUBMITTED' as const,
      returnNote: null,
      decidedById: null,
      decidedAt: null,
    };
    const id = await this.prisma.$transaction(async (tx) => {
      const row = earlier
        ? await tx.supplierInvoice.update({ where: { id: earlier.id }, data: { ...data, createdById: user.id }, select: { id: true } })
        : await tx.supplierInvoice.create({ data: { ...data, organizationId: user.organizationId, vendorId, invoiceNo: dto.invoiceNo, createdById: user.id }, select: { id: true } });
      if (earlier) await tx.attachment.updateMany({ where: { supplierInvoiceId: row.id }, data: { supplierInvoiceId: null } });
      await tx.attachment.updateMany({ where: { id: { in: dto.attachmentIds }, uploadedById: user.id, supplierInvoiceId: null }, data: { supplierInvoiceId: row.id } });
      return row.id;
    });
    await this.audit.log(user, 'SUPPLIER_INVOICE', id, earlier ? 'RESENT' : 'CREATED', `Invoice ${dto.invoiceNo} for ${inr(dto.amount)}`);
    const vendor = await this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { name: true } });
    const office = await this.access.companyUsersWithRoles(user.organizationId, VENDOR_BILL_ROLES);
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: office.map((u) => u.id),
      type: 'SUPPLIER',
      title: `Invoice from ${vendor.name}`,
      body: `${dto.invoiceNo} for ${inr(dto.amount)}, sent on the supplier portal. Record the bill or return it.`,
      entityType: 'SUPPLIER_INVOICE',
      entityId: id,
    });
    return this.invoice(user.organizationId, id);
  }

  private async invoice(organizationId: string, id: string, vendorId?: string) {
    const row = await this.prisma.supplierInvoice.findFirst({ where: { id, organizationId, ...(vendorId ? { vendorId } : {}) }, include: invoiceInclude });
    if (!row) throw new NotFoundException('Invoice not found');
    return (await this.invoiceDtos([row]))[0];
  }

  /** Take back an invoice accounts have not billed yet. */
  async withdrawInvoice(user: RequestUser, id: string): Promise<SupplierInvoiceDto> {
    const vendorId = this.access.supplierVendor(user);
    const inv = await this.invoice(user.organizationId, id, vendorId);
    if (inv.stage !== 'SUBMITTED') throw new ConflictException(inv.bill ? `Accounts already recorded it as ${inv.bill.billNo}` : 'Only an invoice with accounts can be withdrawn');
    await this.prisma.supplierInvoice.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    await this.audit.log(user, 'SUPPLIER_INVOICE', id, 'WITHDRAWN', null);
    return this.invoice(user.organizationId, id);
  }

  // The statement

  /** The vendor's bills, payments and debit notes, as one statement with what is owed after each line. */
  async statement(user: RequestUser, q: StatementQuery): Promise<SupplierStatementDto> {
    const vendorId = this.access.supplierVendor(user);
    return this.statementFor(vendorId, q.from ?? null);
  }

  private async statementFor(vendorId: string, from: string | null): Promise<SupplierStatementDto> {
    const [vbills, sbills, payments, notes] = await Promise.all([
      this.prisma.vendorBill.findMany({
        where: { vendorId, status: { in: ['SUBMITTED', 'APPROVED'] } },
        select: { id: true, billNo: true, invoiceNo: true, invoiceDate: true, dueDate: true, status: true, total: true, advanceAdjusted: true, fuelRecovery: true, debitNoteAmount: true, paidAmount: true, project: { select: { name: true } } },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.subcontractBill.findMany({
        where: { workOrder: { vendorId }, status: { in: ['SUBMITTED', 'APPROVED'] } },
        select: {
          id: true,
          billNo: true,
          isFinal: true,
          invoiceNo: true,
          billDate: true,
          dueDate: true,
          status: true,
          netPayable: true,
          advanceRecoveryAmount: true,
          retentionAmount: true,
          debitNoteAmount: true,
          paidAmount: true,
          project: { select: { name: true } },
          workOrder: { select: { woNo: true } },
        },
        orderBy: { billDate: 'desc' },
      }),
      this.prisma.vendorPayment.findMany({
        where: { vendorId },
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          tdsAmount: true,
          otherDeduction: true,
          mode: true,
          reference: true,
          vendorBill: { select: { billNo: true, invoiceNo: true } },
          subcontractBill: { select: { billNo: true, workOrder: { select: { woNo: true } } } },
          purchaseOrder: { select: { poNo: true } },
          workOrder: { select: { woNo: true } },
        },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.debitNote.findMany({
        where: { vendorId, cancelledAt: null, OR: [{ vendorBill: { status: 'APPROVED' } }, { subcontractBill: { status: 'APPROVED' } }] },
        select: { noteNo: true, date: true, reason: true, total: true },
      }),
    ]);
    const bills: SupplierBillDto[] = [
      ...vbills.map((b) => {
        const payable = vendorBillPayable(b);
        return {
          kind: 'VENDOR_BILL' as const,
          id: b.id,
          ref: b.billNo,
          invoiceNo: b.invoiceNo,
          date: dateOnly(b.invoiceDate)!,
          dueDate: dateOnly(b.dueDate)!,
          projectName: b.project.name,
          payable: money(payable)!,
          paid: money(b.paidAmount)!,
          due: money(b.status === 'APPROVED' ? payable.sub(b.paidAmount) : payable)!,
          status: b.status,
        };
      }),
      ...sbills.map((b) => {
        const payable = subBillPayable(b);
        return {
          kind: 'SUBCONTRACT_BILL' as const,
          id: b.id,
          ref: `${b.workOrder.woNo} bill ${b.billNo}`,
          invoiceNo: b.invoiceNo,
          date: dateOnly(b.billDate)!,
          dueDate: dateOnly(b.dueDate)!,
          projectName: b.project.name,
          payable: money(payable)!,
          paid: money(b.paidAmount)!,
          due: money(b.status === 'APPROVED' ? payable.sub(b.paidAmount) : payable)!,
          status: b.status,
        };
      }),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));
    const against = (p: (typeof payments)[number]) =>
      p.vendorBill
        ? `${p.vendorBill.billNo} (invoice ${p.vendorBill.invoiceNo})`
        : p.subcontractBill
          ? `${p.subcontractBill.workOrder.woNo} bill ${p.subcontractBill.billNo}`
          : p.purchaseOrder
            ? `Advance on ${p.purchaseOrder.poNo}`
            : p.workOrder
              ? `Advance on ${p.workOrder.woNo}`
              : 'On account';
    const entries: StatementEntry[] = [
      ...vbills
        .filter((b) => b.status === 'APPROVED')
        .map((b) => ({ date: dateOnly(b.invoiceDate)!, kind: 'BILL' as const, ref: b.billNo, description: `Invoice ${b.invoiceNo}, ${b.project.name}`, debit: 0, credit: vendorBillCredit(b) })),
      ...sbills
        .filter((b) => b.status === 'APPROVED')
        .map((b) => ({
          date: dateOnly(b.billDate)!,
          kind: 'BILL' as const,
          ref: `${b.workOrder.woNo}/${b.billNo}`,
          description: `${b.isFinal ? 'Final' : 'Running'} bill ${b.billNo} on ${b.workOrder.woNo}, ${b.project.name}${b.retentionAmount.gt(0) ? ` (retention ${inr(b.retentionAmount.toNumber())} held)` : ''}`,
          debit: 0,
          credit: subBillCredit(b),
        })),
      ...payments.map((p) => ({
        date: dateOnly(p.paymentDate)!,
        kind: p.vendorBill || p.subcontractBill ? ('PAYMENT' as const) : ('ADVANCE' as const),
        ref: p.reference ?? p.mode,
        description: `${against(p)}${p.tdsAmount.gt(0) ? `, TDS ${inr(p.tdsAmount.toNumber())}` : ''}${p.otherDeduction.gt(0) ? `, deducted ${inr(p.otherDeduction.toNumber())}` : ''}`,
        debit: paymentDebit(p),
        credit: 0,
      })),
      ...notes.map((n) => ({ date: dateOnly(n.date)!, kind: 'DEBIT_NOTE' as const, ref: n.noteNo, description: DEBIT_NOTE_REASON_LABELS[n.reason], debit: n.total, credit: 0 })),
    ];
    const s = statement(entries, from);
    const deducted = sum(payments, (p) => D(p.tdsAmount).add(p.otherDeduction)).add(sum(notes, (n) => n.total));
    const paid = sum(payments, (p) => p.amount);
    const rows = s.rows.map((r) => ({ date: r.date, kind: r.kind, ref: r.ref, description: r.description, debit: money(D(r.debit))!, credit: money(D(r.credit))!, balance: money(r.balance)! }));
    if (s.opening) rows.unshift({ date: from!, kind: 'BILL', ref: '', description: 'Opening balance', debit: '0.00', credit: '0.00', balance: money(s.opening)! });
    return {
      from,
      to: todayIn(),
      rows,
      billed: money(s.billed)!,
      paid: money(paid)!,
      deducted: money(deducted)!,
      balance: money(s.balance)!,
      retentionHeld: money(sum(sbills.filter((b) => b.status === 'APPROVED'), (b) => b.retentionAmount))!,
      bills,
      payments: payments.map(
        (p): SupplierPaymentDto => ({
          id: p.id,
          date: dateOnly(p.paymentDate)!,
          amount: money(p.amount)!,
          tds: money(p.tdsAmount)!,
          otherDeduction: money(p.otherDeduction)!,
          mode: p.mode,
          reference: p.reference,
          against: against(p),
        }),
      ),
    };
  }

  // Profile

  private changeDto(r: ChangeRow, mask: boolean): SupplierChangeDto {
    const to = r.changes as Record<string, string | null>;
    const from = r.previous as Record<string, string | null>;
    const fields = SUPPLIER_PROFILE_FIELDS.filter((f) => f in to);
    const show = (f: SupplierProfileField, v: string | null) => (mask && f === 'bankAccountNo' ? maskAccount(v) : v);
    return {
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      changes: fields.map((field) => ({ field, label: SUPPLIER_PROFILE_LABELS[field], from: show(field, from[field] ?? null), to: show(field, to[field] ?? null) })),
      bank: touchesBank(fields),
      status: r.status,
      note: r.note,
      decisionNote: r.decisionNote,
      requestedBy: r.createdBy.fullName,
      createdAt: r.createdAt.toISOString(),
      decidedBy: r.decidedBy?.fullName ?? null,
      decidedAt: iso(r.decidedAt),
    };
  }

  async profile(user: RequestUser): Promise<SupplierProfileDto> {
    const vendorId = this.access.supplierVendor(user);
    const [v, changes] = await Promise.all([
      this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true, name: true, ...PROFILE_SELECT } }),
      this.prisma.supplierChangeRequest.findMany({ where: { vendorId }, include: changeInclude, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const values = Object.fromEntries(SUPPLIER_PROFILE_FIELDS.map((f) => [f, f === 'bankAccountNo' ? maskAccount(v[f]) : (v[f] ?? null)])) as ProfileValues;
    return { vendorId: v.id, name: v.name, values, changes: changes.map((c) => this.changeDto(c, true)) };
  }

  /**
   * Ask for the vendor's details to change. Nothing changes until the company approves it; a new bank account only by
   * those who pay vendors. One request waits at a time.
   */
  async requestChange(user: RequestUser, dto: SupplierChangeInput): Promise<SupplierProfileDto> {
    const vendorId = this.access.supplierVendor(user);
    const { note, ...wanted } = dto;
    // The page shows the account masked; sending the masked value back means "unchanged".
    if (wanted.bankAccountNo?.includes('•')) delete wanted.bankAccountNo;
    if (await this.prisma.supplierChangeRequest.count({ where: { vendorId, status: 'PENDING' } }))
      throw new ConflictException('Your earlier change is still waiting for approval. Ask the company to approve it first.');
    const v = await this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { name: true, ...PROFILE_SELECT } });
    const current = Object.fromEntries(SUPPLIER_PROFILE_FIELDS.map((f) => [f, v[f] ?? null])) as ProfileValues;
    const changes = profileChanges(current, wanted);
    if (!changes.length) throw new BadRequestException('Nothing is different from your details as they are');
    const bank = touchesBank(changes.map((c) => c.field));
    const row = await this.prisma.supplierChangeRequest.create({
      data: {
        organizationId: user.organizationId,
        vendorId,
        changes: Object.fromEntries(changes.map((c) => [c.field, c.to])),
        previous: Object.fromEntries(changes.map((c) => [c.field, c.from])),
        note: note ?? null,
        createdById: user.id,
      },
      select: { id: true },
    });
    await this.audit.log(user, 'VENDOR', vendorId, 'CHANGE_REQUESTED', changes.map((c) => SUPPLIER_PROFILE_LABELS[c.field]).join(', '));
    const office = await this.access.companyUsersWithRoles(user.organizationId, bank ? PAYMENT_ROLES : VENDOR_BANK_ROLES);
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: office.map((u) => u.id),
      type: 'SUPPLIER',
      title: `${v.name} asked to change their ${bank ? 'bank account' : 'details'}`,
      body: `${changes.map((c) => SUPPLIER_PROFILE_LABELS[c.field]).join(', ')}. Check and approve it on the vendor.`,
      entityType: 'SUPPLIER_CHANGE',
      entityId: row.id,
    });
    return this.profile(user);
  }

  // The company's side

  private loginDto(u: Prisma.UserGetPayload<{ select: typeof loginSelect }>): SupplierLoginDto {
    return { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, isActive: u.isActive, invitePending: u.invitedAt !== null, createdAt: u.createdAt.toISOString() };
  }

  private async vendorOf(user: RequestUser, vendorId: string) {
    const v = await this.prisma.vendor.findFirst({ where: { id: vendorId, organizationId: user.organizationId }, select: { id: true, name: true, isActive: true } });
    if (!v) throw new NotFoundException('Vendor not found');
    return v;
  }

  /** A vendor's portal logins and the changes they asked for. */
  async vendorPortal(user: RequestUser, vendorId: string): Promise<VendorPortalDto> {
    this.access.assertCanManageSupplierLogins(user);
    const v = await this.vendorOf(user, vendorId);
    const [logins, changes] = await Promise.all([
      this.prisma.user.findMany({ where: { vendorId, organizationId: user.organizationId }, select: loginSelect, orderBy: { fullName: 'asc' } }),
      this.prisma.supplierChangeRequest.findMany({ where: { vendorId }, include: changeInclude, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return { vendorId: v.id, vendorName: v.name, logins: logins.map((u) => this.loginDto(u)), changes: changes.map((c) => this.changeDto(c, false)) };
  }

  /** Give one of the vendor's people a supplier-portal login: an invite link to choose their password. */
  async invite(user: RequestUser, vendorId: string, dto: InviteSupplierDto, origin?: string): Promise<SupplierInviteResultDto> {
    this.access.assertCanManageSupplierLogins(user);
    const v = await this.vendorOf(user, vendorId);
    if (!v.isActive) throw new BadRequestException(`${v.name} is inactive in the vendor master`);
    const taken = await withoutTenant(() => this.prisma.login.findUnique({ where: { email: dto.email }, select: { id: true } }));
    if (taken) throw new ConflictException('A user with this email already exists');
    const role = await this.prisma.role.upsert({
      where: { organizationId_key: { organizationId: user.organizationId, key: 'SUPPLIER' } },
      update: {},
      create: { organizationId: user.organizationId, key: 'SUPPLIER', name: 'Supplier (portal)' },
    });
    const login = await this.prisma.user.create({
      data: {
        organizationId: user.organizationId,
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        roleId: role.id,
        vendorId: v.id,
        // Its own sign-in, with a password nobody knows until the invite link is used.
        loginId: (await this.prisma.login.create({ data: { email: dto.email, passwordHash: await bcrypt.hash(randomBytes(24).toString('base64url'), 10) } })).id,
        invitedAt: new Date(),
      },
      select: loginSelect,
    });
    await this.audit.log(user, 'VENDOR', v.id, 'PORTAL_LOGIN_ADDED', `${dto.fullName} (${dto.email})`);
    return { login: this.loginDto(login), invite: await this.links.create(login.id, 'INVITE', origin) };
  }

  /** Switch a login off (or on again); a new invite link for one still pending. */
  async setLoginActive(user: RequestUser, vendorId: string, loginId: string, isActive: boolean): Promise<SupplierLoginDto> {
    this.access.assertCanManageSupplierLogins(user);
    const login = await this.prisma.user.findFirst({ where: { id: loginId, vendorId, organizationId: user.organizationId }, select: { id: true, fullName: true } });
    if (!login) throw new NotFoundException('Login not found');
    const row = await this.prisma.user.update({ where: { id: login.id }, data: { isActive }, select: loginSelect });
    await this.audit.log(user, 'VENDOR', vendorId, isActive ? 'PORTAL_LOGIN_ON' : 'PORTAL_LOGIN_OFF', login.fullName);
    return this.loginDto(row);
  }

  async loginLink(user: RequestUser, vendorId: string, loginId: string, origin?: string) {
    this.access.assertCanManageSupplierLogins(user);
    const login = await this.prisma.user.findFirst({ where: { id: loginId, vendorId, organizationId: user.organizationId }, select: { id: true, isActive: true, invitedAt: true } });
    if (!login) throw new NotFoundException('Login not found');
    if (!login.isActive) throw new BadRequestException('Switch the login on first');
    return this.links.create(login.id, login.invitedAt ? 'INVITE' : 'RESET', origin);
  }

  /** Suppliers' invoices for accounts: those waiting by default, oldest first so the queue is worked in order. */
  async invoiceInbox(user: RequestUser, q: InvoiceInboxQuery): Promise<SupplierInvoiceDto[]> {
    this.access.assertCanCheckSupplierInvoices(user);
    const stage: SupplierInvoiceStage | null = q.all ? null : (q.stage ?? 'SUBMITTED');
    const status = stage === 'RETURNED' || stage === 'WITHDRAWN' ? stage : stage ? 'SUBMITTED' : undefined;
    const rows = await this.prisma.supplierInvoice.findMany({
      where: { organizationId: user.organizationId, ...(status ? { status } : {}), ...(q.vendorId ? { vendorId: q.vendorId } : {}) },
      include: invoiceInclude,
      orderBy: [{ createdAt: stage === 'SUBMITTED' ? 'asc' : 'desc' }],
      take: 300,
    });
    const dtos = await this.invoiceDtos(rows);
    return stage ? dtos.filter((d) => d.stage === stage) : dtos;
  }

  async inboxInvoice(user: RequestUser, id: string): Promise<SupplierInvoiceDto> {
    this.access.assertCanCheckSupplierInvoices(user);
    return this.invoice(user.organizationId, id);
  }

  /** Return an invoice to the supplier with what to fix; they can send it again with the same number. */
  async returnInvoice(user: RequestUser, id: string, dto: ReturnInvoiceDto): Promise<SupplierInvoiceDto> {
    this.access.assertCanCheckSupplierInvoices(user);
    const inv = await this.invoice(user.organizationId, id);
    if (inv.stage !== 'SUBMITTED') throw new ConflictException(inv.bill ? `It is already recorded as ${inv.bill.billNo}; reject that bill instead` : 'Only an invoice with accounts can be returned');
    await this.prisma.supplierInvoice.update({ where: { id }, data: { status: 'RETURNED', returnNote: dto.note, decidedById: user.id, decidedAt: new Date() } });
    await this.audit.log(user, 'SUPPLIER_INVOICE', id, 'RETURNED', dto.note);
    await this.notifications.notifyVendor(user.organizationId, inv.vendorId, {
      title: `Invoice ${inv.invoiceNo} returned`,
      body: `${dto.note} Fix it and send it again with the same number.`,
      entityType: 'PORTAL_INVOICE',
      entityId: id,
    });
    return this.invoice(user.organizationId, id);
  }

  /** Changes suppliers asked for, waiting ones by default, across vendors. */
  async changeList(user: RequestUser, status: SupplierChangeDto['status'] = 'PENDING'): Promise<SupplierChangeDto[]> {
    this.access.assertCanManageSupplierLogins(user);
    const rows = await this.prisma.supplierChangeRequest.findMany({ where: { organizationId: user.organizationId, status }, include: changeInclude, orderBy: { createdAt: 'asc' }, take: 200 });
    return rows.map((r) => this.changeDto(r, false));
  }

  /** Approve a change (the vendor is updated) or turn it down; the supplier is told either way. */
  async decideChange(user: RequestUser, id: string, dto: DecideChangeDto): Promise<SupplierChangeDto> {
    const row = await this.prisma.supplierChangeRequest.findFirst({ where: { id, organizationId: user.organizationId }, include: changeInclude });
    if (!row) throw new NotFoundException('Change not found');
    const changes = row.changes as Partial<Record<SupplierProfileField, string | null>>;
    const fields = SUPPLIER_PROFILE_FIELDS.filter((f) => f in changes);
    const bank = touchesBank(fields);
    this.access.assertCanDecideSupplierChange(user, bank);
    if (row.status !== 'PENDING') throw new ConflictException('This change was already decided: refresh the page');
    if (dto.approve && row.createdById === user.id) throw new BadRequestException('Someone else approves a change you asked for');
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.supplierChangeRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: dto.approve ? 'APPROVED' : 'REJECTED', decisionNote: dto.note ?? null, decidedById: user.id, decidedAt: new Date() },
      });
      if (!done.count) throw new ConflictException('This change was already decided: refresh the page');
      if (!dto.approve) return;
      const data: Prisma.VendorUpdateInput = Object.fromEntries(fields.map((f) => [f, changes[f] ?? null]));
      if (changes.gstin) data.stateCode = changes.gstin.slice(0, 2);
      await tx.vendor.update({ where: { id: row.vendorId }, data });
    });
    const what = fields.map((f) => SUPPLIER_PROFILE_LABELS[f]).join(', ');
    await this.audit.log(user, 'VENDOR', row.vendorId, dto.approve ? 'CHANGE_APPROVED' : 'CHANGE_REJECTED', `${what}${dto.note ? `: ${dto.note}` : ''}`);
    await this.notifications.notifyVendor(user.organizationId, row.vendorId, {
      title: dto.approve ? 'Your change is approved' : 'Your change was not accepted',
      body: `${what}.${dto.note ? ` ${dto.note}` : ''}`,
      entityType: 'PORTAL_CHANGE',
      entityId: id,
    });
    return this.changeDto(await this.prisma.supplierChangeRequest.findUniqueOrThrow({ where: { id }, include: changeInclude }), false);
  }
}

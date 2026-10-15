import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SUBMISSION_STATUS_LABELS,
  canPurchase,
  canViewPurchaseOrders,
  type Paginated,
  type DeliveryState,
  type ProcurementStatusDto,
  type ProcurementStatusRowDto,
  type PurchaseOrderDto,
  type PurchaseOrderSortField,
  type ReceivableOrderDto,
  type SortOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService } from '../common/attachments.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { ClosePurchaseOrderDto, CreatePurchaseOrderDto, ListPurchaseOrdersQuery, PoLineInput, ProcurementStatusQuery, ReceivableOrdersQuery, UpdatePurchaseOrderDto } from './purchasing.dto';
import { todayIn } from '../notifications/time';
import { MSME_MAX_PAYMENT_DAYS, ZERO, lineAmounts, orderedOn, parseFreight, parseGstRate, parseQty, parseRate, sum, totals } from './purchase-math';

type Tx = Prisma.TransactionClient;

const include = {
  project: { select: { name: true } },
  vendor: { select: { name: true, gstin: true, msmeCategory: true } },
  materialRequest: { select: { requestNo: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: true,
  lines: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: { stockTxns: { select: { quantity: true } }, billLines: { where: { bill: { status: { not: 'REJECTED' as const } } }, select: { quantity: true } } },
  },
} satisfies Prisma.PurchaseOrderInclude;
type Row = Prisma.PurchaseOrderGetPayload<{ include: typeof include }>;

const ORDER: Record<PurchaseOrderSortField, (o: SortOrder) => Prisma.PurchaseOrderOrderByWithRelationInput[]> = {
  poDate: (o) => [{ poDate: o }, { poNo: o }],
  poNo: (o) => [{ poNo: o }],
  total: (o) => [{ total: o }],
  status: (o) => [{ status: o }, { poDate: 'desc' }],
  project: (o) => [{ project: { name: o } }, { poDate: 'desc' }],
  vendor: (o) => [{ vendor: { name: o } }, { poDate: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['poDate', 'poNo', 'total', 'createdAt']);

interface LineData {
  materialRequestItemId: string | null;
  itemName: string;
  specification: string | null;
  unit: string;
  quantity: Prisma.Decimal;
  rate: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  amount: Prisma.Decimal;
  gstAmount: Prisma.Decimal;
  sortOrder: number;
}

/**
 * Purchase orders: raised on a vendor (usually from an approved material request and the quotation chosen on its
 * comparative statement), numbered PO-<year>-0001 and approved through the shared submission lifecycle. Approved
 * orders are received at site with GRNs against their lines and billed with vendor bills; one can be closed short
 * when the balance is no longer needed. Approval writes each line's rate to the item master.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {
    lifecycle.onApproved('PURCHASE_ORDER', (user, id) => this.updateItemRates(user, id));
  }

  toDto(r: Row): PurchaseOrderDto {
    const lines = r.lines.map((l) => ({
      id: l.id,
      materialRequestItemId: l.materialRequestItemId,
      itemName: l.itemName,
      specification: l.specification,
      unit: l.unit,
      quantity: dec(l.quantity)!,
      rate: money(l.rate)!,
      gstRate: l.gstRate.toString(),
      amount: money(l.amount)!,
      gstAmount: money(l.gstAmount)!,
      receivedQty: dec(sum(l.stockTxns, (t) => t.quantity))!,
      billedQty: dec(sum(l.billLines, (b) => b.quantity))!,
    }));
    // By value, since lines are in different units
    const ordered = sum(r.lines, (l) => l.amount);
    const received = sum(r.lines, (l) => Prisma.Decimal.min(l.quantity, sum(l.stockTxns, (t) => t.quantity)).mul(l.rate));
    const pending = r.lines.some((l) => sum(l.stockTxns, (t) => t.quantity).lt(l.quantity));
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      poNo: r.poNo,
      poDate: dateOnly(r.poDate)!,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      vendorGstin: r.vendor.gstin,
      vendorMsme: r.vendor.msmeCategory,
      materialRequestId: r.materialRequestId,
      requestNo: r.materialRequest?.requestNo ?? null,
      quotationId: r.quotationId,
      deliveryBy: dateOnly(r.deliveryBy),
      deliveryAddress: r.deliveryAddress,
      paymentTerms: r.paymentTerms,
      paymentDays: r.paymentDays,
      freight: money(r.freight)!,
      subtotal: money(r.subtotal)!,
      gstAmount: money(r.gstAmount)!,
      total: money(r.total)!,
      remarks: r.remarks,
      closedAt: iso(r.closedAt),
      closeNote: r.closeNote,
      open: r.status === 'APPROVED' && !r.closedAt && pending,
      receivedPct: ordered.isZero() ? 0 : Math.min(100, Math.round(received.div(ordered).mul(100).toNumber())),
      lines,
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
    if (!canViewPurchaseOrders(user.roleKey)) throw new ForbiddenException('Your role cannot see purchase orders');
  }

  private async assertCanPurchase(user: RequestUser, projectId: string) {
    if (!canPurchase(user.roleKey)) throw new ForbiddenException('Only procurement, project managers and management raise purchase orders');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private where(user: RequestUser, q: ListPurchaseOrdersQuery): Prisma.PurchaseOrderWhereInput {
    const where: Prisma.PurchaseOrderWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.materialRequestId) where.materialRequestId = q.materialRequestId;
    if (q.status) where.status = q.status;
    if (q.open) Object.assign(where, { status: 'APPROVED', closedAt: null });
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ poNo: ilike(w) }, { vendor: { name: ilike(w) } }, { project: { name: ilike(w) } }, { materialRequest: { requestNo: ilike(w) } }, { lines: { some: { itemName: ilike(w) } } }],
      }));
    return where;
  }

  async list(user: RequestUser, q: ListPurchaseOrdersQuery): Promise<Paginated<PurchaseOrderDto>> {
    this.assertCanView(user);
    const where = this.where(user, q);
    const sortBy = q.sortBy ?? 'poDate';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<PurchaseOrderDto> {
    this.assertCanView(user);
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id, ...this.access.submissionWhere(user) },
      include: {
        ...include,
        stockEntries: { orderBy: { date: 'asc' }, select: { id: true, entryNo: true, date: true, _count: { select: { lines: true } } } },
        vendorBills: { orderBy: { invoiceDate: 'asc' }, select: { id: true, billNo: true, invoiceNo: true, invoiceDate: true, total: true, status: true, matched: true } },
      },
    });
    if (!row) throw new NotFoundException('Purchase order not found');
    return {
      ...this.toDto(row),
      grns: row.stockEntries.map((e) => ({ id: e.id, entryNo: e.entryNo, date: dateOnly(e.date)!, lines: e._count.lines })),
      bills: row.vendorBills.map((b) => ({ id: b.id, billNo: b.billNo, invoiceNo: b.invoiceNo, invoiceDate: dateOnly(b.invoiceDate)!, total: money(b.total)!, status: b.status, matched: b.matched })),
    };
  }

  /** Approved, open orders with something still to receive, for the GRN form. */
  async receivable(user: RequestUser, q: ReceivableOrdersQuery): Promise<ReceivableOrderDto[]> {
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { ...this.access.submissionWhere(user), status: 'APPROVED', closedAt: null, ...(q.projectId ? { projectId: q.projectId } : {}) },
      include: { project: { select: { name: true } }, vendor: { select: { name: true } }, lines: { orderBy: { sortOrder: 'asc' }, include: { stockTxns: { select: { quantity: true } } } } },
      orderBy: [{ deliveryBy: { sort: 'asc', nulls: 'last' } }, { poNo: 'asc' }],
      take: 200,
    });
    return rows
      .map((r) => ({
        id: r.id,
        poNo: r.poNo,
        projectId: r.projectId,
        projectName: r.project.name,
        vendorId: r.vendorId,
        vendorName: r.vendor.name,
        deliveryBy: dateOnly(r.deliveryBy),
        lines: r.lines.map((l) => {
          const received = sum(l.stockTxns, (t) => t.quantity);
          const pending = l.quantity.sub(received);
          return {
            purchaseOrderLineId: l.id,
            itemName: l.itemName,
            specification: l.specification,
            unit: l.unit,
            ordered: dec(l.quantity)!,
            received: dec(received)!,
            pending: dec(pending.gt(0) ? pending : ZERO)!,
          };
        }),
      }))
      .filter((r) => r.lines.some((l) => Number(l.pending) > 0));
  }

  /**
   * Procurement status (v4 item 48): approved orders with what has been received and what is still to come, late ones
   * (past the delivery date) first, with totals and a line per vendor. Received quantity is net of returns to vendor.
   */
  async status(user: RequestUser, q: ProcurementStatusQuery): Promise<ProcurementStatusDto> {
    if (!canViewPurchaseOrders(user.roleKey)) throw new ForbiddenException('Your role cannot see purchase orders');
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const today = todayIn();
    const where: Prisma.PurchaseOrderWhereInput = { ...this.access.submissionWhere(user), status: 'APPROVED' };
    if (q.projectId) where.projectId = q.projectId;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.from || q.to) where.poDate = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const rows = await this.prisma.purchaseOrder.findMany({
      where,
      include: {
        project: { select: { name: true } },
        vendor: { select: { name: true } },
        lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { stockTxns: { select: { quantity: true, date: true, type: true, entry: { select: { id: true, qcStatus: true } } } } } },
      },
      orderBy: [{ poDate: 'desc' }, { poNo: 'desc' }],
      take: 1000,
    });
    const all: ProcurementStatusRowDto[] = rows.map((r) => {
      let orderValue = ZERO;
      let receivedValue = ZERO;
      let lastReceipt: Date | null = null;
      const awaiting = new Set<string>();
      const lines = r.lines.map((l) => {
        const received = Prisma.Decimal.max(sum(l.stockTxns, (t) => t.quantity), ZERO);
        const got = Prisma.Decimal.min(received, l.quantity);
        const pending = l.quantity.sub(got);
        orderValue = orderValue.add(l.amount);
        receivedValue = receivedValue.add(got.mul(l.rate));
        for (const t of l.stockTxns) {
          if (t.type !== 'RECEIPT') continue;
          if (!lastReceipt || t.date > lastReceipt) lastReceipt = t.date;
          if (!t.entry.qcStatus) awaiting.add(t.entry.id);
        }
        return { purchaseOrderLineId: l.id, itemName: l.itemName, unit: l.unit, ordered: dec(l.quantity)!, received: dec(received)!, pending: dec(pending)!, pendingValue: money(pending.mul(l.rate))! };
      });
      const pendingValue = r.closedAt ? ZERO : Prisma.Decimal.max(orderValue.sub(receivedValue), ZERO);
      const anyPending = r.lines.some((l) => sum(l.stockTxns, (t) => t.quantity).lt(l.quantity));
      const anyReceived = receivedValue.gt(0);
      const state: DeliveryState = !anyPending ? 'RECEIVED' : r.closedAt ? 'CLOSED' : anyReceived ? 'PARTLY_RECEIVED' : 'NOT_STARTED';
      const deliveryBy = dateOnly(r.deliveryBy);
      const open = state === 'NOT_STARTED' || state === 'PARTLY_RECEIVED';
      const daysLate = open && deliveryBy && deliveryBy < today ? Math.round((parseDate(today).getTime() - parseDate(deliveryBy).getTime()) / 86_400_000) : 0;
      return {
        purchaseOrderId: r.id,
        poNo: r.poNo,
        poDate: dateOnly(r.poDate)!,
        projectId: r.projectId,
        projectName: r.project.name,
        vendorId: r.vendorId,
        vendorName: r.vendor.name,
        deliveryBy,
        state,
        daysLate,
        orderValue: money(orderValue)!,
        receivedValue: money(receivedValue)!,
        pendingValue: money(open ? pendingValue : ZERO)!,
        receivedPct: orderValue.isZero() ? 0 : Math.min(100, Math.round(receivedValue.div(orderValue).mul(100).toNumber())),
        lastReceiptOn: dateOnly(lastReceipt),
        awaitingQc: awaiting.size,
        lines,
      };
    });
    const open = (x: ProcurementStatusRowDto) => x.state === 'NOT_STARTED' || x.state === 'PARTLY_RECEIVED';
    const show = q.show ?? 'PENDING';
    const picked = all
      .filter((x) => show === 'ALL' || (show === 'PENDING' ? open(x) : x.daysLate > 0))
      .sort((a, b) => b.daysLate - a.daysLate || (a.deliveryBy ?? '9999').localeCompare(b.deliveryBy ?? '9999') || b.poDate.localeCompare(a.poDate));
    const vendors = new Map<string, ProcurementStatusDto['byVendor'][number]>();
    for (const x of all) {
      const v = vendors.get(x.vendorId) ?? { vendorId: x.vendorId, vendorName: x.vendorName, orders: 0, pending: 0, late: 0, pendingValue: '0.00' };
      v.orders += 1;
      if (open(x)) v.pending += 1;
      if (x.daysLate > 0) v.late += 1;
      v.pendingValue = new Prisma.Decimal(v.pendingValue).add(x.pendingValue).toFixed(2);
      vendors.set(x.vendorId, v);
    }
    return {
      rows: picked,
      totals: {
        orders: all.length,
        pending: all.filter(open).length,
        late: all.filter((x) => x.daysLate > 0).length,
        orderValue: sum(all, (x) => new Prisma.Decimal(x.orderValue)).toFixed(2),
        pendingValue: sum(all, (x) => new Prisma.Decimal(x.pendingValue)).toFixed(2),
      },
      byVendor: [...vendors.values()].filter((v) => v.pending > 0).sort((a, b) => b.late - a.late || Number(b.pendingValue) - Number(a.pendingValue)),
    };
  }

  /** The vendor, request and quotation a PO points at, checked against each other. */
  private async refs(user: RequestUser, projectId: string, vendorId: string, materialRequestId: string | null, quotationId: string | null) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, organizationId: user.organizationId }, select: { id: true, name: true, isActive: true, msmeCategory: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!vendor.isActive) throw new BadRequestException(`${vendor.name} is inactive in the vendor master`);
    let mr: Prisma.MaterialRequestGetPayload<{ include: { items: true } }> | null = null;
    if (materialRequestId) {
      mr = await this.prisma.materialRequest.findFirst({ where: { id: materialRequestId, organizationId: user.organizationId }, include: { items: true } });
      if (!mr || mr.projectId !== projectId) throw new BadRequestException('The material request is not part of this project');
      if (mr.status !== 'APPROVED') throw new ConflictException(`Orders are raised on approved requests. ${mr.requestNo} is ${SUBMISSION_STATUS_LABELS[mr.status].toLowerCase()}.`);
    }
    if (quotationId) {
      const q = await this.prisma.quotation.findFirst({ where: { id: quotationId, organizationId: user.organizationId }, select: { vendorId: true, materialRequestId: true } });
      if (!q) throw new NotFoundException('Quotation not found');
      if (q.vendorId !== vendor.id || q.materialRequestId !== materialRequestId) throw new BadRequestException('The quotation is from another vendor or request');
    }
    return { vendor, mr };
  }

  /** Payment days: at most 45 for micro and small enterprises (MSMED Act). */
  private paymentDays(days: number | null | undefined, vendor: { name: string; msmeCategory: string | null }) {
    if (days != null && days > MSME_MAX_PAYMENT_DAYS && (vendor.msmeCategory === 'MICRO' || vendor.msmeCategory === 'SMALL'))
      throw new BadRequestException(`${vendor.name} is a ${vendor.msmeCategory.toLowerCase()} enterprise: payment is due within ${MSME_MAX_PAYMENT_DAYS} days of the invoice`);
    return days ?? null;
  }

  /**
   * Priced lines. A line raised from a request line takes its name, unit and specification and may order at most what
   * the request still needs: requested, less what other orders hold (see `orderedOn`) and what was received without one.
   */
  private async lines(tx: Tx | PrismaService, mr: Prisma.MaterialRequestGetPayload<{ include: { items: true } }> | null, input: PoLineInput[], excludePoId?: string): Promise<LineData[]> {
    const linked = input.map((l) => l.materialRequestItemId).filter((x): x is string => !!x);
    if (linked.length && !mr) throw new BadRequestException('Lines from a material request need the request on the order');
    if (new Set(linked).size !== linked.length) throw new BadRequestException('A request line is ordered twice');
    const held = linked.length
      ? await tx.purchaseOrderLine.findMany({
          where: { materialRequestItemId: { in: linked }, purchaseOrder: { status: { not: 'REJECTED' }, ...(excludePoId ? { id: { not: excludePoId } } : {}) } },
          select: { materialRequestItemId: true, quantity: true, purchaseOrder: { select: { closedAt: true } }, stockTxns: { select: { quantity: true } } },
        })
      : [];
    // Received against the request directly, without an order, also covers its need.
    const direct = linked.length
      ? await tx.stockTxn.groupBy({ by: ['materialRequestItemId'], where: { materialRequestItemId: { in: linked }, purchaseOrderLineId: null }, _sum: { quantity: true } })
      : [];
    return input.map((l, i) => {
      const item = l.materialRequestItemId ? mr!.items.find((x) => x.id === l.materialRequestItemId) : null;
      if (l.materialRequestItemId && !item) throw new BadRequestException(`A line is not part of ${mr!.requestNo}`);
      const itemName = item?.itemName ?? l.itemName?.trim();
      const unit = item?.unit ?? l.unit?.trim();
      if (!itemName || !unit) throw new BadRequestException(`Line ${i + 1}: give the item name and unit`);
      const quantity = parseQty(l.quantity, itemName);
      if (item) {
        const free = item.quantity
          .sub(sum(held.filter((h) => h.materialRequestItemId === item.id), orderedOn))
          .sub(direct.find((d) => d.materialRequestItemId === item.id)?._sum.quantity ?? ZERO);
        if (quantity.gt(free))
          throw new ConflictException(
            free.lte(0)
              ? `${itemName} on ${mr!.requestNo} is already fully ordered.`
              : `Only ${dec(free)} ${unit} of ${itemName} on ${mr!.requestNo} is still to be ordered.`,
          );
      }
      const rate = parseRate(l.rate, itemName);
      const gstRate = parseGstRate(l.gstRate, itemName);
      return { materialRequestItemId: item?.id ?? null, itemName, specification: item?.specification ?? (l.specification || null), unit, quantity, rate, gstRate, ...lineAmounts(quantity, rate, gstRate), sortOrder: i };
    });
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreatePurchaseOrderDto): Promise<PurchaseOrderDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.assertCanPurchase(user, dto.projectId);
    const { vendor, mr } = await this.refs(user, dto.projectId, dto.vendorId, dto.materialRequestId ?? null, dto.quotationId ?? null);
    const paymentDays = this.paymentDays(dto.paymentDays, vendor);
    const freight = parseFreight(dto.freight);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const poNo = await nextDocNo(tx, user.organizationId, 'PO', async (prefix) =>
          (await tx.purchaseOrder.findFirst({ where: { organizationId: user.organizationId, poNo: { startsWith: prefix } }, orderBy: { poNo: 'desc' }, select: { poNo: true } }))?.poNo ?? null,
        );
        if (dto.id && (await tx.purchaseOrder.count({ where: { id: dto.id } }))) return null;
        // Under the PO number lock, so two orders on the same request line cannot both take its balance.
        const lines = await this.lines(tx, mr, dto.lines);
        const row = await tx.purchaseOrder.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            vendorId: vendor.id,
            poNo,
            poDate: dto.poDate ? parseDate(dto.poDate) : parseDate(new Date().toISOString().slice(0, 10)),
            materialRequestId: mr?.id ?? null,
            quotationId: dto.quotationId ?? null,
            deliveryBy: dto.deliveryBy ? parseDate(dto.deliveryBy) : null,
            deliveryAddress: dto.deliveryAddress || null,
            paymentTerms: dto.paymentTerms || null,
            paymentDays,
            freight,
            ...totals(lines, freight),
            remarks: dto.remarks || null,
            submittedById: user.id,
            status: 'DRAFT',
            lines: { create: lines },
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
    await this.attachments.link(user, 'purchaseOrderId', id, dto.attachmentIds);
    await this.audit.log(user, 'PURCHASE_ORDER', id, 'CREATED');
    if (dto.submit) await this.lifecycle.submit(user, 'PURCHASE_ORDER', id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdatePurchaseOrderDto): Promise<PurchaseOrderDto> {
    const row = await this.lifecycle.load(user, 'PURCHASE_ORDER', id);
    await this.assertCanPurchase(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    const current = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
    const vendorId = dto.vendorId ?? current.vendorId;
    const { vendor, mr } = await this.refs(user, current.projectId, vendorId, current.materialRequestId, vendorId === current.vendorId ? current.quotationId : null);
    const data: Prisma.PurchaseOrderUncheckedUpdateInput = {};
    if (vendorId !== current.vendorId) Object.assign(data, { vendorId, quotationId: null });
    if (dto.poDate !== undefined) data.poDate = parseDate(dto.poDate);
    if (dto.deliveryBy !== undefined) data.deliveryBy = dto.deliveryBy ? parseDate(dto.deliveryBy) : null;
    if (dto.deliveryAddress !== undefined) data.deliveryAddress = dto.deliveryAddress || null;
    if (dto.paymentTerms !== undefined) data.paymentTerms = dto.paymentTerms || null;
    data.paymentDays = this.paymentDays(dto.paymentDays !== undefined ? dto.paymentDays : current.paymentDays, vendor);
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    const freight = dto.freight !== undefined ? parseFreight(dto.freight) : current.freight;
    data.freight = freight;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PO:${user.organizationId}`}))`;
      if (dto.lines) {
        const lines = await this.lines(tx, mr, dto.lines, id);
        Object.assign(data, totals(lines, freight));
        data.lines = { deleteMany: {}, create: lines };
      } else Object.assign(data, totals(current.lines, freight));
      await tx.purchaseOrder.update({ where: { id }, data });
    });
    await this.attachments.sync(user, 'purchaseOrderId', id, dto.attachmentIds);
    await this.audit.log(user, 'PURCHASE_ORDER', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'PURCHASE_ORDER', id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string) {
    await this.lifecycle.submit(user, 'PURCHASE_ORDER', id);
    return this.get(user, id);
  }

  /** Close an approved order short: nothing more is received against it (what was received can still be billed), and its balance is free to order again. */
  async close(user: RequestUser, id: string, dto: ClosePurchaseOrderDto) {
    const row = await this.lifecycle.load(user, 'PURCHASE_ORDER', id);
    await this.assertCanPurchase(user, row.projectId);
    const po = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { poNo: true, status: true, closedAt: true } });
    if (po.status !== 'APPROVED') throw new BadRequestException('Only approved orders can be closed; delete or reject a draft instead');
    if (po.closedAt) throw new BadRequestException(`${po.poNo} is already closed`);
    await this.prisma.purchaseOrder.update({ where: { id }, data: { closedAt: new Date(), closeNote: dto.note } });
    await this.audit.log(user, 'PURCHASE_ORDER', id, 'CLOSED', dto.note);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'PURCHASE_ORDER', id);
    await this.assertCanPurchase(user, row.projectId);
    if (row.status === 'APPROVED') throw new BadRequestException('An approved order cannot be deleted; close it instead');
    await this.lifecycle.assertEditable(user, row);
    if (await this.prisma.stockEntry.count({ where: { purchaseOrderId: id } })) throw new ConflictException('Material has been received against this order; it cannot be deleted');
    if (await this.prisma.vendorBill.count({ where: { purchaseOrderId: id } })) throw new ConflictException('Vendor bills are recorded against this order; it cannot be deleted');
    await this.prisma.purchaseOrder.delete({ where: { id } });
    await this.audit.log(user, 'PURCHASE_ORDER', id, 'DELETED');
    return { ok: true };
  }

  /** On approval: each line's rate becomes the item's standard rate (adding the item to the master if new). */
  private async updateItemRates(user: RequestUser, id: string) {
    const lines = await this.prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: id }, select: { itemName: true, unit: true, rate: true } });
    for (const l of lines) {
      const found = await this.prisma.item.findFirst({
        where: { organizationId: user.organizationId, name: { equals: l.itemName, mode: 'insensitive' }, unit: { equals: l.unit, mode: 'insensitive' } },
        select: { id: true },
      });
      if (found) await this.prisma.item.update({ where: { id: found.id }, data: { rate: l.rate } });
      else await this.prisma.item.create({ data: { organizationId: user.organizationId, name: l.itemName, unit: l.unit, rate: l.rate } });
    }
  }
}

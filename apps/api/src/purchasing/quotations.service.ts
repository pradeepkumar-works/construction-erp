import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SUBMISSION_STATUS_LABELS, VENDOR_RECORD_DAYS, canPurchase, canViewPurchaseOrders, type ComparativeStatementDto, type QuotationDto, type VendorRecordDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { CreateQuotationDto, QuotationLineInput, UpdateQuotationDto } from './purchasing.dto';
import { D, lineAmounts, orderedOn, parseFreight, parseGstRate, parseRate, sum, totals } from './purchase-math';

const include = {
  materialRequest: { select: { requestNo: true, items: { select: { id: true, itemName: true, unit: true, quantity: true, sortOrder: true } } } },
  vendor: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  lines: true,
} satisfies Prisma.QuotationInclude;
type Row = Prisma.QuotationGetPayload<{ include: typeof include }>;

/**
 * Vendor quotations against an approved material request (one per vendor), and the comparative statement that puts
 * them side by side so the purchaser can raise a PO on the best one.
 */
@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private undo: UndoService,
  ) {
    undo.register('QUOTATION', {
      entityType: 'QUOTATION',
      check: async (user, row) => {
        this.assertCanPurchase(user);
        await this.request(user, row.materialRequestId as string);
      },
    });
  }

  toDto(r: Row): QuotationDto {
    const items = [...r.materialRequest.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const priced = items.flatMap((i) => {
      const l = r.lines.find((x) => x.materialRequestItemId === i.id);
      return l ? [{ item: i, line: l, ...lineAmounts(i.quantity, l.rate, l.gstRate) }] : [];
    });
    const t = totals(priced, r.freight);
    return {
      id: r.id,
      materialRequestId: r.materialRequestId,
      requestNo: r.materialRequest.requestNo,
      projectId: r.projectId,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      quoteRef: r.quoteRef,
      quoteDate: dateOnly(r.quoteDate),
      validUntil: dateOnly(r.validUntil),
      deliveryDays: r.deliveryDays,
      paymentTerms: r.paymentTerms,
      freight: money(r.freight),
      remarks: r.remarks,
      lines: priced.map((p) => ({
        materialRequestItemId: p.item.id,
        itemName: p.item.itemName,
        unit: p.item.unit,
        quantity: dec(p.item.quantity),
        rate: money(p.line.rate),
        gstRate: p.line.gstRate.toString(),
        amount: money(p.amount),
        remarks: p.line.remarks,
      })),
      subtotal: money(t.subtotal),
      gstAmount: money(t.gstAmount),
      total: money(t.total),
      missingLines: items.length - priced.length,
      fromSupplier: r.fromSupplier,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
    };
  }

  private assertCanView(user: RequestUser) {
    if (!canViewPurchaseOrders(user.roleKey)) throw new ForbiddenException('Your role cannot see quotations');
  }

  private assertCanPurchase(user: RequestUser) {
    if (!canPurchase(user.roleKey)) throw new ForbiddenException('Only procurement, project managers and management enter quotations');
  }

  /** The request quotations are entered against: approved and visible to the user. */
  private async request(user: RequestUser, id: string) {
    const mr = await this.prisma.materialRequest.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: { items: true } });
    if (!mr) throw new NotFoundException('Material request not found');
    if (mr.status !== 'APPROVED') throw new ConflictException(`Quotations are taken for approved requests. ${mr.requestNo} is ${SUBMISSION_STATUS_LABELS[mr.status].toLowerCase()}.`);
    return mr;
  }

  private lines(mr: { requestNo: string; items: { id: string; itemName: string }[] }, input: QuotationLineInput[]) {
    const seen = new Set<string>();
    return input.map((l) => {
      const item = mr.items.find((i) => i.id === l.materialRequestItemId);
      if (!item) throw new BadRequestException(`A line is not part of ${mr.requestNo}`);
      if (seen.has(item.id)) throw new BadRequestException(`${item.itemName} is quoted twice`);
      seen.add(item.id);
      return { materialRequestItemId: item.id, rate: parseRate(l.rate, item.itemName), gstRate: parseGstRate(l.gstRate, item.itemName), remarks: l.remarks || null };
    });
  }

  async list(user: RequestUser, materialRequestId: string): Promise<QuotationDto[]> {
    this.assertCanView(user);
    const rows = await this.prisma.quotation.findMany({ where: { materialRequestId, ...this.access.submissionWhere(user) }, include, orderBy: [{ quoteDate: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((r) => this.toDto(r));
  }

  async get(user: RequestUser, id: string): Promise<QuotationDto> {
    this.assertCanView(user);
    const row = await this.prisma.quotation.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Quotation not found');
    return this.toDto(row);
  }

  async create(user: RequestUser, dto: CreateQuotationDto): Promise<QuotationDto> {
    this.assertCanPurchase(user);
    const mr = await this.request(user, dto.materialRequestId);
    const vendor = await this.prisma.vendor.findFirst({ where: { id: dto.vendorId, organizationId: user.organizationId }, select: { id: true, name: true, isActive: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!vendor.isActive) throw new BadRequestException(`${vendor.name} is inactive in the vendor master`);
    const lines = this.lines(mr, dto.lines);
    let id: string;
    try {
      const row = await this.prisma.quotation.create({
        data: {
          organizationId: user.organizationId,
          projectId: mr.projectId,
          materialRequestId: mr.id,
          vendorId: vendor.id,
          quoteRef: dto.quoteRef || null,
          quoteDate: parseDate(dto.quoteDate),
          validUntil: dto.validUntil ? parseDate(dto.validUntil) : null,
          deliveryDays: dto.deliveryDays ?? null,
          paymentTerms: dto.paymentTerms || null,
          freight: parseFreight(dto.freight),
          remarks: dto.remarks || null,
          createdById: user.id,
          lines: { create: lines },
        },
        select: { id: true },
      });
      id = row.id;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${vendor.name} already has a quotation on ${mr.requestNo}; edit that one`);
      throw e;
    }
    await this.audit.log(user, 'QUOTATION', id, 'CREATED', `${vendor.name} on ${mr.requestNo}`);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateQuotationDto): Promise<QuotationDto> {
    this.assertCanPurchase(user);
    const q = await this.prisma.quotation.findFirst({ where: { id, ...this.access.submissionWhere(user) }, select: { id: true, materialRequestId: true } });
    if (!q) throw new NotFoundException('Quotation not found');
    const mr = await this.request(user, q.materialRequestId);
    const data: Prisma.QuotationUpdateInput = {};
    if (dto.quoteRef !== undefined) data.quoteRef = dto.quoteRef || null;
    if (dto.quoteDate !== undefined) data.quoteDate = parseDate(dto.quoteDate);
    if (dto.validUntil !== undefined) data.validUntil = dto.validUntil ? parseDate(dto.validUntil) : null;
    if (dto.deliveryDays !== undefined) data.deliveryDays = dto.deliveryDays;
    if (dto.paymentTerms !== undefined) data.paymentTerms = dto.paymentTerms || null;
    if (dto.freight !== undefined) data.freight = parseFreight(dto.freight);
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    if (dto.lines) data.lines = { deleteMany: {}, create: this.lines(mr, dto.lines) };
    await this.prisma.quotation.update({ where: { id }, data });
    await this.audit.log(user, 'QUOTATION', id, 'UPDATED');
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    this.assertCanPurchase(user);
    const q = await this.prisma.quotation.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: { purchaseOrders: { where: { status: { not: 'REJECTED' } }, select: { poNo: true } } } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.purchaseOrders.length) throw new ConflictException(`${q.purchaseOrders[0].poNo} was raised on this quotation; it cannot be deleted`);
    const lines = await this.prisma.quotationLine.findMany({ where: { quotationId: id } });
    // A rejected order raised on it keeps its rows but loses the link on delete (SetNull); Undo puts it back.
    const orders = await this.prisma.purchaseOrder.findMany({ where: { quotationId: id }, select: { id: true } });
    await this.prisma.quotation.delete({ where: { id } });
    await this.audit.log(user, 'QUOTATION', id, 'DELETED');
    const rows = [{ model: 'quotation', data: q as Record<string, unknown> }, ...lines.map((l) => ({ model: 'quotationLine', data: l }))];
    return { ok: true, undo: this.undo.offer(user, 'QUOTATION', { rows, relink: [{ model: 'purchaseOrder', field: 'quotationId', ids: orders.map((o) => o.id) }] }) };
  }

  /**
   * Comparative statement: every line of the request with each vendor's rate. The lowest per line is by landed rate
   * (rate plus GST); the lowest overall only counts quotations that price every line, freight included.
   */
  async comparative(user: RequestUser, materialRequestId: string): Promise<ComparativeStatementDto> {
    this.assertCanView(user);
    const mr = await this.prisma.materialRequest.findFirst({
      where: { id: materialRequestId, ...this.access.submissionWhere(user) },
      include: {
        project: { select: { name: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { poLines: { where: { purchaseOrder: { status: { not: 'REJECTED' } } }, select: { quantity: true, purchaseOrder: { select: { closedAt: true } }, stockTxns: { select: { quantity: true } } } } },
        },
      },
    });
    if (!mr) throw new NotFoundException('Material request not found');
    const quotations = (await this.prisma.quotation.findMany({ where: { materialRequestId }, include, orderBy: [{ quoteDate: 'asc' }, { createdAt: 'asc' }] })).map((r) => this.toDto(r));
    const lines = mr.items.map((i) => {
      const rates: ComparativeStatementDto['lines'][number]['rates'] = {};
      let best: { id: string; landed: Prisma.Decimal } | null = null;
      for (const q of quotations) {
        const l = q.lines.find((x) => x.materialRequestItemId === i.id);
        rates[q.id] = l ? { rate: l.rate, gstRate: l.gstRate, amount: l.amount } : null;
        if (!l) continue;
        const landed = D(l.rate).mul(D(100).add(l.gstRate));
        if (!best || landed.lt(best.landed)) best = { id: q.id, landed };
      }
      return {
        materialRequestItemId: i.id,
        itemName: i.itemName,
        specification: i.specification,
        unit: i.unit,
        quantity: dec(i.quantity),
        orderedQty: dec(sum(i.poLines, orderedOn)),
        rates,
        lowestQuotationId: best?.id ?? null,
      };
    });
    const vendorRecords = await this.vendorRecords(user.organizationId, [...new Set(quotations.map((q) => q.vendorId))]);
    return { materialRequestId: mr.id, requestNo: mr.requestNo, projectId: mr.projectId, projectName: mr.project.name, quotations, lines, lowestQuotationId: lowestOf(quotations)?.id ?? null, vendorRecords };
  }

  /**
   * Each vendor's deliveries on the company's orders over the last `VENDOR_RECORD_DAYS` (intelligence quick win Q5): receipts
   * against its purchase orders, those after the order's delivery date, and the quantity rejected at the gate. Company-wide,
   * as the buyer weighs the vendor and not one site's dealings with it.
   */
  private async vendorRecords(organizationId: string, vendorIds: string[]): Promise<VendorRecordDto[]> {
    if (!vendorIds.length) return [];
    const since = parseDate(dateOnly(new Date(Date.now() - VENDOR_RECORD_DAYS * 86_400_000)));
    const [receipts, orders] = await Promise.all([
      this.prisma.stockEntry.findMany({
        where: { organizationId, type: 'RECEIPT', vendorId: { in: vendorIds }, purchaseOrderId: { not: null }, date: { gte: since } },
        select: { vendorId: true, date: true, purchaseOrder: { select: { deliveryBy: true } }, lines: { select: { quantity: true, rejectedQty: true } } },
      }),
      this.prisma.purchaseOrder.groupBy({ by: ['vendorId'], where: { organizationId, vendorId: { in: vendorIds }, status: 'APPROVED', poDate: { gte: since } }, _count: { _all: true } }),
    ]);
    const ordersOf = new Map(orders.map((o) => [o.vendorId, o._count._all]));
    return vendorIds.map((vendorId) => {
      const mine = receipts.filter((r) => r.vendorId === vendorId);
      const received = mine.reduce((s, r) => s + r.lines.reduce((t, l) => t + Number(l.quantity), 0), 0);
      const rejected = mine.reduce((s, r) => s + r.lines.reduce((t, l) => t + Number(l.rejectedQty ?? 0), 0), 0);
      return {
        vendorId,
        deliveries: mine.length,
        late: mine.filter((r) => r.purchaseOrder?.deliveryBy && r.date > r.purchaseOrder.deliveryBy).length,
        rejectShare: received > 0 ? Math.round((rejected / received) * 1000) / 1000 : null,
        orders: ordersOf.get(vendorId) ?? 0,
      };
    });
  }

  /** The lowest quotation on a request that prices every line (as the comparative statement marks it), for an order's reason check. */
  async lowestFor(organizationId: string, materialRequestId: string): Promise<QuotationDto | null> {
    const rows = await this.prisma.quotation.findMany({ where: { organizationId, materialRequestId }, include, orderBy: [{ quoteDate: 'asc' }, { createdAt: 'asc' }] });
    return lowestOf(rows.map((r) => this.toDto(r)));
  }
}

/** The cheapest quotation that prices every line, by total with GST and freight; the earlier one on a tie. */
function lowestOf(quotations: QuotationDto[]): QuotationDto | null {
  return quotations.filter((q) => q.missingLines === 0).reduce<QuotationDto | null>((b, q) => (!b || D(q.total).lt(b.total) ? q : b), null);
}

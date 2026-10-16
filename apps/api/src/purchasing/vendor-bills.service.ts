import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SUBMISSION_STATUS_LABELS,
  canRecordVendorBill,
  canViewVendorBills,
  type Paginated,
  type SortOrder,
  type VendorBillDto,
  type VendorBillSortField,
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
import { dateRange, ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreateVendorBillDto, ListVendorBillsQuery, UpdateVendorBillDto, VendorBillLineInput } from './purchasing.dto';
import { DEFAULT_PAYMENT_DAYS, MSME_MAX_PAYMENT_DAYS, ZERO, lineAmounts, parseFreight, parseGstRate, parseQty, parseRate, sum, totals } from './purchase-math';

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;

const include = {
  project: { select: { name: true } },
  vendor: { select: { name: true, gstin: true, msmeCategory: true } },
  purchaseOrder: { select: { poNo: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: true,
  lines: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: {
      purchaseOrderLine: {
        select: { itemName: true, unit: true, rate: true, gstRate: true, stockTxns: { select: { quantity: true } }, billLines: { where: { bill: { status: { not: 'REJECTED' as const } } }, select: { billId: true, quantity: true } } },
      },
    },
  },
} satisfies Prisma.VendorBillInclude;
type Row = Prisma.VendorBillGetPayload<{ include: typeof include }>;

const ORDER: Record<VendorBillSortField, (o: SortOrder) => Prisma.VendorBillOrderByWithRelationInput[]> = {
  invoiceDate: (o) => [{ invoiceDate: o }, { billNo: o }],
  billNo: (o) => [{ billNo: o }],
  dueDate: (o) => [{ dueDate: o }, { billNo: 'asc' }],
  total: (o) => [{ total: o }],
  status: (o) => [{ status: o }, { invoiceDate: 'desc' }],
  project: (o) => [{ project: { name: o } }, { invoiceDate: 'desc' }],
  vendor: (o) => [{ vendor: { name: o } }, { invoiceDate: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['invoiceDate', 'billNo', 'total', 'createdAt']);

const rupees = (d: Decimal) => `₹${d.toFixed(2)}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

interface PoForMatch {
  poNo: string;
  freight: Decimal;
  lines: { id: string; itemName: string; unit: string; rate: Decimal; gstRate: Decimal }[];
}

interface PricedLine {
  purchaseOrderLineId: string;
  quantity: Decimal;
  rate: Decimal;
  gstRate: Decimal;
  amount: Decimal;
  gstAmount: Decimal;
  sortOrder: number;
}

/**
 * Vendor bills: the supplier's invoice entered against an approved purchase order, numbered VB-<year>-0001 and approved
 * through the shared submission lifecycle. Each bill is matched three ways (order, receipt, invoice): quantity billed
 * against quantity received less what other bills already claim, rate and GST rate against the PO, freight against the
 * PO's. A mismatch is recorded as an exception for the approver, not refused, because short supply and revised rates
 * are settled on the bill. The due date is the invoice date plus the PO's payment days, 45 at most for micro and small
 * enterprises.
 */
@Injectable()
export class VendorBillsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {}

  toDto(r: Row): VendorBillDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      billNo: r.billNo,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      vendorGstin: r.vendor.gstin,
      vendorMsme: r.vendor.msmeCategory,
      purchaseOrderId: r.purchaseOrderId,
      poNo: r.purchaseOrder.poNo,
      invoiceNo: r.invoiceNo,
      invoiceDate: dateOnly(r.invoiceDate)!,
      dueDate: dateOnly(r.dueDate)!,
      freight: money(r.freight)!,
      subtotal: money(r.subtotal)!,
      gstAmount: money(r.gstAmount)!,
      total: money(r.total)!,
      matched: r.matched,
      exceptions: r.exceptions,
      paidAmount: money(r.paidAmount)!,
      outstanding: money(Prisma.Decimal.max(r.total.sub(r.paidAmount), 0))!,
      paidDate: dateOnly(r.paidDate),
      remarks: r.remarks,
      lines: r.lines.map((l) => ({
        id: l.id,
        purchaseOrderLineId: l.purchaseOrderLineId,
        itemName: l.purchaseOrderLine.itemName,
        unit: l.purchaseOrderLine.unit,
        quantity: dec(l.quantity)!,
        rate: money(l.rate)!,
        gstRate: l.gstRate.toString(),
        amount: money(l.amount)!,
        gstAmount: money(l.gstAmount)!,
        poRate: money(l.purchaseOrderLine.rate)!,
        poGstRate: l.purchaseOrderLine.gstRate.toString(),
        receivedQty: dec(sum(l.purchaseOrderLine.stockTxns, (t) => t.quantity))!,
        billedElsewhere: dec(sum(l.purchaseOrderLine.billLines.filter((b) => b.billId !== r.id), (b) => b.quantity))!,
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

  private assertCanView(user: RequestUser) {
    if (!canViewVendorBills(user.roleKey)) throw new ForbiddenException('Your role cannot see vendor bills');
  }

  private async assertCanRecord(user: RequestUser, projectId: string) {
    if (!canRecordVendorBill(user.roleKey)) throw new ForbiddenException('Only accounts, procurement and management record vendor bills');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private where(user: RequestUser, q: ListVendorBillsQuery): Prisma.VendorBillWhereInput {
    const where: Prisma.VendorBillWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.purchaseOrderId) where.purchaseOrderId = q.purchaseOrderId;
    if (q.status) where.status = q.status;
    if (q.exceptions) where.matched = false;
    if (q.mine) where.submittedById = user.id;
    const days = dateRange(q.from, q.to);
    if (days) where.invoiceDate = days;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({ OR: [{ billNo: ilike(w) }, { invoiceNo: ilike(w) }, { vendor: { name: ilike(w) } }, { project: { name: ilike(w) } }, { purchaseOrder: { poNo: ilike(w) } }] }));
    return where;
  }

  async list(user: RequestUser, q: ListVendorBillsQuery): Promise<Paginated<VendorBillDto>> {
    this.assertCanView(user);
    const where = this.where(user, q);
    const sortBy = q.sortBy ?? 'invoiceDate';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.vendorBill.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.vendorBill.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<VendorBillDto> {
    this.assertCanView(user);
    const row = await this.prisma.vendorBill.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Vendor bill not found');
    return this.toDto(row);
  }

  private async order(user: RequestUser, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { vendor: { select: { name: true, msmeCategory: true } }, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== 'APPROVED') throw new ConflictException(`Bills are recorded against approved orders. ${po.poNo} is ${SUBMISSION_STATUS_LABELS[po.status].toLowerCase()}.`);
    return po;
  }

  private checkDate(date: string) {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The invoice date cannot be in the future');
  }

  private dueDate(invoiceDate: Date, paymentDays: number | null, msme: string | null) {
    const days = paymentDays ?? DEFAULT_PAYMENT_DAYS;
    return addDays(invoiceDate, msme === 'MICRO' || msme === 'SMALL' ? Math.min(days, MSME_MAX_PAYMENT_DAYS) : days);
  }

  private priced(po: PoForMatch, input: VendorBillLineInput[]): PricedLine[] {
    const seen = new Set<string>();
    return input.map((l, i) => {
      const line = po.lines.find((x) => x.id === l.purchaseOrderLineId);
      if (!line) throw new BadRequestException(`A line is not part of ${po.poNo}`);
      if (seen.has(line.id)) throw new BadRequestException(`${line.itemName} is billed twice`);
      seen.add(line.id);
      const quantity = parseQty(l.quantity, line.itemName);
      const rate = parseRate(l.rate, line.itemName);
      const gstRate = l.gstRate === undefined ? line.gstRate : parseGstRate(l.gstRate, line.itemName);
      return { purchaseOrderLineId: line.id, quantity, rate, gstRate, ...lineAmounts(quantity, rate, gstRate), sortOrder: i };
    });
  }

  /** The three-way match: one exception per mismatch, against receipts now and other bills (not rejected) on the order. */
  private async match(db: Tx | PrismaService, po: PoForMatch & { id: string }, lines: PricedLine[], freight: Decimal, billId?: string): Promise<string[]> {
    const lineIds = lines.map((l) => l.purchaseOrderLineId);
    const others = { bill: { status: { not: 'REJECTED' as const }, ...(billId ? { id: { not: billId } } : {}) } };
    const [received, billed, otherFreight] = await Promise.all([
      db.stockTxn.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: lineIds } }, _sum: { quantity: true } }),
      db.vendorBillLine.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: lineIds }, ...others }, _sum: { quantity: true } }),
      db.vendorBill.aggregate({ where: { purchaseOrderId: po.id, status: { not: 'REJECTED' }, ...(billId ? { id: { not: billId } } : {}) }, _sum: { freight: true } }),
    ]);
    const out: string[] = [];
    for (const l of lines) {
      const line = po.lines.find((x) => x.id === l.purchaseOrderLineId)!;
      const got = received.find((r) => r.purchaseOrderLineId === line.id)?._sum.quantity ?? ZERO;
      const elsewhere = billed.find((b) => b.purchaseOrderLineId === line.id)?._sum.quantity ?? ZERO;
      const open = got.sub(elsewhere);
      if (l.quantity.gt(open))
        out.push(
          `${line.itemName}: ${dec(l.quantity)} ${line.unit} billed, ${dec(got)} received${elsewhere.gt(0) ? ` of which ${dec(elsewhere)} is on other bills` : ''}`,
        );
      if (l.rate.gt(line.rate)) out.push(`${line.itemName}: rate ${rupees(l.rate)} is above the PO rate ${rupees(line.rate)}`);
      if (!l.gstRate.eq(line.gstRate)) out.push(`${line.itemName}: GST ${l.gstRate.toString()}% where the PO has ${line.gstRate.toString()}%`);
    }
    const freightLeft = po.freight.sub(otherFreight._sum.freight ?? ZERO);
    if (freight.gt(freightLeft)) out.push(`Freight ${rupees(freight)} is above the ${rupees(freightLeft.gt(0) ? freightLeft : ZERO)} left on the PO`);
    return out;
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.vendorBill.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  private duplicate(e: unknown, invoiceNo: string, vendor: string) {
    if (isUniqueViolation(e)) return new ConflictException(`${vendor}'s invoice ${invoiceNo} is already recorded`);
    return e;
  }

  async create(user: RequestUser, dto: CreateVendorBillDto): Promise<VendorBillDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    const po = await this.order(user, dto.purchaseOrderId);
    await this.assertCanRecord(user, po.projectId);
    this.checkDate(dto.invoiceDate);
    const lines = this.priced(po, dto.lines);
    const freight = parseFreight(dto.freight);
    const invoiceDate = parseDate(dto.invoiceDate);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const billNo = await nextDocNo(tx, user.organizationId, 'VB', async (prefix) =>
          (await tx.vendorBill.findFirst({ where: { organizationId: user.organizationId, billNo: { startsWith: prefix } }, orderBy: { billNo: 'desc' }, select: { billNo: true } }))?.billNo ?? null,
        );
        if (dto.id && (await tx.vendorBill.count({ where: { id: dto.id } }))) return null;
        const exceptions = await this.match(tx, po, lines, freight);
        const row = await tx.vendorBill.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: po.projectId,
            vendorId: po.vendorId,
            purchaseOrderId: po.id,
            billNo,
            invoiceNo: dto.invoiceNo,
            invoiceDate,
            dueDate: this.dueDate(invoiceDate, po.paymentDays, po.vendor.msmeCategory),
            freight,
            ...totals(lines, freight),
            matched: exceptions.length === 0,
            exceptions,
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
      throw this.duplicate(e, dto.invoiceNo, po.vendor.name);
    }
    if (!id) return this.get(user, dto.id!);
    await this.attachments.link(user, 'vendorBillId', id, dto.attachmentIds);
    await this.audit.log(user, 'VENDOR_BILL', id, 'CREATED');
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateVendorBillDto): Promise<VendorBillDto> {
    const row = await this.lifecycle.load(user, 'VENDOR_BILL', id);
    await this.assertCanRecord(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    const current = await this.prisma.vendorBill.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
    const po = await this.order(user, current.purchaseOrderId);
    if (dto.invoiceDate !== undefined) this.checkDate(dto.invoiceDate);
    const lines = dto.lines ? this.priced(po, dto.lines) : current.lines;
    const freight = dto.freight !== undefined ? parseFreight(dto.freight) : current.freight;
    const invoiceDate = dto.invoiceDate !== undefined ? parseDate(dto.invoiceDate) : current.invoiceDate;
    const invoiceNo = dto.invoiceNo ?? current.invoiceNo;
    try {
      await this.prisma.$transaction(async (tx) => {
        const exceptions = await this.match(tx, po, lines, freight, id);
        await tx.vendorBill.update({
          where: { id },
          data: {
            invoiceNo,
            invoiceDate,
            dueDate: this.dueDate(invoiceDate, po.paymentDays, po.vendor.msmeCategory),
            freight,
            ...totals(lines, freight),
            matched: exceptions.length === 0,
            exceptions,
            ...(dto.remarks !== undefined ? { remarks: dto.remarks || null } : {}),
            ...(dto.lines ? { lines: { deleteMany: {}, create: lines as PricedLine[] } } : {}),
          },
        });
      });
    } catch (e) {
      throw this.duplicate(e, invoiceNo, po.vendor.name);
    }
    await this.attachments.sync(user, 'vendorBillId', id, dto.attachmentIds);
    await this.audit.log(user, 'VENDOR_BILL', id, 'UPDATED');
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  /** Submit for approval, matching again first: GRNs or other bills may have arrived since the bill was entered. */
  async submit(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'VENDOR_BILL', id);
    const bill = await this.prisma.vendorBill.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (row.status !== 'SUBMITTED' && row.status !== 'APPROVED') {
      const po = await this.order(user, bill.purchaseOrderId);
      const exceptions = await this.match(this.prisma, po, bill.lines, bill.freight, id);
      await this.prisma.vendorBill.update({ where: { id }, data: { matched: exceptions.length === 0, exceptions } });
    }
    await this.lifecycle.submit(user, 'VENDOR_BILL', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'VENDOR_BILL', id);
    await this.assertCanRecord(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.vendorBill.delete({ where: { id } });
    await this.audit.log(user, 'VENDOR_BILL', id, 'DELETED');
    return { ok: true };
  }
}

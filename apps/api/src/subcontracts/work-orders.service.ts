import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canIssueWorkOrder,
  canPrepareSubcontractBill,
  canViewWorkOrders,
  contractorTdsPct,
  subBillLabel,
  type Paginated,
  type SortOrder,
  type WorkOrderDto,
  type WorkOrderMarginDto,
  type WorkOrderSortField,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { dateRange, ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { D, MSME_MAX_PAYMENT_DAYS, ZERO, parseGstRate, parseQty, parseRate, sum } from '../purchasing/purchase-math';
import { CloseWorkOrderDto, CreateWorkOrderDto, ListWorkOrdersQuery, MarginQuery, UpdateWorkOrderDto, WoLineInput } from './subcontracts.dto';

const round2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const pctStr = (d: Prisma.Decimal) => d.toFixed(2).replace(/\.?0+$/, '') || '0';

const include = {
  project: { select: { name: true } },
  vendor: { select: { name: true, gstin: true, pan: true, msmeCategory: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  supplierAcceptedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
  lines: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: { boqItem: { select: { itemNo: true } }, billLines: { where: { bill: { status: { not: 'REJECTED' as const } } }, select: { thisQty: true } } },
  },
  bills: { where: { status: { not: 'REJECTED' as const } }, select: { grossAmount: true, advanceRecoveryAmount: true } },
  measurements: { where: { status: 'APPROVED' as const }, select: { boqItemId: true, totalQty: true } },
  // Advances (v5 item 90): paid with no bill, and asked for on open requests.
  advances: { where: { subcontractBillId: null }, select: { amount: true, tdsAmount: true, otherDeduction: true } },
  paymentRequests: { where: { kind: 'WO_ADVANCE' as const, status: { in: ['SUBMITTED' as const, 'APPROVED' as const] } }, select: { amount: true } },
} satisfies Prisma.WorkOrderInclude;
type Row = Prisma.WorkOrderGetPayload<{ include: typeof include }>;

const ORDER: Record<WorkOrderSortField, (o: SortOrder) => Prisma.WorkOrderOrderByWithRelationInput[]> = {
  woDate: (o) => [{ woDate: o }, { woNo: o }],
  woNo: (o) => [{ woNo: o }],
  value: (o) => [{ value: o }],
  status: (o) => [{ status: o }, { woDate: 'desc' }],
  project: (o) => [{ project: { name: o } }, { woDate: 'desc' }],
  vendor: (o) => [{ vendor: { name: o } }, { woDate: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['woDate', 'woNo', 'value', 'createdAt']);

/** A percentage from 0 to 100 with at most 2 decimals. */
export function parsePct(raw: string | undefined, what: string): Prisma.Decimal {
  const v = Number(raw ?? '0');
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new BadRequestException(`${what} must be between 0 and 100`);
  const d = D(raw ?? '0');
  if (d.decimalPlaces() > 2) throw new BadRequestException(`${what} can have at most 2 decimals`);
  return d;
}

function parseAmount(raw: string | undefined, what: string): Prisma.Decimal {
  const v = Number(raw ?? '0');
  if (!Number.isFinite(v) || v < 0) throw new BadRequestException(`${what} cannot be negative`);
  if (v >= 1e13) throw new BadRequestException(`${what} is too large`);
  return round2(D(raw ?? '0'));
}

/**
 * Work orders to subcontractors and labour contractors (v3 item 22): rates per BOQ item (their work is measured in the
 * measurement book against the order) or for the order's own items, the terms their bills are made with (GST, retention,
 * advance and its recovery, TDS under section 194C, payment days), approved through the submission lifecycle and the
 * approval matrix. An approved order is closed when the work is done; until then it takes measurements, material issues
 * and bills. The margin view puts the client's BOQ rate against the subcontract rate.
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {}

  toDto(r: Row): WorkOrderDto {
    const measured = new Map<string, Prisma.Decimal>();
    for (const m of r.measurements) measured.set(m.boqItemId, (measured.get(m.boqItemId) ?? ZERO).add(m.totalQty));
    const billed = sum(r.bills, (b) => b.grossAmount);
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      woNo: r.woNo,
      woDate: dateOnly(r.woDate),
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      vendorGstin: r.vendor.gstin,
      vendorPan: r.vendor.pan,
      vendorMsme: r.vendor.msmeCategory,
      title: r.title,
      startDate: dateOnly(r.startDate),
      endDate: dateOnly(r.endDate),
      gstRate: pctStr(r.gstRate),
      retentionPct: pctStr(r.retentionPct),
      advanceAmount: money(r.advanceAmount),
      advanceRecoveryPct: pctStr(r.advanceRecoveryPct),
      advanceRecovered: money(sum(r.bills, (b) => b.advanceRecoveryAmount)),
      advancePaid: money(sum(r.advances, (p) => p.amount.add(p.tdsAmount).add(p.otherDeduction))),
      advanceRequested: money(sum(r.paymentRequests, (p) => p.amount)),
      tdsPct: pctStr(r.tdsPct),
      paymentDays: r.paymentDays,
      value: money(r.value),
      terms: r.terms,
      remarks: r.remarks,
      closedAt: iso(r.closedAt),
      closeNote: r.closeNote,
      supplierAcceptedAt: iso(r.supplierAcceptedAt),
      supplierAcceptedBy: r.supplierAcceptedBy?.fullName ?? null,
      supplierNote: r.supplierNote,
      open: r.status === 'APPROVED' && !r.closedAt,
      billedAmount: money(billed),
      billedPct: r.value.isZero() ? 0 : Math.round(billed.div(r.value).mul(100).toNumber()),
      lines: r.lines.map((l) => ({
        id: l.id,
        boqItemId: l.boqItemId,
        itemNo: l.boqItem?.itemNo ?? null,
        description: l.description,
        unit: l.unit,
        quantity: dec(l.quantity),
        rate: money(l.rate),
        amount: money(l.amount),
        measuredQty: dec(l.boqItemId ? (measured.get(l.boqItemId) ?? ZERO) : ZERO),
        billedQty: dec(sum(l.billLines, (b) => b.thisQty)),
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
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  private assertCanView(user: RequestUser) {
    if (!canViewWorkOrders(user.roleKey)) throw new ForbiddenException('Your role cannot see work orders');
  }

  private async assertCanIssue(user: RequestUser, projectId: string) {
    if (!canIssueWorkOrder(user.roleKey)) throw new ForbiddenException('Only project managers, the QS, procurement and management issue work orders');
    await this.access.assertCanAccessProject(user, projectId);
  }

  async list(user: RequestUser, q: ListWorkOrdersQuery): Promise<Paginated<WorkOrderDto>> {
    this.assertCanView(user);
    const where: Prisma.WorkOrderWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.status) where.status = q.status;
    if (q.open) Object.assign(where, { status: 'APPROVED', closedAt: null });
    if (q.boqItemId) where.lines = { some: { boqItemId: q.boqItemId } };
    if (q.mine) where.submittedById = user.id;
    const days = dateRange(q.from, q.to);
    if (days) where.woDate = days;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ woNo: ilike(w) }, { title: ilike(w) }, { vendor: { name: ilike(w) } }, { project: { name: ilike(w) } }, { lines: { some: { description: ilike(w) } } }],
      }));
    const sortBy = q.sortBy ?? 'woDate';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.workOrder.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<WorkOrderDto> {
    this.assertCanView(user);
    const row = await this.prisma.workOrder.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Work order not found');
    const bills = await this.prisma.subcontractBill.findMany({
      where: { workOrderId: id },
      orderBy: { billNo: 'asc' },
      select: { id: true, billNo: true, isFinal: true, billDate: true, grossAmount: true, netPayable: true, status: true },
    });
    return {
      ...this.toDto(row),
      bills: bills.map((b) => ({
        id: b.id,
        billNo: b.billNo,
        label: subBillLabel(row.woNo, b.billNo, b.isFinal),
        isFinal: b.isFinal,
        billDate: dateOnly(b.billDate),
        grossAmount: money(b.grossAmount),
        netPayable: money(b.netPayable),
        status: b.status,
      })),
    };
  }

  /** The client's BOQ rate against the subcontract rate (approved, weighted by quantity) for each BOQ item let out. */
  async margin(user: RequestUser, q: MarginQuery): Promise<WorkOrderMarginDto[]> {
    if (!canPrepareSubcontractBill(user.roleKey)) throw new ForbiddenException('Your role cannot see subcontract margins');
    await this.access.assertCanAccessProject(user, q.projectId);
    const lines = await this.prisma.workOrderLine.findMany({
      where: { boqItemId: { not: null }, workOrder: { projectId: q.projectId, organizationId: user.organizationId, status: 'APPROVED' } },
      include: { boqItem: true, workOrder: { select: { id: true, woNo: true, vendor: { select: { name: true } } } } },
      orderBy: [{ boqItem: { sortOrder: 'asc' } }, { boqItem: { itemNo: 'asc' } }, { workOrder: { woNo: 'asc' } }],
    });
    const byItem = new Map<string, typeof lines>();
    for (const l of lines) byItem.set(l.boqItemId!, [...(byItem.get(l.boqItemId!) ?? []), l]);
    return [...byItem.values()].map((ls) => {
      const b = ls[0].boqItem!;
      const qty = sum(ls, (l) => l.quantity);
      const subRate = qty.isZero() ? ZERO : round2(sum(ls, (l) => l.quantity.mul(l.rate)).div(qty));
      const margin = b.rate.sub(subRate);
      return {
        boqItemId: b.id,
        itemNo: b.itemNo,
        description: b.description,
        unit: b.unit,
        boqQty: dec(b.revisedQty ?? b.originalQty),
        clientRate: money(b.rate),
        subRate: money(subRate),
        margin: money(margin),
        marginPct: b.rate.isZero() ? 0 : Math.round(margin.div(b.rate).mul(1000).toNumber()) / 10,
        workOrders: ls.map((l) => ({ id: l.workOrder.id, woNo: l.workOrder.woNo, vendorName: l.workOrder.vendor.name, quantity: dec(l.quantity), rate: money(l.rate) })),
      };
    });
  }

  private async vendorOf(user: RequestUser, vendorId: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, organizationId: user.organizationId }, select: { id: true, name: true, isActive: true, msmeCategory: true, pan: true, gstin: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!vendor.isActive) throw new BadRequestException(`${vendor.name} is inactive in the vendor master`);
    return vendor;
  }

  private paymentDays(days: number | null | undefined, vendor: { name: string; msmeCategory: string | null }) {
    if (days != null && days > MSME_MAX_PAYMENT_DAYS && (vendor.msmeCategory === 'MICRO' || vendor.msmeCategory === 'SMALL'))
      throw new BadRequestException(`${vendor.name} is a ${vendor.msmeCategory.toLowerCase()} enterprise: payment is due within ${MSME_MAX_PAYMENT_DAYS} days of their bill`);
    return days ?? null;
  }

  /** Lines priced; a BOQ line takes the item's description and unit, and a BOQ item appears once. */
  private async lines(projectId: string, input: WoLineInput[]) {
    const boqIds = input.map((l) => l.boqItemId).filter((x): x is string => !!x);
    if (new Set(boqIds).size !== boqIds.length) throw new BadRequestException('A BOQ item is on the work order twice');
    const boq = boqIds.length ? await this.prisma.boqItem.findMany({ where: { id: { in: boqIds }, projectId }, select: { id: true, itemNo: true, description: true, unit: true } }) : [];
    return input.map((l, i) => {
      const b = l.boqItemId ? boq.find((x) => x.id === l.boqItemId) : null;
      if (l.boqItemId && !b) throw new BadRequestException(`Line ${i + 1}: the BOQ item is not part of this project`);
      const description = b ? `${b.itemNo} ${b.description}` : l.description?.trim();
      const unit = b?.unit ?? l.unit?.trim();
      if (!description || !unit) throw new BadRequestException(`Line ${i + 1}: give the description and unit`);
      const what = b ? `Item ${b.itemNo}` : description;
      const quantity = parseQty(l.quantity, what);
      const rate = parseRate(l.rate, what);
      return { boqItemId: b?.id ?? null, description: description.slice(0, 300), unit, quantity, rate, amount: round2(quantity.mul(rate)), sortOrder: i };
    });
  }

  private terms(dto: CreateWorkOrderDto | UpdateWorkOrderDto) {
    const data: Prisma.WorkOrderUncheckedUpdateInput = {};
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? parseDate(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? parseDate(dto.endDate) : null;
    if (dto.gstRate !== undefined) data.gstRate = parseGstRate(dto.gstRate, 'GST');
    if (dto.retentionPct !== undefined) data.retentionPct = parsePct(dto.retentionPct, 'Retention');
    if (dto.advanceAmount !== undefined) data.advanceAmount = parseAmount(dto.advanceAmount, 'The advance');
    if (dto.advanceRecoveryPct !== undefined) data.advanceRecoveryPct = parsePct(dto.advanceRecoveryPct, 'Advance recovery');
    if (dto.tdsPct !== undefined) data.tdsPct = parsePct(dto.tdsPct, 'TDS');
    if (dto.terms !== undefined) data.terms = dto.terms || null;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    return data;
  }

  private checkDates(start: Date | null | undefined, end: Date | null | undefined) {
    if (start && end && end < start) throw new BadRequestException('The work order cannot end before it starts');
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.workOrder.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateWorkOrderDto): Promise<WorkOrderDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.assertCanIssue(user, dto.projectId);
    const vendor = await this.vendorOf(user, dto.vendorId);
    const lines = await this.lines(dto.projectId, dto.lines);
    const terms = this.terms(dto);
    this.checkDates(terms.startDate as Date | null, terms.endDate as Date | null);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const woNo = await nextDocNo(tx, user.organizationId, 'WO', async (prefix) =>
          (await tx.workOrder.findFirst({ where: { organizationId: user.organizationId, woNo: { startsWith: prefix } }, orderBy: { woNo: 'desc' }, select: { woNo: true } }))?.woNo ?? null,
        );
        if (dto.id && (await tx.workOrder.count({ where: { id: dto.id } }))) return null;
        const row = await tx.workOrder.create({
          data: {
            ...(terms as Prisma.WorkOrderUncheckedCreateInput),
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            vendorId: vendor.id,
            woNo,
            woDate: parseDate(dto.woDate ?? new Date().toISOString().slice(0, 10)),
            title: dto.title,
            gstRate: (terms.gstRate as Prisma.Decimal | undefined) ?? D(vendor.gstin ? 18 : 0),
            tdsPct: (terms.tdsPct as Prisma.Decimal | undefined) ?? D(contractorTdsPct(vendor.pan)),
            paymentDays: this.paymentDays(dto.paymentDays, vendor),
            value: sum(lines, (l) => l.amount),
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
    await this.attachments.link(user, 'workOrderId', id, dto.attachmentIds);
    await this.audit.log(user, 'WORK_ORDER', id, 'CREATED');
    if (dto.submit) await this.lifecycle.submit(user, 'WORK_ORDER', id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateWorkOrderDto): Promise<WorkOrderDto> {
    const row = await this.lifecycle.load(user, 'WORK_ORDER', id);
    await this.assertCanIssue(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    const current = await this.prisma.workOrder.findUniqueOrThrow({ where: { id }, select: { vendorId: true, paymentDays: true, startDate: true, endDate: true } });
    const vendor = await this.vendorOf(user, dto.vendorId ?? current.vendorId);
    const data = this.terms(dto);
    this.checkDates(data.startDate !== undefined ? (data.startDate as Date | null) : current.startDate, data.endDate !== undefined ? (data.endDate as Date | null) : current.endDate);
    if (dto.vendorId) data.vendorId = vendor.id;
    if (dto.woDate) data.woDate = parseDate(dto.woDate);
    if (dto.title) data.title = dto.title;
    data.paymentDays = this.paymentDays(dto.paymentDays !== undefined ? dto.paymentDays : current.paymentDays, vendor);
    if (dto.lines) {
      const lines = await this.lines(row.projectId, dto.lines);
      data.value = sum(lines, (l) => l.amount);
      data.lines = { deleteMany: {}, create: lines };
    }
    await this.prisma.workOrder.update({ where: { id }, data });
    await this.attachments.sync(user, 'workOrderId', id, dto.attachmentIds);
    await this.audit.log(user, 'WORK_ORDER', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'WORK_ORDER', id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string) {
    await this.lifecycle.submit(user, 'WORK_ORDER', id);
    return this.get(user, id);
  }

  /** Close an approved order: no more measurements, issues or bills against it. A bill still being prepared must go first. */
  async close(user: RequestUser, id: string, dto: CloseWorkOrderDto) {
    const row = await this.lifecycle.load(user, 'WORK_ORDER', id);
    await this.assertCanIssue(user, row.projectId);
    const wo = await this.prisma.workOrder.findUniqueOrThrow({ where: { id }, select: { woNo: true, status: true, closedAt: true } });
    if (wo.status !== 'APPROVED') throw new BadRequestException('Only approved work orders can be closed; delete or reject a draft instead');
    if (wo.closedAt) throw new BadRequestException(`${wo.woNo} is already closed`);
    const open = await this.prisma.subcontractBill.findFirst({ where: { workOrderId: id, status: { not: 'APPROVED' } }, select: { billNo: true } });
    if (open) throw new ConflictException(`Bill ${open.billNo} on ${wo.woNo} is not approved yet; finish or delete it first`);
    await this.prisma.workOrder.update({ where: { id }, data: { closedAt: new Date(), closeNote: dto.note } });
    await this.audit.log(user, 'WORK_ORDER', id, 'CLOSED', dto.note);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'WORK_ORDER', id);
    await this.assertCanIssue(user, row.projectId);
    if (row.status === 'APPROVED') throw new BadRequestException('An approved work order cannot be deleted; close it instead');
    await this.lifecycle.assertEditable(user, row);
    const [bills, mbs, issues] = await Promise.all([
      this.prisma.subcontractBill.count({ where: { workOrderId: id } }),
      this.prisma.measurementSheet.count({ where: { workOrderId: id } }),
      this.prisma.stockEntry.count({ where: { workOrderId: id } }),
    ]);
    if (bills || mbs || issues) throw new ConflictException('Measurements, material issues or bills are recorded against this work order; it cannot be deleted');
    await this.prisma.workOrder.delete({ where: { id } });
    await this.audit.log(user, 'WORK_ORDER', id, 'DELETED');
    return { ok: true };
  }
}

/**
 * An approved, open work order of the project, for a measurement or a material issue. `boqItemId` also requires a line
 * on that BOQ item. Returns its number and the contractor's name.
 */
export async function assertOpenWorkOrder(db: Prisma.TransactionClient | PrismaService, organizationId: string, workOrderId: string, projectId: string, boqItemId?: string) {
  const wo = await db.workOrder.findFirst({
    where: { id: workOrderId, organizationId },
    select: { woNo: true, projectId: true, status: true, closedAt: true, vendor: { select: { name: true } }, lines: { select: { boqItemId: true } } },
  });
  if (!wo || wo.projectId !== projectId) throw new BadRequestException('The work order is not part of this project');
  if (wo.status !== 'APPROVED') throw new ConflictException(`${wo.woNo} is not approved yet`);
  if (wo.closedAt) throw new ConflictException(`${wo.woNo} is closed`);
  if (boqItemId && !wo.lines.some((l) => l.boqItemId === boqItemId)) throw new BadRequestException(`${wo.woNo} has no line for this BOQ item`);
  return { woNo: wo.woNo, vendorName: wo.vendor.name };
}

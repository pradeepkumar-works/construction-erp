import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, StockEntryType } from '@prisma/client';
import {
  LEGACY_STOCK_ENTRY_TYPES,
  STOCK_ENTRY_PREFIX,
  canManageStore,
  canViewCost,
  stockAgeingBucket,
  type StockCountResultDto,
  type StockValuationDto,
  SUBMISSION_STATUS_LABELS,
  crossesBelowMin,
  isLowStock,
  type ItemDto,
  type ItemSortField,
  type Paginated,
  type ReceivableRequestDto,
  type SortOrder,
  type StockBalanceDto,
  type StockBalanceSortField,
  type StockEntryDto,
  type StockEntrySortField,
  subBillLabel,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { VendorsService } from '../vendors/vendors.service';
import { assertOpenWorkOrder } from '../subcontracts/work-orders.service';
import { AttachmentsService } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import {
  CheckGrnDto,
  CreateAdjustmentDto,
  CreateIssueDto,
  CreateSiteReturnDto,
  CreateTransferDto,
  CreateVendorReturnDto,
  IncomingTransfersQuery,
  PostCountDto,
  ReceiveTransferDto,
  StockValuationQuery,
  CreateItemDto,
  CreateReceiptDto,
  ListItemsQuery,
  ListStockBalancesQuery,
  ListStockEntriesQuery,
  ReceivableQuery,
  SetMinLevelDto,
  UpdateItemDto,
} from './stock.dto';

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

const include = {
  project: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  materialRequest: { select: { requestNo: true } },
  purchaseOrder: { select: { poNo: true } },
  activity: { select: { name: true } },
  workOrder: { select: { woNo: true } },
  toProject: { select: { name: true } },
  transferIn: { select: { id: true, entryNo: true } },
  transferOut: { select: { entryNo: true, project: { select: { name: true } } } },
  lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { item: { select: { name: true, unit: true } } } },
  qcBy: { select: { fullName: true } },
  attachments: true,
} satisfies Prisma.StockEntryInclude;
type Row = Prisma.StockEntryGetPayload<{ include: typeof include }>;

const ENTRY_ORDER: Record<StockEntrySortField, (o: SortOrder) => Prisma.StockEntryOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { createdAt: o }],
  entryNo: (o) => [{ entryNo: o }],
  type: (o) => [{ type: o }, { date: 'desc' }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  createdBy: (o) => [{ createdBy: { fullName: o } }, { date: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const ENTRY_DESC_DEFAULT = new Set<string>(['date', 'entryNo', 'createdAt']);
const BALANCE_DESC_DEFAULT = new Set<string>(['balance', 'received', 'issued', 'lastMovement']);

const ITEM_ORDER: Record<ItemSortField, (o: SortOrder) => Prisma.ItemOrderByWithRelationInput[]> = {
  name: (o) => [{ name: o }, { unit: 'asc' }],
  unit: (o) => [{ unit: o }, { name: 'asc' }],
  category: (o) => [{ category: { sort: o, nulls: 'last' } }, { name: 'asc' }],
  createdAt: (o) => [{ createdAt: o }],
};

/** A stock line ready to insert; quantity carries its sign. */
interface Line {
  itemId: string;
  quantity: Decimal;
  materialRequestItemId?: string | null;
  purchaseOrderLineId?: string | null;
}

interface Header {
  id?: string;
  type: StockEntryType;
  projectId: string;
  date: Date;
  materialRequestId?: string | null;
  purchaseOrderId?: string | null;
  supplier?: string | null;
  vendorId?: string | null;
  challanNo?: string | null;
  vehicleNo?: string | null;
  issuedTo?: string | null;
  activityId?: string | null;
  workOrderId?: string | null;
  toProjectId?: string | null;
  transferOutId?: string | null;
  remarks?: string | null;
  /** Issues: spares for this maintenance job card */
  maintenanceJobId?: string | null;
}

const blank = (s: string | null | undefined) => s?.trim() || null;
const key = (projectId: string, itemId: string) => `${projectId}|${itemId}`;

/**
 * Store register per project: goods received (GRN) against approved material requests, material issued at
 * site, and adjustments. Balances are the sum of signed StockTxn rows. Writes for an organisation run one at
 * a time under an advisory lock, so two issues can never take the same stock and entry numbers never clash.
 */
@Injectable()
export class StockService {
  private readonly log = new Logger(StockService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
    private vendors: VendorsService,
  ) {}

  /* ---------- helpers ---------- */

  toDto(r: Row): StockEntryDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      type: r.type,
      entryNo: r.entryNo,
      date: dateOnly(r.date)!,
      materialRequestId: r.materialRequestId,
      requestNo: r.materialRequest?.requestNo ?? null,
      purchaseOrderId: r.purchaseOrderId,
      poNo: r.purchaseOrder?.poNo ?? null,
      supplier: r.supplier,
      vendorId: r.vendorId,
      challanNo: r.challanNo,
      vehicleNo: r.vehicleNo,
      issuedTo: r.issuedTo,
      activityId: r.activityId,
      activityName: r.activity?.name ?? null,
      workOrderId: r.workOrderId,
      woNo: r.workOrder?.woNo ?? null,
      subcontractBillId: r.subcontractBillId,
      toProjectId: r.toProjectId,
      toProjectName: r.toProject?.name ?? null,
      transferInId: r.transferIn?.id ?? null,
      transferInNo: r.transferIn?.entryNo ?? null,
      transferOutId: r.transferOutId,
      transferOutNo: r.transferOut?.entryNo ?? null,
      fromProjectName: r.transferOut?.project.name ?? null,
      remarks: r.remarks,
      qcStatus: r.qcStatus,
      qcAt: iso(r.qcAt),
      qcByName: r.qcBy?.fullName ?? null,
      qcNote: r.qcNote,
      lines: r.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemName: l.item.name,
        unit: l.item.unit,
        quantity: dec(l.quantity)!,
        materialRequestItemId: l.materialRequestItemId,
        purchaseOrderLineId: l.purchaseOrderLineId,
        rejectedQty: dec(l.rejectedQty),
      })),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdById: r.createdById,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt)!,
    };
  }

  private parseQty(raw: string, what: string, allowNegative = false): Decimal {
    let q: Decimal;
    try {
      q = D(raw);
    } catch {
      throw new BadRequestException(`${what}: "${raw}" is not a number`);
    }
    if (!q.isFinite()) throw new BadRequestException(`${what}: "${raw}" is not a number`);
    if (q.decimalPlaces() > 3) throw new BadRequestException(`${what}: use at most 3 decimals`);
    if (allowNegative ? q.isZero() : q.lte(0)) throw new BadRequestException(`${what}: the quantity must be ${allowNegative ? 'non-zero' : 'more than zero'}`);
    if (q.abs().gte(1e15)) throw new BadRequestException(`${what}: the quantity is too large`);
    return q;
  }

  /** Entry dates may be back-dated but not set in the future (a day of slack covers time zones). */
  private entryDate(s: string): Date {
    const d = parseDate(s);
    if (d.getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The date cannot be in the future');
    return d;
  }

  /** Serialise stock writes of one organisation for the rest of the transaction. */
  private lock(tx: Tx, organizationId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock:${organizationId}`}))`;
  }

  private async inLock<T>(organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, organizationId);
        return fn(tx);
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }

  private async balancesOf(db: Tx | PrismaService, projectId: string, itemIds: string[]): Promise<Map<string, Decimal>> {
    const rows = await db.stockTxn.groupBy({ by: ['itemId'], where: { projectId, itemId: { in: itemIds } }, _sum: { quantity: true } });
    const out = new Map<string, Decimal>(itemIds.map((id) => [id, ZERO]));
    for (const r of rows) out.set(r.itemId, r._sum.quantity ?? ZERO);
    return out;
  }

  private async nextEntryNo(tx: Tx, organizationId: string, type: StockEntryType): Promise<string> {
    const prefix = `${STOCK_ENTRY_PREFIX[type]}-${new Date().getUTCFullYear()}-`;
    const last = await tx.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: prefix } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
    const n = last ? parseInt(last.entryNo.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  /** Item master lookup by name and unit (case-insensitive); adds the item when it is new. */
  private async resolveItem(tx: Tx, organizationId: string, name: string, unit: string) {
    const found = await tx.item.findFirst({
      where: { organizationId, name: { equals: name.trim(), mode: 'insensitive' }, unit: { equals: unit.trim(), mode: 'insensitive' } },
      select: { id: true, name: true, unit: true },
    });
    return found ?? tx.item.create({ data: { organizationId, name: name.trim(), unit: unit.trim() }, select: { id: true, name: true, unit: true } });
  }

  private mergeLines(lines: Line[]): Line[] {
    const out = new Map<string, Line>();
    for (const l of lines) {
      const k = `${l.itemId}|${l.materialRequestItemId ?? ''}|${l.purchaseOrderLineId ?? ''}`;
      const prev = out.get(k);
      if (prev) prev.quantity = prev.quantity.add(l.quantity);
      else out.set(k, { ...l });
    }
    return [...out.values()].filter((l) => !l.quantity.isZero());
  }

  private async insertEntry(tx: Tx, user: RequestUser, h: Header, lines: Line[]) {
    const entryNo = await this.nextEntryNo(tx, user.organizationId, h.type);
    return tx.stockEntry.create({
      data: {
        id: h.id,
        organizationId: user.organizationId,
        projectId: h.projectId,
        type: h.type,
        entryNo,
        date: h.date,
        materialRequestId: h.materialRequestId ?? null,
        purchaseOrderId: h.purchaseOrderId ?? null,
        supplier: blank(h.supplier),
        vendorId: h.vendorId ?? null,
        challanNo: blank(h.challanNo),
        vehicleNo: blank(h.vehicleNo),
        issuedTo: blank(h.issuedTo),
        activityId: h.activityId ?? null,
        workOrderId: h.workOrderId ?? null,
        toProjectId: h.toProjectId ?? null,
        transferOutId: h.transferOutId ?? null,
        remarks: blank(h.remarks),
        maintenanceJobId: h.maintenanceJobId ?? null,
        createdById: user.id,
        lines: {
          create: lines.map((l, i) => ({
            organizationId: user.organizationId,
            projectId: h.projectId,
            itemId: l.itemId,
            type: h.type,
            date: h.date,
            quantity: l.quantity,
            materialRequestItemId: l.materialRequestItemId ?? null,
            purchaseOrderLineId: l.purchaseOrderLineId ?? null,
            sortOrder: i,
          })),
        },
      },
      select: { id: true, entryNo: true },
    });
  }

  /** Idempotent create: an entry that already exists under the client-supplied id is returned as is. */
  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.stockEntry.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  /** Runs a create; a unique-id race between two retries of the same request returns the winner. */
  private async createGuarded(user: RequestUser, id: string | undefined, fn: () => Promise<{ id: string; entryNo: string }>) {
    try {
      return await fn();
    } catch (e) {
      if (isUniqueViolation(e) && id) {
        const winner = await this.prisma.stockEntry.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, entryNo: true } });
        if (winner) return { ...winner, existing: true };
      }
      throw e;
    }
  }

  /** Alert the project's store managers and PM about items this change took below their minimum. */
  private async alertLowStock(user: RequestUser, projectId: string, before: Map<string, Decimal>, entryId: string, entryNo: string) {
    try {
      const itemIds = [...before.keys()];
      const [after, mins, items, project] = await Promise.all([
        this.balancesOf(this.prisma, projectId, itemIds),
        this.prisma.stockMinLevel.findMany({ where: { projectId, itemId: { in: itemIds } } }),
        this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } }),
        this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      ]);
      const crossed = mins.filter((m) => crossesBelowMin(before.get(m.itemId)!.toString(), after.get(m.itemId)!.toString(), m.minQty.toString()));
      if (!crossed.length) return;
      const watchers = (await this.access.stockWatchersForProject(user.organizationId, projectId)).map((u) => u.id).filter((id) => id !== user.id);
      for (const m of crossed) {
        const item = items.find((i) => i.id === m.itemId)!;
        await this.notifications.notify({
          organizationId: user.organizationId,
          userIds: watchers,
          type: 'LOW_STOCK',
          title: `Low stock: ${item.name}`,
          body: `${item.name} at ${project?.name ?? 'the project'} is down to ${dec(after.get(m.itemId))} ${item.unit} after ${entryNo} (minimum ${dec(m.minQty)} ${item.unit}).`,
          projectId,
          dedupeKey: `LOW_STOCK:${entryId}:${m.itemId}`,
        });
      }
    } catch (e) {
      this.log.warn(`Low-stock alert failed: ${(e as Error).message}`);
    }
  }

  /* ---------- entries ---------- */

  async list(user: RequestUser, q: ListStockEntriesQuery): Promise<Paginated<StockEntryDto>> {
    const where: Prisma.StockEntryWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.type) where.type = q.type;
    else if (!q.allTypes) where.type = { in: LEGACY_STOCK_ENTRY_TYPES };
    if (q.materialRequestId) where.materialRequestId = q.materialRequestId;
    if (q.workOrderId) where.workOrderId = q.workOrderId;
    if (q.itemId) where.lines = { some: { itemId: q.itemId } };
    if (q.qc) Object.assign(where, { type: 'RECEIPT', qcStatus: q.qc === 'PENDING' ? null : q.qc });
    if (q.from || q.to) where.date = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { entryNo: ilike(w) },
          { project: { name: ilike(w) } },
          { supplier: ilike(w) },
          { challanNo: ilike(w) },
          { issuedTo: ilike(w) },
          { remarks: ilike(w) },
          { materialRequest: { requestNo: ilike(w) } },
          { createdBy: { fullName: ilike(w) } },
          { lines: { some: { item: { name: ilike(w) } } } },
        ],
      }));
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (ENTRY_DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.stockEntry.findMany({ where, include, orderBy: [...ENTRY_ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.stockEntry.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<StockEntryDto> {
    const row = await this.prisma.stockEntry.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Stock entry not found');
    return this.toDto(row);
  }

  /** GRN: receive material against an approved request or purchase order, at most what is still pending on each line. */
  async receive(user: RequestUser, dto: CreateReceiptDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    if (dto.purchaseOrderId) return this.receiveAgainstPo(user, dto, dto.purchaseOrderId);
    const mr = await this.prisma.materialRequest.findFirst({ where: { id: dto.materialRequestId, ...this.access.submissionWhere(user) }, include: { items: true } });
    if (!mr) throw new NotFoundException('Material request not found');
    if (mr.status !== 'APPROVED') throw new ConflictException(`Material can only be received against an approved request. ${mr.requestNo} is ${SUBMISSION_STATUS_LABELS[mr.status].toLowerCase()}.`);
    await this.access.assertCanKeepStock(user, mr.projectId);
    const date = this.entryDate(dto.date);
    const vendor = await this.vendors.resolve(user, dto.vendorId, dto.supplier);
    const want = new Map<string, Decimal>();
    for (const l of dto.lines) {
      const line = mr.items.find((i) => i.id === l.materialRequestItemId);
      if (l.purchaseOrderLineId) throw new BadRequestException('Receive PO lines with purchaseOrderId');
      if (!line) throw new BadRequestException(`A line is not part of ${mr.requestNo}`);
      want.set(line.id, (want.get(line.id) ?? ZERO).add(this.parseQty(l.quantity, line.itemName)));
    }
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        const got = await tx.stockTxn.groupBy({ by: ['materialRequestItemId'], where: { materialRequestItemId: { in: [...want.keys()] } }, _sum: { quantity: true } });
        const lines: Line[] = [];
        for (const [lineId, quantity] of want) {
          const line = mr.items.find((i) => i.id === lineId)!;
          const received = got.find((g) => g.materialRequestItemId === lineId)?._sum.quantity ?? ZERO;
          const pending = line.quantity.sub(received);
          if (quantity.gt(pending))
            throw new ConflictException(
              pending.lte(0)
                ? `${line.itemName} on ${mr.requestNo} is already fully received.`
                : `Only ${dec(pending)} ${line.unit} of ${line.itemName} is still pending on ${mr.requestNo}.`,
            );
          const item = await this.resolveItem(tx, user.organizationId, line.itemName, line.unit);
          lines.push({ itemId: item.id, quantity, materialRequestItemId: line.id });
        }
        return this.insertEntry(tx, user, { ...dto, supplier: vendor?.name ?? null, vendorId: vendor?.vendorId ?? null, type: 'RECEIPT', projectId: mr.projectId, date, materialRequestId: mr.id }, lines);
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.attachments.link(user, 'stockEntryId', saved.id, dto.attachmentIds);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} against ${mr.requestNo}`);
    return this.get(user, saved.id);
  }

  /**
   * GRN against an approved purchase order: the supplier is the PO's vendor, each line at most what is still pending on
   * the PO line. A PO line raised from a request line counts against that request line too.
   */
  private async receiveAgainstPo(user: RequestUser, dto: CreateReceiptDto, purchaseOrderId: string): Promise<StockEntryDto> {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, ...this.access.submissionWhere(user) }, include: { lines: true, vendor: { select: { name: true } } } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== 'APPROVED') throw new ConflictException(`Material can only be received against an approved PO. ${po.poNo} is ${SUBMISSION_STATUS_LABELS[po.status].toLowerCase()}.`);
    if (po.closedAt) throw new ConflictException(`${po.poNo} is closed; nothing more can be received against it.`);
    await this.access.assertCanKeepStock(user, po.projectId);
    const date = this.entryDate(dto.date);
    const want = new Map<string, Decimal>();
    for (const l of dto.lines) {
      const line = po.lines.find((i) => i.id === l.purchaseOrderLineId);
      if (!line) throw new BadRequestException(`A line is not part of ${po.poNo}`);
      want.set(line.id, (want.get(line.id) ?? ZERO).add(this.parseQty(l.quantity, line.itemName)));
    }
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        const got = await tx.stockTxn.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: [...want.keys()] } }, _sum: { quantity: true } });
        const lines: Line[] = [];
        for (const [lineId, quantity] of want) {
          const line = po.lines.find((i) => i.id === lineId)!;
          const received = got.find((g) => g.purchaseOrderLineId === lineId)?._sum.quantity ?? ZERO;
          const pending = line.quantity.sub(received);
          if (quantity.gt(pending))
            throw new ConflictException(
              pending.lte(0) ? `${line.itemName} on ${po.poNo} is already fully received.` : `Only ${dec(pending)} ${line.unit} of ${line.itemName} is still pending on ${po.poNo}.`,
            );
          const item = await this.resolveItem(tx, user.organizationId, line.itemName, line.unit);
          lines.push({ itemId: item.id, quantity, materialRequestItemId: line.materialRequestItemId, purchaseOrderLineId: line.id });
        }
        return this.insertEntry(
          tx,
          user,
          { ...dto, supplier: po.vendor.name, vendorId: po.vendorId, type: 'RECEIPT', projectId: po.projectId, date, materialRequestId: po.materialRequestId, purchaseOrderId: po.id },
          lines,
        );
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.attachments.link(user, 'stockEntryId', saved.id, dto.attachmentIds);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} against ${po.poNo}`);
    return this.get(user, saved.id);
  }

  /** Issue material at site; each quantity may not exceed the project's stock. `link` ties the issue to a maintenance job card. */
  async issue(user: RequestUser, dto: CreateIssueDto, link?: { maintenanceJobId: string }): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanKeepStock(user, dto.projectId);
    const date = this.entryDate(dto.date);
    if (dto.activityId) {
      const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, projectId: dto.projectId }, select: { id: true } });
      if (!activity) throw new BadRequestException('The activity is not part of this project');
    }
    const issuedTo = dto.workOrderId ? dto.issuedTo || (await assertOpenWorkOrder(this.prisma, user.organizationId, dto.workOrderId, dto.projectId)).vendorName : dto.issuedTo;
    if (!issuedTo) throw new BadRequestException('Say who took the material');
    const items = await this.prisma.item.findMany({ where: { id: { in: dto.lines.map((l) => l.itemId) }, organizationId: user.organizationId }, select: { id: true, name: true, unit: true } });
    const lines = this.mergeLines(
      dto.lines.map((l) => {
        const item = items.find((i) => i.id === l.itemId);
        if (!item) throw new BadRequestException('Unknown item');
        return { itemId: item.id, quantity: this.parseQty(l.quantity, item.name) };
      }),
    );
    let before = new Map<string, Decimal>();
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        before = await this.balancesOf(tx, dto.projectId, lines.map((l) => l.itemId));
        for (const l of lines) {
          const have = before.get(l.itemId)!;
          if (l.quantity.gt(have)) {
            const item = items.find((i) => i.id === l.itemId)!;
            throw new ConflictException(have.lte(0) ? `${item.name} is out of stock at this project.` : `Only ${dec(have)} ${item.unit} of ${item.name} is in stock at this project.`);
          }
        }
        return this.insertEntry(tx, user, { ...dto, ...link, issuedTo, type: 'ISSUE', date }, lines.map((l) => ({ ...l, quantity: l.quantity.neg() })));
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} to ${issuedTo}`);
    await this.alertLowStock(user, dto.projectId, before, saved.id, saved.entryNo);
    return this.get(user, saved.id);
  }

  /** Opening stock or a count correction (approvers). A negative line may not take the balance below zero. */
  async adjust(user: RequestUser, dto: CreateAdjustmentDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanAdjustStock(user, dto.projectId);
    const date = this.entryDate(dto.date);
    const known = await this.prisma.item.findMany({ where: { id: { in: dto.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])) }, organizationId: user.organizationId }, select: { id: true, name: true, unit: true } });
    for (const l of dto.lines) if (l.itemId && !known.some((k) => k.id === l.itemId)) throw new BadRequestException('Unknown item');
    let before = new Map<string, Decimal>();
    const names = new Map<string, { name: string; unit: string }>(known.map((k) => [k.id, k]));
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        const raw: Line[] = [];
        for (const l of dto.lines) {
          const item = l.itemId ? known.find((k) => k.id === l.itemId)! : await this.resolveItem(tx, user.organizationId, l.itemName!, l.unit!);
          names.set(item.id, item);
          raw.push({ itemId: item.id, quantity: this.parseQty(l.quantity, item.name, true) });
        }
        const lines = this.mergeLines(raw);
        if (!lines.length) throw new BadRequestException('The lines cancel out; nothing to adjust');
        before = await this.balancesOf(tx, dto.projectId, lines.map((l) => l.itemId));
        for (const l of lines) {
          const after = before.get(l.itemId)!.add(l.quantity);
          if (after.lt(0)) {
            const item = names.get(l.itemId)!;
            throw new ConflictException(`Only ${dec(before.get(l.itemId))} ${item.unit} of ${item.name} is in stock; the adjustment would take it below zero.`);
          }
        }
        return this.insertEntry(tx, user, { ...dto, type: 'ADJUSTMENT', date }, lines);
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo}: ${dto.remarks}`);
    await this.alertLowStock(user, dto.projectId, before, saved.id, saved.entryNo);
    return this.get(user, saved.id);
  }

  /** Delete a wrong entry (approvers). Refused when the stock it brought in has already been issued. */
  async remove(user: RequestUser, id: string) {
    const row = await this.prisma.stockEntry.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: { lines: { include: { item: { select: { name: true, unit: true } } } } } });
    if (!row) throw new NotFoundException('Stock entry not found');
    await this.access.assertCanAdjustStock(user, row.projectId);
    if (row.type === 'TRANSFER_OUT') {
      const received = await this.prisma.stockEntry.findUnique({ where: { transferOutId: row.id }, select: { entryNo: true } });
      if (received) throw new ConflictException(`${row.entryNo} was received as ${received.entryNo}; delete that first`);
    }
    if (row.subcontractBillId) {
      const bill = await this.prisma.subcontractBill.findUnique({ where: { id: row.subcontractBillId }, select: { status: true, billNo: true, workOrder: { select: { woNo: true } } } });
      if (bill?.status === 'APPROVED') throw new ConflictException(`${row.entryNo} was recovered in ${subBillLabel(bill.workOrder.woNo, bill.billNo, false)}; it cannot be deleted`);
    }
    const itemIds = [...new Set(row.lines.map((l) => l.itemId))];
    let before = new Map<string, Decimal>();
    await this.inLock(user.organizationId, async (tx) => {
      before = await this.balancesOf(tx, row.projectId, itemIds);
      for (const itemId of itemIds) {
        const own = row.lines.filter((l) => l.itemId === itemId).reduce((s, l) => s.add(l.quantity), ZERO);
        const after = before.get(itemId)!.sub(own);
        if (after.lt(0)) {
          const item = row.lines.find((l) => l.itemId === itemId)!.item;
          throw new ConflictException(`Deleting ${row.entryNo} would leave ${item.name} at ${dec(after)} ${item.unit}: part of it has already been issued.`);
        }
      }
      await this.assertNotBilled(tx, row.entryNo, row.lines);
      await tx.stockEntry.delete({ where: { id } });
    });
    await this.audit.log(user, 'STOCK', id, 'DELETED', row.entryNo);
    await this.alertLowStock(user, row.projectId, before, id, row.entryNo);
    return { ok: true };
  }

  /**
   * QA/QC's check of material received (v4 item 48): accepted, partly accepted (with the rejected quantity per line) or
   * rejected. It can be recorded again to correct it. The store balance is not changed: rejected material goes back to
   * the supplier with a return to vendor.
   */
  async checkGrn(user: RequestUser, id: string, dto: CheckGrnDto): Promise<StockEntryDto> {
    const row = await this.prisma.stockEntry.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: { lines: { include: { item: { select: { name: true, unit: true } } } } } });
    if (!row) throw new NotFoundException('Stock entry not found');
    if (row.type !== 'RECEIPT') throw new BadRequestException('Only goods received (GRNs) are checked by QA/QC');
    await this.access.assertCanCheckGrn(user, row.projectId);
    const note = blank(dto.note);
    if (dto.status !== 'ACCEPTED' && !note) throw new BadRequestException('Say what was wrong with the material');
    const rejected = new Map<string, Decimal>();
    if (dto.status === 'REJECTED') for (const l of row.lines) rejected.set(l.id, l.quantity);
    if (dto.status === 'PARTLY_ACCEPTED') {
      for (const r of dto.lines ?? []) {
        const line = row.lines.find((l) => l.id === r.lineId);
        if (!line) throw new BadRequestException('A line is not part of this GRN');
        const q = r.rejectedQty.trim() === '0' ? ZERO : this.parseQty(r.rejectedQty, line.item.name);
        if (q.gt(line.quantity)) throw new BadRequestException(`${line.item.name}: more rejected than received (${dec(line.quantity)} ${line.item.unit})`);
        rejected.set(line.id, q);
      }
      const some = [...rejected.values()].some((q) => q.gt(0));
      const all = row.lines.every((l) => rejected.get(l.id)?.eq(l.quantity));
      if (!some) throw new BadRequestException('Enter the quantity rejected, or mark it accepted');
      if (all) throw new BadRequestException('Everything was rejected: mark it rejected');
    }
    await this.prisma.$transaction([
      this.prisma.stockEntry.update({ where: { id }, data: { qcStatus: dto.status, qcAt: new Date(), qcById: user.id, qcNote: note } }),
      ...row.lines.map((l) => this.prisma.stockTxn.update({ where: { id: l.id }, data: { rejectedQty: rejected.get(l.id) ?? ZERO } })),
    ]);
    await this.audit.log(user, 'STOCK', id, `QC_${dto.status}`, note);
    return this.get(user, id);
  }

  /** A GRN against a PO cannot be deleted when vendor bills (not rejected) already count on what it received. */
  private async assertNotBilled(tx: Tx, entryNo: string, lines: { purchaseOrderLineId: string | null; quantity: Decimal }[]) {
    const poLineIds = [...new Set(lines.map((l) => l.purchaseOrderLineId).filter((x): x is string => !!x))];
    if (!poLineIds.length) return;
    const [received, billed] = await Promise.all([
      tx.stockTxn.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: poLineIds } }, _sum: { quantity: true } }),
      tx.vendorBillLine.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: poLineIds }, bill: { status: { not: 'REJECTED' } } }, _sum: { quantity: true } }),
    ]);
    for (const lineId of poLineIds) {
      const own = lines.filter((l) => l.purchaseOrderLineId === lineId).reduce((s, l) => s.add(l.quantity), ZERO);
      const left = (received.find((r) => r.purchaseOrderLineId === lineId)?._sum.quantity ?? ZERO).sub(own);
      const onBills = billed.find((b) => b.purchaseOrderLineId === lineId)?._sum.quantity ?? ZERO;
      if (onBills.gt(left)) throw new ConflictException(`${entryNo} cannot be deleted: vendor bills already count on what it received. Reject or correct the bill first.`);
    }
  }

  /* ---------- transfers, returns and counts ---------- */

  /** Items of the organisation by id, refusing unknown ones; quantities parsed and merged per item. */
  private async itemLines(user: RequestUser, raw: { itemId: string; quantity: string }[]) {
    const items = await this.prisma.item.findMany({ where: { id: { in: raw.map((l) => l.itemId) }, organizationId: user.organizationId }, select: { id: true, name: true, unit: true } });
    const lines = this.mergeLines(
      raw.map((l) => {
        const item = items.find((i) => i.id === l.itemId);
        if (!item) throw new BadRequestException('Unknown item');
        return { itemId: item.id, quantity: this.parseQty(l.quantity, item.name) };
      }),
    );
    return { items, lines };
  }

  /** Inside the lock: refuse lines that take more than the project holds; returns the balances before. */
  private async assertInStock(tx: Tx, projectId: string, lines: Line[], items: { id: string; name: string; unit: string }[]) {
    const before = await this.balancesOf(tx, projectId, lines.map((l) => l.itemId));
    for (const l of lines) {
      const have = before.get(l.itemId)!;
      if (l.quantity.gt(have)) {
        const item = items.find((i) => i.id === l.itemId)!;
        throw new ConflictException(have.lte(0) ? `${item.name} is out of stock at this project.` : `Only ${dec(have)} ${item.unit} of ${item.name} is in stock at this project.`);
      }
    }
    return before;
  }

  /** Send material to another project's store. It leaves this project now and is in transit until received there. */
  async transfer(user: RequestUser, dto: CreateTransferDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanKeepStock(user, dto.projectId);
    if (dto.toProjectId === dto.projectId) throw new BadRequestException('Pick a different project to send the material to');
    const to = await this.prisma.project.findFirst({ where: { id: dto.toProjectId, organizationId: user.organizationId }, select: { name: true, status: true } });
    if (!to) throw new BadRequestException('The receiving project is not in this organisation');
    if (to.status === 'CLOSED') throw new BadRequestException(`${to.name} is closed`);
    const date = this.entryDate(dto.date);
    const { items, lines } = await this.itemLines(user, dto.lines);
    let before = new Map<string, Decimal>();
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        before = await this.assertInStock(tx, dto.projectId, lines, items);
        return this.insertEntry(tx, user, { ...dto, issuedTo: to.name, type: 'TRANSFER_OUT', date }, lines.map((l) => ({ ...l, quantity: l.quantity.neg() })));
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} to ${to.name}`);
    await this.alertLowStock(user, dto.projectId, before, saved.id, saved.entryNo);
    return this.get(user, saved.id);
  }

  /** Transfers sent to projects the user can see and not received yet. */
  async incomingTransfers(user: RequestUser, q: IncomingTransfersQuery): Promise<StockEntryDto[]> {
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const rows = await this.prisma.stockEntry.findMany({
      where: { organizationId: user.organizationId, type: 'TRANSFER_OUT', transferIn: null, toProject: this.access.projectWhere(user), ...(q.projectId ? { toProjectId: q.projectId } : {}) },
      include,
      orderBy: [{ date: 'asc' }, { entryNo: 'asc' }],
      take: 200,
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Receive a transfer at the project it was sent to: the same items and quantities come into stock there. */
  async receiveTransfer(user: RequestUser, transferOutId: string, dto: ReceiveTransferDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    const out = await this.prisma.stockEntry.findFirst({ where: { id: transferOutId, organizationId: user.organizationId, type: 'TRANSFER_OUT' }, include: { lines: true, project: { select: { name: true } } } });
    if (!out || !out.toProjectId) throw new NotFoundException('Transfer not found');
    await this.access.assertCanKeepStock(user, out.toProjectId);
    const date = this.entryDate(dto.date);
    if (date < out.date) throw new BadRequestException('It cannot be received before it was sent');
    const lines = this.mergeLines(out.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity.neg() })));
    const saved = await this.createGuarded(user, dto.id, async () => {
      try {
        return await this.inLock(user.organizationId, async (tx) => {
          const already = await tx.stockEntry.findUnique({ where: { transferOutId: out.id }, select: { entryNo: true } });
          if (already) throw new ConflictException(`${out.entryNo} was already received as ${already.entryNo}`);
          return this.insertEntry(
            tx,
            user,
            { id: dto.id, type: 'TRANSFER_IN', projectId: out.toProjectId!, date, transferOutId: out.id, supplier: out.project.name, challanNo: out.challanNo, vehicleNo: out.vehicleNo, remarks: dto.remarks },
            lines,
          );
        });
      } catch (e) {
        if (isUniqueViolation(e) && !dto.id) throw new ConflictException(`${out.entryNo} was already received`);
        throw e;
      }
    });
    if ('existing' in saved) return this.get(user, saved.id);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} receiving ${out.entryNo} from ${out.project.name}`);
    return this.get(user, saved.id);
  }

  /** Send material back to the supplier (damaged, wrong grade, excess). */
  async returnToVendor(user: RequestUser, dto: CreateVendorReturnDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanKeepStock(user, dto.projectId);
    const date = this.entryDate(dto.date);
    const vendor = await this.vendors.resolve(user, dto.vendorId, dto.supplier);
    if (!vendor?.name) throw new BadRequestException('Say which supplier the material goes back to');
    const { items, lines } = await this.itemLines(user, dto.lines);
    let before = new Map<string, Decimal>();
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        before = await this.assertInStock(tx, dto.projectId, lines, items);
        return this.insertEntry(tx, user, { ...dto, supplier: vendor.name, vendorId: vendor.vendorId ?? null, type: 'RETURN_TO_VENDOR', date }, lines.map((l) => ({ ...l, quantity: l.quantity.neg() })));
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.attachments.link(user, 'stockEntryId', saved.id, dto.attachmentIds);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} back to ${vendor.name}`);
    await this.alertLowStock(user, dto.projectId, before, saved.id, saved.entryNo);
    return this.get(user, saved.id);
  }

  /** Issued material that came back unused: it returns to stock and comes off the project's material cost. */
  async returnFromSite(user: RequestUser, dto: CreateSiteReturnDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanKeepStock(user, dto.projectId);
    const date = this.entryDate(dto.date);
    if (dto.activityId) {
      const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, projectId: dto.projectId }, select: { id: true } });
      if (!activity) throw new BadRequestException('The activity is not part of this project');
    }
    const { items, lines } = await this.itemLines(user, dto.lines);
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        // At most what was issued at this project, net of earlier returns.
        const moved = await tx.stockTxn.groupBy({ by: ['itemId'], where: { projectId: dto.projectId, itemId: { in: lines.map((l) => l.itemId) }, type: { in: ['ISSUE', 'RETURN_FROM_SITE'] } }, _sum: { quantity: true } });
        for (const l of lines) {
          const out = (moved.find((m) => m.itemId === l.itemId)?._sum.quantity ?? ZERO).neg();
          if (l.quantity.gt(out)) {
            const item = items.find((i) => i.id === l.itemId)!;
            throw new ConflictException(out.lte(0) ? `No ${item.name} has been issued at this project.` : `Only ${dec(out)} ${item.unit} of ${item.name} is out on site.`);
          }
        }
        return this.insertEntry(tx, user, { ...dto, type: 'RETURN_FROM_SITE', date }, lines);
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} from ${dto.issuedTo}`);
    return this.get(user, saved.id);
  }

  /**
   * Physical stock count (approvers): each counted quantity is set against the current balance and the differences
   * are posted as one adjustment (`entry` is null when every count matched).
   */
  async postCount(user: RequestUser, dto: PostCountDto): Promise<StockCountResultDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return { counted: dto.lines.length, entry: existing };
    await this.access.assertCanAdjustStock(user, dto.projectId);
    const date = this.entryDate(dto.date);
    if (new Set(dto.lines.map((l) => l.itemId)).size !== dto.lines.length) throw new BadRequestException('An item is counted twice');
    const items = await this.prisma.item.findMany({ where: { id: { in: dto.lines.map((l) => l.itemId) }, organizationId: user.organizationId }, select: { id: true, name: true, unit: true } });
    const counted = dto.lines.map((l) => {
      const item = items.find((i) => i.id === l.itemId);
      if (!item) throw new BadRequestException('Unknown item');
      const q = D(l.countedQty);
      if (!q.isFinite() || q.isNegative() || q.decimalPlaces() > 3) throw new BadRequestException(`${item.name}: count a quantity of zero or more, with at most 3 decimals`);
      return { item, q };
    });
    let before = new Map<string, Decimal>();
    let differences = 0;
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        before = await this.balancesOf(tx, dto.projectId, counted.map((c) => c.item.id));
        const lines: Line[] = counted.map((c) => ({ itemId: c.item.id, quantity: c.q.sub(before.get(c.item.id)!) })).filter((l) => !l.quantity.isZero());
        differences = lines.length;
        if (!lines.length) return null;
        const note = `Physical stock count: ${counted.length} item${counted.length === 1 ? '' : 's'} counted, ${lines.length} differ${lines.length === 1 ? 's' : ''}${dto.remarks?.trim() ? `. ${dto.remarks.trim()}` : ''}`;
        return this.insertEntry(tx, user, { id: dto.id, type: 'ADJUSTMENT', projectId: dto.projectId, date, remarks: note }, lines);
      }).then((r) => r ?? { id: '', entryNo: '' }),
    );
    if ('existing' in saved) return { counted: counted.length, entry: await this.get(user, saved.id) };
    if (!differences) {
      await this.audit.log(user, 'PROJECT', dto.projectId, 'STOCK_COUNTED', `${counted.length} items counted, no difference`);
      return { counted: counted.length, entry: null };
    }
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo}: stock count, ${differences} differences`);
    await this.alertLowStock(user, dto.projectId, before, saved.id, saved.entryNo);
    return { counted: counted.length, entry: await this.get(user, saved.id) };
  }

  /**
   * Stock valuation and ageing: each balance at the item master rate, aged first in, first out (the stock on hand is
   * taken to be the latest that came in: GRNs, transfers in, returns from site and positive adjustments).
   */
  async valuation(user: RequestUser, q: StockValuationQuery): Promise<StockValuationDto> {
    if (!canManageStore(user.roleKey) && !canViewCost(user.roleKey)) throw new ForbiddenException('Stock value is for store managers, approvers and accounts');
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const asOf = new Date().toISOString().slice(0, 10);
    const today = parseDate(asOf).getTime();
    const balances = (await this.buildBalances(user.organizationId, this.access.projectWhere(user), q.projectId)).filter((b) => Number(b.balance) > 0);
    const projectIds = [...new Set(balances.map((b) => b.projectId))];
    const [inflows, items] = await Promise.all([
      projectIds.length
        ? this.prisma.stockTxn.findMany({
            where: { organizationId: user.organizationId, projectId: { in: projectIds }, itemId: { in: [...new Set(balances.map((b) => b.itemId))] }, quantity: { gt: 0 } },
            select: { projectId: true, itemId: true, date: true, quantity: true },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
          })
        : [],
      this.prisma.item.findMany({ where: { id: { in: [...new Set(balances.map((b) => b.itemId))] } }, select: { id: true, rate: true } }),
    ]);
    const rateOf = new Map(items.map((i) => [i.id, i.rate]));
    const byKey = new Map<string, { date: Date; quantity: Decimal }[]>();
    for (const t of inflows) {
      const k = key(t.projectId, t.itemId);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(t);
    }
    let totalValue = ZERO;
    const ageingValue = [ZERO, ZERO, ZERO, ZERO];
    let unpriced = 0;
    const rows = balances.map((b) => {
      const rate = rateOf.get(b.itemId) ?? null;
      const balance = D(b.balance);
      const ageing = [ZERO, ZERO, ZERO, ZERO];
      let left = balance;
      let oldestDays: number | null = null;
      for (const t of byKey.get(key(b.projectId, b.itemId)) ?? []) {
        if (left.lte(0)) break;
        const take = Prisma.Decimal.min(left, t.quantity);
        const days = Math.max(0, Math.floor((today - t.date.getTime()) / 86_400_000));
        ageing[stockAgeingBucket(days)] = ageing[stockAgeingBucket(days)].add(take);
        oldestDays = days;
        left = left.sub(take);
      }
      // Stock not covered by any inflow (negative history) counts as the oldest bucket.
      if (left.gt(0)) ageing[3] = ageing[3].add(left);
      const value = rate ? balance.mul(rate).toDecimalPlaces(2) : ZERO;
      if (!rate) unpriced += 1;
      totalValue = totalValue.add(value);
      if (rate) ageing.forEach((qty, i) => (ageingValue[i] = ageingValue[i].add(qty.mul(rate))));
      return {
        projectId: b.projectId,
        projectName: b.projectName,
        itemId: b.itemId,
        itemName: b.itemName,
        unit: b.unit,
        category: b.category,
        balance: b.balance,
        rate: money(rate),
        value: money(value)!,
        ageingQty: ageing.map((a) => dec(a)!),
        oldestDays,
      };
    });
    rows.sort((a, b) => Number(b.value) - Number(a.value) || a.itemName.localeCompare(b.itemName));
    return { asOf, rows, totalValue: money(totalValue)!, ageingValue: ageingValue.map((v) => money(v.toDecimalPlaces(2))!), unpricedItems: unpriced };
  }

  /* ---------- balances ---------- */

  private async buildBalances(organizationId: string, project: Prisma.ProjectWhereInput, projectId?: string, itemId?: string): Promise<StockBalanceDto[]> {
    const scope = { organizationId, project, ...(projectId ? { projectId } : {}), ...(itemId ? { itemId } : {}) };
    const [sums, mins] = await Promise.all([
      this.prisma.stockTxn.groupBy({ by: ['projectId', 'itemId', 'type'], where: scope, _sum: { quantity: true }, _max: { date: true } }),
      this.prisma.stockMinLevel.findMany({ where: scope }),
    ]);
    type Agg = { projectId: string; itemId: string; received: Decimal; issued: Decimal; adjusted: Decimal; transferred: Decimal; last: Date | null; min: Decimal | null };
    const aggs = new Map<string, Agg>();
    const agg = (p: string, i: string) => {
      const k = key(p, i);
      let a = aggs.get(k);
      if (!a) aggs.set(k, (a = { projectId: p, itemId: i, received: ZERO, issued: ZERO, adjusted: ZERO, transferred: ZERO, last: null, min: null }));
      return a;
    };
    for (const s of sums) {
      const a = agg(s.projectId, s.itemId);
      const q = s._sum.quantity ?? ZERO;
      if (s.type === 'RECEIPT' || s.type === 'RETURN_TO_VENDOR') a.received = a.received.add(q);
      else if (s.type === 'ISSUE' || s.type === 'RETURN_FROM_SITE') a.issued = a.issued.sub(q);
      else if (s.type === 'TRANSFER_IN' || s.type === 'TRANSFER_OUT') a.transferred = a.transferred.add(q);
      else a.adjusted = a.adjusted.add(q);
      if (s._max.date && (!a.last || s._max.date > a.last)) a.last = s._max.date;
    }
    for (const m of mins) agg(m.projectId, m.itemId).min = m.minQty;
    if (!aggs.size) return [];
    const all = [...aggs.values()];
    const [items, projects] = await Promise.all([
      this.prisma.item.findMany({ where: { id: { in: [...new Set(all.map((a) => a.itemId))] } }, select: { id: true, name: true, unit: true, category: true } }),
      this.prisma.project.findMany({ where: { id: { in: [...new Set(all.map((a) => a.projectId))] } }, select: { id: true, name: true } }),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    return all.map((a) => {
      const item = itemById.get(a.itemId)!;
      const balance = a.received.sub(a.issued).add(a.adjusted).add(a.transferred);
      return {
        projectId: a.projectId,
        projectName: projectById.get(a.projectId)?.name ?? '',
        itemId: a.itemId,
        itemName: item.name,
        unit: item.unit,
        category: item.category,
        received: dec(a.received)!,
        issued: dec(a.issued)!,
        adjusted: dec(a.adjusted)!,
        transferred: dec(a.transferred)!,
        balance: dec(balance)!,
        minQty: a.min && a.min.gt(0) ? dec(a.min) : null,
        low: isLowStock(balance.toString(), a.min?.toString()),
        lastMovement: dateOnly(a.last),
      };
    });
  }

  async balances(user: RequestUser, q: ListStockBalancesQuery): Promise<Paginated<StockBalanceDto>> {
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    let rows = await this.buildBalances(user.organizationId, this.access.projectWhere(user), q.projectId);
    const words = searchWords(q.q).map((w) => w.toLowerCase());
    if (words.length) rows = rows.filter((r) => words.every((w) => [r.itemName, r.category ?? '', r.projectName].some((s) => s.toLowerCase().includes(w))));
    if (q.lowOnly) rows = rows.filter((r) => r.low);
    if (q.inStock) rows = rows.filter((r) => Number(r.balance) > 0);
    const sortBy: StockBalanceSortField = q.sortBy ?? 'item';
    const dir = (q.sortOrder ?? (BALANCE_DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc')) === 'asc' ? 1 : -1;
    const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    const primary: Record<StockBalanceSortField, (a: StockBalanceDto, b: StockBalanceDto) => number> = {
      item: (a, b) => text(a.itemName, b.itemName),
      project: (a, b) => text(a.projectName, b.projectName),
      balance: (a, b) => Number(a.balance) - Number(b.balance),
      received: (a, b) => Number(a.received) - Number(b.received),
      issued: (a, b) => Number(a.issued) - Number(b.issued),
      lastMovement: (a, b) => (a.lastMovement ?? '').localeCompare(b.lastMovement ?? ''),
    };
    rows.sort((a, b) => dir * primary[sortBy](a, b) || text(a.itemName, b.itemName) || text(a.projectName, b.projectName));
    const args = pageArgs(q);
    return paginated(rows.slice(args.skip, args.skip + args.take), rows.length, args);
  }

  async setMinLevel(user: RequestUser, dto: SetMinLevelDto): Promise<StockBalanceDto> {
    await this.access.assertCanManageStore(user, dto.projectId);
    const item = await this.prisma.item.findFirst({ where: { id: dto.itemId, organizationId: user.organizationId }, select: { id: true, name: true } });
    if (!item) throw new NotFoundException('Item not found');
    const min = dto.minQty === null || dto.minQty === undefined || dto.minQty === '' ? ZERO : D(dto.minQty);
    if (min.lt(0) || min.decimalPlaces() > 3) throw new BadRequestException('The minimum must be zero or more, with at most 3 decimals');
    if (min.isZero()) await this.prisma.stockMinLevel.deleteMany({ where: { projectId: dto.projectId, itemId: dto.itemId } });
    else
      await this.prisma.stockMinLevel.upsert({
        where: { projectId_itemId: { projectId: dto.projectId, itemId: dto.itemId } },
        update: { minQty: min, updatedById: user.id },
        create: { organizationId: user.organizationId, projectId: dto.projectId, itemId: dto.itemId, minQty: min, updatedById: user.id },
      });
    await this.audit.log(user, 'STOCK_MIN_LEVEL', `${dto.projectId}:${dto.itemId}`, 'UPDATED', `${item.name}: ${min.isZero() ? 'no minimum' : dec(min)}`);
    const [row] = await this.buildBalances(user.organizationId, this.access.projectWhere(user), dto.projectId, dto.itemId);
    return row;
  }

  /** Approved requests with something still to receive, for the GRN form. */
  async receivable(user: RequestUser, q: ReceivableQuery): Promise<ReceivableRequestDto[]> {
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const rows = await this.prisma.materialRequest.findMany({
      where: { ...this.access.submissionWhere(user), status: 'APPROVED', ...(q.projectId ? { projectId: q.projectId } : {}) },
      include: { project: { select: { name: true } }, items: { orderBy: { sortOrder: 'asc' }, include: { stockTxns: { select: { quantity: true } } } } },
      orderBy: [{ requiredDate: 'asc' }, { requestNo: 'asc' }],
      take: 200,
    });
    return rows
      .map((r) => ({
        id: r.id,
        requestNo: r.requestNo,
        projectId: r.projectId,
        projectName: r.project.name,
        requiredDate: dateOnly(r.requiredDate)!,
        priority: r.priority,
        lines: r.items.map((i) => {
          const received = i.stockTxns.reduce((s, t) => s.add(t.quantity), ZERO);
          const pending = i.quantity.sub(received);
          return {
            materialRequestItemId: i.id,
            itemName: i.itemName,
            specification: i.specification,
            unit: i.unit,
            requested: dec(i.quantity)!,
            received: dec(received)!,
            pending: dec(pending.gt(0) ? pending : ZERO)!,
          };
        }),
      }))
      .filter((r) => r.lines.some((l) => Number(l.pending) > 0));
  }

  /* ---------- item master ---------- */

  async listItems(user: RequestUser, q: ListItemsQuery): Promise<Paginated<ItemDto>> {
    const where: Prisma.ItemWhereInput = { organizationId: user.organizationId };
    const words = searchWords(q.q);
    if (words.length) where.AND = words.map((w) => ({ OR: [{ name: ilike(w) }, { category: ilike(w) }, { unit: ilike(w) }] }));
    const sortBy = q.sortBy ?? 'name';
    const order = q.sortOrder ?? (sortBy === 'createdAt' ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.item.findMany({ where, orderBy: [...ITEM_ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.item.count({ where }),
    ]);
    const used = rows.length
      ? await this.prisma.stockTxn.groupBy({ by: ['itemId', 'projectId'], where: { itemId: { in: rows.map((r) => r.id) } } })
      : [];
    return paginated(
      rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, category: r.category, rate: money(r.rate), projectCount: used.filter((u) => u.itemId === r.id).length, createdAt: iso(r.createdAt)! })),
      total,
      args,
    );
  }

  private rate(v: string | null | undefined): Prisma.Decimal | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = new Prisma.Decimal(v);
    if (d.isNegative()) throw new BadRequestException('Rate cannot be negative');
    return d.toDecimalPlaces(2);
  }

  private async assertItemUnique(organizationId: string, name: string, unit: string, excludeId?: string) {
    const dup = await this.prisma.item.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' }, unit: { equals: unit, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`${name} (${unit}) is already in the item master`);
  }

  private async getItem(user: RequestUser, id: string): Promise<ItemDto> {
    const r = await this.prisma.item.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Item not found');
    const used = await this.prisma.stockTxn.groupBy({ by: ['projectId'], where: { itemId: id } });
    return { id: r.id, name: r.name, unit: r.unit, category: r.category, rate: money(r.rate), projectCount: used.length, createdAt: iso(r.createdAt)! };
  }

  async createItem(user: RequestUser, dto: CreateItemDto): Promise<ItemDto> {
    await this.access.assertCanManageStore(user);
    await this.assertItemUnique(user.organizationId, dto.name, dto.unit);
    try {
      const row = await this.prisma.item.create({ data: { organizationId: user.organizationId, name: dto.name, unit: dto.unit, category: blank(dto.category), rate: this.rate(dto.rate) ?? null } });
      await this.audit.log(user, 'ITEM', row.id, 'CREATED', `${row.name} (${row.unit})`);
      return this.getItem(user, row.id);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${dto.name} (${dto.unit}) is already in the item master`);
      throw e;
    }
  }

  async updateItem(user: RequestUser, id: string, dto: UpdateItemDto): Promise<ItemDto> {
    await this.access.assertCanManageStore(user);
    const row = await this.prisma.item.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Item not found');
    const name = dto.name ?? row.name;
    const unit = dto.unit ?? row.unit;
    if (dto.unit !== undefined && dto.unit.toLowerCase() !== row.unit.toLowerCase() && (await this.prisma.stockTxn.count({ where: { itemId: id } })) > 0)
      throw new ConflictException('The unit cannot change once the item has stock movements');
    await this.assertItemUnique(user.organizationId, name, unit, id);
    try {
      await this.prisma.item.update({ where: { id }, data: { name, unit, ...(dto.category !== undefined ? { category: blank(dto.category) } : {}), ...(dto.rate !== undefined ? { rate: this.rate(dto.rate) } : {}) } });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`${name} (${unit}) is already in the item master`);
      throw e;
    }
    await this.audit.log(user, 'ITEM', id, 'UPDATED', `${name} (${unit})`);
    return this.getItem(user, id);
  }

  async removeItem(user: RequestUser, id: string) {
    await this.access.assertCanManageStore(user);
    const row = await this.prisma.item.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Item not found');
    if ((await this.prisma.stockTxn.count({ where: { itemId: id } })) > 0) throw new ConflictException(`${row.name} has stock movements and cannot be deleted`);
    await this.prisma.item.delete({ where: { id } });
    await this.audit.log(user, 'ITEM', id, 'DELETED', `${row.name} (${row.unit})`);
    return { ok: true };
  }
}

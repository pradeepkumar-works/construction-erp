import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, StockEntryType } from '@prisma/client';
import { findMasterItem, masterCandidates } from './item-master';
import {
  LEGACY_STOCK_ENTRY_TYPES,
  STOCK_ENTRY_PREFIX,
  canManageStore,
  canViewCost,
  stockAgeingBucket,
  type StockCountResultDto,
  type StockValuationDto,
  type StockAdjustmentReason,
  SUBMISSION_STATUS_LABELS,
  crossesBelowMin,
  isLowStock,
  type ItemDto,
  type ItemSortField,
  type Paginated,
  type ReceivableRequestDto,
  type SortOrder,
  type StockBalanceDto,
  type MaterialRequestStockDto,
  type IndentCheckDto,
  boqAllowance,
  indentLineCheck,
  indentLineFlagged,
  canKeepStock,
  canSeeStores,
  type StockDestinationDto,
  type StoreSummaryDto,
  type StockBalanceSortField,
  type StockEntryDto,
  type StockEntrySortField,
  subBillLabel,
  type PipeMaterial,
  masterItemFor,
  duplicateGroups,
  itemKey,
  normUnit,
  type ItemDuplicateGroupDto,
  RECEIPT_BILL_WITHIN_DAYS,
  RECEIPT_CHECK_WITHIN_DAYS,
  type ReceiptWait,
} from '@erp/shared';
import { todayIn } from '../notifications/time';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { VendorsService } from '../vendors/vendors.service';
import { assertOpenWorkOrder } from '../subcontracts/work-orders.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { toOrderOf } from '../purchasing/purchase-math';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import {
  CheckGrnDto,
  CoverRequestDto,
  CreateAdjustmentDto,
  CreateFuelIssueDto,
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
  MergeItemsDto,
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
  workElement: { select: { code: true, name: true } },
  workOrder: { select: { woNo: true } },
  toProject: { select: { name: true } },
  transferIn: { select: { id: true, entryNo: true } },
  transferOut: { select: { entryNo: true, project: { select: { name: true } } } },
  lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { item: { select: { name: true, unit: true, category: true } } } },
  qcBy: { select: { fullName: true } },
  equipment: { select: { code: true } },
  attachments: { select: ATTACHMENT_FIELDS },
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
  /** Receipts: the supplier's dispatch note it was filled from (v6 item 105) */
  supplierDispatchId?: string | null;
  supplier?: string | null;
  vendorId?: string | null;
  challanNo?: string | null;
  vehicleNo?: string | null;
  issuedTo?: string | null;
  activityId?: string | null;
  workElementId?: string | null;
  workOrderId?: string | null;
  toProjectId?: string | null;
  transferOutId?: string | null;
  remarks?: string | null;
  /** Adjustments: why (v5 item 92) */
  adjustmentReason?: StockAdjustmentReason | null;
  /** Issues: spares for this maintenance job card */
  maintenanceJobId?: string | null;
  /** Fuel issues: the machine and its meter (v5 item 93) */
  equipmentId?: string | null;
  meterReading?: Decimal | null;
}

/** What an issue is for besides the site: a job card's spares, or fuel into a machine. */
type IssueLink = { maintenanceJobId?: string; equipmentId?: string; meterReading?: Decimal | null };

const blank = (s: string | null | undefined) => s?.trim() || null;
const pipeFields = (r: { pipeDiameterMm: number | null; pipeMaterial: PipeMaterial | null; kgPerMetre: Decimal | null }) => ({ pipeDiameterMm: r.pipeDiameterMm, pipeMaterial: r.pipeMaterial, kgPerMetre: r.kgPerMetre ? r.kgPerMetre.toString() : null });
const key = (projectId: string, itemId: string) => `${projectId}|${itemId}`;

const sqlName = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Every column that points at an item, and the other columns of each unique key it is part of (read from the schema). */
const ITEM_REFS = Prisma.dmmf.datamodel.models.flatMap((m) =>
  m.fields
    .filter((f) => f.kind === 'object' && f.type === 'Item' && f.relationFromFields?.length === 1)
    .map((f) => {
      const column = f.relationFromFields![0];
      return { table: m.dbName ?? m.name, column, uniqueWith: m.uniqueFields.filter((u) => u.includes(column)).map((u) => u.filter((c) => c !== column)) };
    }),
);
/** Settings per item (a minimum, a norm): where both merged items have one, the kept item's stands. */
const ITEM_SETTINGS = new Set(['StockMinLevel', 'MaterialNorm', 'ActivityMaterialNorm', 'OmChemicalNorm']);
const ITEM_REF_WORDS: Record<string, string> = { SubcontractBillMaterial: "subcontractor bill's material recovery" };

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
    private undo: UndoService,
  ) {
    undo.register('ITEM', { entityType: 'ITEM', check: (user) => this.access.assertCanManageStore(user) });
  }

  /* ---------- helpers ---------- */

  toDto(r: Row): StockEntryDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      type: r.type,
      entryNo: r.entryNo,
      date: dateOnly(r.date),
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
      workElementId: r.workElementId,
      workElementLabel: r.workElement ? `${r.workElement.code} ${r.workElement.name}` : null,
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
      adjustmentReason: r.adjustmentReason,
      equipmentId: r.equipmentId,
      equipmentCode: r.equipment?.code ?? null,
      meterReading: dec(r.meterReading),
      qcStatus: r.qcStatus,
      qcAt: iso(r.qcAt),
      qcByName: r.qcBy?.fullName ?? null,
      qcNote: r.qcNote,
      mtcNo: r.mtcNo,
      mtcDate: dateOnly(r.mtcDate),
      lines: r.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemName: l.item.name,
        unit: l.item.unit,
        category: l.item.category,
        quantity: dec(l.quantity),
        materialRequestItemId: l.materialRequestItemId,
        purchaseOrderLineId: l.purchaseOrderLineId,
        rejectedQty: dec(l.rejectedQty),
      })),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdById: r.createdById,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
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

  /** Item master lookup by name and unit (`masterItemFor`: any spelling, or a merged old name); adds the item when it is new. */
  private async resolveItem(tx: Tx, organizationId: string, name: string, unit: string) {
    const found = await findMasterItem(tx, organizationId, name.trim(), unit.trim());
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
        supplierDispatchId: h.supplierDispatchId ?? null,
        supplier: blank(h.supplier),
        vendorId: h.vendorId ?? null,
        challanNo: blank(h.challanNo),
        vehicleNo: blank(h.vehicleNo),
        issuedTo: blank(h.issuedTo),
        activityId: h.activityId ?? null,
        workElementId: h.workElementId ?? null,
        workOrderId: h.workOrderId ?? null,
        toProjectId: h.toProjectId ?? null,
        transferOutId: h.transferOutId ?? null,
        remarks: blank(h.remarks),
        adjustmentReason: h.type === 'ADJUSTMENT' ? (h.adjustmentReason ?? null) : null,
        maintenanceJobId: h.maintenanceJobId ?? null,
        equipmentId: h.equipmentId ?? null,
        meterReading: h.meterReading ?? null,
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
    if (q.waiting) {
      const { type, ...rest } = this.waitingWhere(q.waiting, todayIn());
      Object.assign(where, rest);
      if (type) where.type = type;
    }
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

  /**
   * Receipts waiting on a desk after the store (`RECEIPT_WAITS`): unchecked GRNs for QA/QC, GRNs against an order no
   * live supplier bill covers for accounts, and rejected or returned material with no live debit note. The lists, My
   * work and the hand-offs all read this one rule. Add the caller's project filter to it.
   */
  waitingWhere(kind: ReceiptWait, today: string): Prisma.StockEntryWhereInput {
    const since = (days: number) => ({ gte: new Date(parseDate(today).getTime() - days * 86_400_000) });
    if (kind === 'CHECK') return { type: 'RECEIPT', qcStatus: null, date: since(RECEIPT_CHECK_WITHIN_DAYS) };
    if (kind === 'BILL') return { type: 'RECEIPT', purchaseOrderId: { not: null }, date: since(RECEIPT_BILL_WITHIN_DAYS), purchaseOrder: { vendorBills: { none: { status: { not: 'REJECTED' } } } } };
    return {
      type: { in: ['RECEIPT', 'RETURN_TO_VENDOR'] },
      OR: [{ type: 'RETURN_TO_VENDOR' }, { lines: { some: { rejectedQty: { gt: 0 } } } }],
      debitNotes: { none: { cancelledAt: null } },
    };
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
        const covered = await tx.materialRequestCover.groupBy({ by: ['materialRequestItemId'], where: { materialRequestItemId: { in: [...want.keys()] } }, _sum: { quantity: true } });
        const lines: Line[] = [];
        for (const [lineId, quantity] of want) {
          const line = mr.items.find((i) => i.id === lineId)!;
          const received = got.find((g) => g.materialRequestItemId === lineId)?._sum.quantity ?? ZERO;
          // What stock met (v5 item 95) is not received again.
          const pending = line.quantity.sub(received).sub(covered.find((c) => c.materialRequestItemId === lineId)?._sum.quantity ?? ZERO);
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
    await this.notifications.onGoodsReceived(user, saved.id);
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
    // Filled from the supplier's dispatch note (v6 item 105): it must be this order's, still on the way.
    const dispatch = dto.supplierDispatchId
      ? await this.prisma.supplierDispatch.findFirst({ where: { id: dto.supplierDispatchId, purchaseOrderId: po.id }, select: { dispatchNo: true, cancelledAt: true, grn: { select: { entryNo: true } } } })
      : null;
    if (dto.supplierDispatchId && !dispatch) throw new BadRequestException(`The dispatch note is not one of ${po.poNo}'s`);
    if (dispatch?.cancelledAt) throw new ConflictException(`The supplier cancelled dispatch note ${dispatch.dispatchNo}`);
    if (dispatch?.grn) throw new ConflictException(`Dispatch note ${dispatch.dispatchNo} was already received as ${dispatch.grn.entryNo}`);
    // Drafted from a weighbridge ticket (item 148): weighed, against this order, not received or cancelled.
    const ticket = dto.weighTicketId
      ? await this.prisma.weighTicket.findFirst({
          where: { id: dto.weighTicketId, organizationId: user.organizationId },
          select: { id: true, ticketNo: true, purchaseOrderId: true, secondKg: true, cancelledAt: true, stockEntry: { select: { entryNo: true } } },
        })
      : null;
    if (dto.weighTicketId && (!ticket || ticket.purchaseOrderId !== po.id)) throw new BadRequestException(`The weighbridge ticket is not one of ${po.poNo}'s`);
    if (ticket?.cancelledAt) throw new ConflictException(`Weighbridge ticket ${ticket.ticketNo} is cancelled`);
    if (ticket && ticket.secondKg === null) throw new ConflictException(`Weighbridge ticket ${ticket.ticketNo} has no second weight yet`);
    if (ticket?.stockEntry) throw new ConflictException(`Weighbridge ticket ${ticket.ticketNo} was already received as ${ticket.stockEntry.entryNo}`);
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
        const entry = await this.insertEntry(
          tx,
          user,
          { ...dto, supplier: po.vendor.name, vendorId: po.vendorId, type: 'RECEIPT', projectId: po.projectId, date, materialRequestId: po.materialRequestId, purchaseOrderId: po.id },
          lines,
        );
        if (ticket) {
          // Only a ticket not received yet takes it, so two GRNs from one ticket cannot both stand.
          const tied = await tx.weighTicket.updateMany({ where: { id: ticket.id, stockEntryId: null, cancelledAt: null }, data: { stockEntryId: entry.id } });
          if (!tied.count) throw new ConflictException(`Weighbridge ticket ${ticket.ticketNo} was just received or cancelled`);
        }
        return entry;
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.attachments.link(user, 'stockEntryId', saved.id, dto.attachmentIds);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} against ${po.poNo}${dispatch ? `, from the supplier's dispatch note ${dispatch.dispatchNo}` : ''}${ticket ? `, weighed on ${ticket.ticketNo}` : ''}`);
    await this.notifications.onGoodsReceived(user, saved.id);
    return this.get(user, saved.id);
  }

  /** Issue material at site; each quantity may not exceed the project's stock. `link` ties the issue to a maintenance job card. */
  async issue(user: RequestUser, dto: CreateIssueDto, link?: IssueLink): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanKeepStock(user, dto.projectId);
    const date = this.entryDate(dto.date);
    const workElementId = await this.placeOf(dto.projectId, dto.activityId, dto.workElementId);
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
        return this.insertEntry(tx, user, { ...dto, ...link, issuedTo, workElementId, type: 'ISSUE', date }, lines.map((l) => ({ ...l, quantity: l.quantity.neg() })));
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} to ${issuedTo}`);
    await this.alertLowStock(user, dto.projectId, before, saved.id, saved.entryNo);
    return this.get(user, saved.id);
  }

  /**
   * Fuel into a machine (v5 item 93): an issue of a fuel item with the machine and its meter, by whoever issues
   * material. Offline phones send it through the outbox with their own id, so a retry returns the same entry.
   */
  async fuelIssue(user: RequestUser, dto: CreateFuelIssueDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    const [item, machine] = await Promise.all([
      this.prisma.item.findFirst({ where: { id: dto.itemId, organizationId: user.organizationId }, select: { name: true, isFuel: true } }),
      this.prisma.equipment.findFirst({ where: { id: dto.equipmentId, organizationId: user.organizationId }, select: { code: true, name: true, isActive: true } }),
    ]);
    if (!item) throw new NotFoundException('Item not found');
    if (!item.isFuel) throw new BadRequestException(`${item.name} is not marked as fuel in the item master`);
    if (!machine) throw new NotFoundException('Machine not found');
    if (!machine.isActive) throw new BadRequestException(`${machine.code} is marked inactive`);
    const meter = dto.meterReading === undefined || dto.meterReading === null || dto.meterReading === '' ? null : D(dto.meterReading);
    if (meter && meter.isNegative()) throw new BadRequestException('The meter reading cannot be negative');
    return this.issue(
      user,
      { id: dto.id, projectId: dto.projectId, date: dto.date, issuedTo: dto.issuedTo?.trim() || `${machine.code} ${machine.name}`, remarks: dto.remarks ?? null, lines: [{ itemId: dto.itemId, quantity: dto.quantity }] },
      { equipmentId: dto.equipmentId, meterReading: meter },
    );
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
        return this.insertEntry(tx, user, { ...dto, type: 'ADJUSTMENT', date, adjustmentReason: dto.reason ?? null }, lines);
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
      this.prisma.stockEntry.update({
        where: { id },
        data: { qcStatus: dto.status, qcAt: new Date(), qcById: user.id, qcNote: note, ...(dto.mtcNo !== undefined ? { mtcNo: blank(dto.mtcNo) } : {}), ...(dto.mtcDate !== undefined ? { mtcDate: dto.mtcDate ? parseDate(dto.mtcDate) : null } : {}) },
      }),
      ...row.lines.map((l) => this.prisma.stockTxn.update({ where: { id: l.id }, data: { rejectedQty: rejected.get(l.id) ?? ZERO } })),
    ]);
    await this.audit.log(user, 'STOCK', id, `QC_${dto.status}`, note);
    if (dto.status !== 'ACCEPTED') await this.notifications.onDebitToRaise(user, id);
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
    await this.notifications.onTransferSent(user, saved.id);
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
    await this.notifications.onDebitToRaise(user, saved.id);
    return this.get(user, saved.id);
  }

  /**
   * Where an issue or a return goes (item 128): the activity's component when an activity is given, else the component
   * or pipe zone chosen. Both must be of the project.
   */
  private async placeOf(projectId: string, activityId: string | null | undefined, workElementId: string | null | undefined): Promise<string | null> {
    if (activityId) {
      const activity = await this.prisma.activity.findFirst({ where: { id: activityId, projectId }, select: { workElementId: true } });
      if (!activity) throw new BadRequestException('The activity is not part of this project');
      if (activity.workElementId) return activity.workElementId;
    }
    if (!workElementId) return null;
    const element = await this.prisma.workElement.findFirst({ where: { id: workElementId, projectId }, select: { id: true } });
    if (!element) throw new BadRequestException('Choose a component of this project');
    return element.id;
  }

  /** Issued material that came back unused: it returns to stock and comes off the project's material cost. */
  async returnFromSite(user: RequestUser, dto: CreateSiteReturnDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanKeepStock(user, dto.projectId);
    const date = this.entryDate(dto.date);
    const workElementId = await this.placeOf(dto.projectId, dto.activityId, dto.workElementId);
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
        return this.insertEntry(tx, user, { ...dto, workElementId, type: 'RETURN_FROM_SITE', date }, lines);
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
        return this.insertEntry(tx, user, { id: dto.id, type: 'ADJUSTMENT', projectId: dto.projectId, date, remarks: note, adjustmentReason: 'COUNT_DIFFERENCE' }, lines);
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
        value: money(value),
        ageingQty: ageing.map((a) => dec(a)),
        oldestDays,
      };
    });
    rows.sort((a, b) => Number(b.value) - Number(a.value) || a.itemName.localeCompare(b.itemName));
    return { asOf, rows, totalValue: money(totalValue), ageingValue: ageingValue.map((v) => money(v.toDecimalPlaces(2))), unpricedItems: unpriced };
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
        received: dec(a.received),
        issued: dec(a.issued),
        adjusted: dec(a.adjusted),
        transferred: dec(a.transferred),
        balance: dec(balance),
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
    if (q.fuel) {
      const fuel = new Set((await this.prisma.item.findMany({ where: { organizationId: user.organizationId, isFuel: true }, select: { id: true } })).map((i) => i.id));
      rows = rows.filter((r) => fuel.has(r.itemId));
    }
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
      include: { project: { select: { name: true } }, items: { orderBy: { sortOrder: 'asc' }, include: { stockTxns: { select: { quantity: true } }, covers: { select: { quantity: true } } } } },
      orderBy: [{ requiredDate: 'asc' }, { requestNo: 'asc' }],
      take: 200,
    });
    return rows
      .map((r) => ({
        id: r.id,
        requestNo: r.requestNo,
        projectId: r.projectId,
        projectName: r.project.name,
        requiredDate: dateOnly(r.requiredDate),
        priority: r.priority,
        lines: r.items.map((i) => {
          const received = i.stockTxns.reduce((s, t) => s.add(t.quantity), ZERO);
          const pending = i.quantity.sub(received).sub(i.covers.reduce((s, c) => s.add(c.quantity), ZERO));
          return {
            materialRequestItemId: i.id,
            itemName: i.itemName,
            specification: i.specification,
            unit: i.unit,
            requested: dec(i.quantity),
            received: dec(received),
            pending: dec(pending.gt(0) ? pending : ZERO),
          };
        }),
      }))
      .filter((r) => r.lines.some((l) => Number(l.pending) > 0));
  }

  /* ---------- a material request met from stock (v5 item 95) ---------- */

  /** A request with what each line still needs, for stock first. */
  private async coverableRequest(user: RequestUser, id: string) {
    const mr = await this.prisma.materialRequest.findFirst({
      where: { id, ...this.access.submissionWhere(user) },
      include: {
        project: { select: { name: true, status: true } },
        submittedBy: { select: { fullName: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            stockTxns: { select: { quantity: true, purchaseOrderLineId: true } },
            covers: { select: { quantity: true } },
            poLines: { where: { purchaseOrder: { status: { not: 'REJECTED' } } }, select: { quantity: true, purchaseOrder: { select: { closedAt: true } }, stockTxns: { select: { quantity: true } } } },
          },
        },
      },
    });
    if (!mr) throw new NotFoundException('Material request not found');
    return mr;
  }

  /** The item master rows a request's free-text lines name (`masterItemFor`); none are added. */
  private async itemsNamed(organizationId: string, lines: { itemName: string; unit: string }[]) {
    const items = await masterCandidates(this.prisma, organizationId, lines.map((l) => l.itemName));
    return (l: { itemName: string; unit: string }) => masterItemFor(l.itemName, l.unit, items);
  }

  /**
   * Indent checks (item 170, `@erp/shared/indent-check.ts`): each line of a request the caller may open (the caller has
   * loaded it through `MaterialRequestsService.get`) against its site's store and what the BOQ allows for the item, from
   * the project's norms. A line naming no item of the master is checked against nothing.
   */
  async indentCheck(user: RequestUser, mr: { id: string; projectId: string; items: { id: string; itemName: string; unit: string; quantity: string }[] }): Promise<IndentCheckDto> {
    const itemOf = await this.itemsNamed(user.organizationId, mr.items);
    const itemIds = [...new Set(mr.items.map((i) => itemOf(i)?.id).filter((x): x is string => !!x))];
    const projectId = mr.projectId;
    const [held, moved, norms, activityNorms, waiting] = itemIds.length
      ? await Promise.all([
          this.prisma.stockTxn.groupBy({ by: ['itemId'], where: { projectId, itemId: { in: itemIds } }, _sum: { quantity: true } }),
          this.prisma.stockTxn.groupBy({ by: ['itemId', 'type'], where: { projectId, itemId: { in: itemIds }, type: { in: ['ISSUE', 'RETURN_FROM_SITE'] } }, _sum: { quantity: true } }),
          this.prisma.materialNorm.findMany({ where: { projectId, itemId: { in: itemIds } }, select: { itemId: true, boqItemId: true, qtyPerUnit: true, wastagePct: true, boqItem: { select: { originalQty: true, revisedQty: true } } } }),
          this.prisma.activityMaterialNorm.findMany({ where: { projectId, itemId: { in: itemIds } }, select: { itemId: true, activityId: true, qtyPerUnit: true, wastagePct: true, activity: { select: { boqItemId: true, plannedQty: true } } } }),
          this.prisma.materialRequestItem.findMany({ where: { request: { projectId, status: 'SUBMITTED', id: { not: mr.id } } }, select: { itemName: true, unit: true, quantity: true } }),
        ])
      : [[], [], [], [], []];
    const otherOf = await this.itemsNamed(user.organizationId, waiting);
    const num = (d: Decimal | null | undefined) => Number(d ?? 0);
    const lines = mr.items.map((i) => {
      const item = itemOf(i);
      const id = item?.id;
      const onHand = id ? num(held.find((h) => h.itemId === id)?._sum.quantity) : 0;
      // An issue's quantity is negative in the ledger, a return from site positive
      const issued = id ? -moved.filter((m) => m.itemId === id).reduce((s, m) => s + num(m._sum.quantity), 0) : 0;
      const allowance = id
        ? boqAllowance(
            norms.filter((n) => n.itemId === id).map((n) => ({ boqItemId: n.boqItemId, boqQty: num(n.boqItem.revisedQty ?? n.boqItem.originalQty), qtyPerUnit: num(n.qtyPerUnit), wastagePct: num(n.wastagePct) })),
            activityNorms.filter((n) => n.itemId === id).map((n) => ({ activityId: n.activityId, boqItemId: n.activity.boqItemId, plannedQty: num(n.activity.plannedQty), qtyPerUnit: num(n.qtyPerUnit), wastagePct: num(n.wastagePct) })),
          )
        : null;
      const others = id ? waiting.filter((w) => otherOf(w)?.id === id).reduce((s, w) => s + num(w.quantity), 0) : 0;
      const requested = Number(i.quantity);
      const v = indentLineCheck({ requested, onHand, allowance, issued, waiting: others });
      const q = (n: number) => n.toFixed(3);
      return {
        materialRequestItemId: i.id,
        itemName: i.itemName,
        unit: i.unit,
        itemId: id ?? null,
        requested: q(requested),
        onHand: q(onHand),
        allowance: allowance === null ? null : q(allowance),
        issued: q(issued),
        waiting: q(others),
        left: v.left === null ? null : q(v.left),
        over: v.over === null ? null : q(v.over),
        fromStock: q(v.fromStock),
        notes: v.notes,
        flagged: indentLineFlagged(v),
      };
    });
    return { materialRequestId: mr.id, projectId, lines, flagged: lines.filter((l) => l.flagged).length };
  }

  /**
   * Stock first (v5 item 95): for each line of a request, what its own site holds and what the other sites the user can
   * see hold, so the store issues or transfers before the rest is bought.
   */
  async requestStock(user: RequestUser, materialRequestId: string): Promise<MaterialRequestStockDto> {
    const mr = await this.coverableRequest(user, materialRequestId);
    const itemOf = await this.itemsNamed(user.organizationId, mr.items);
    const itemIds = [...new Set(mr.items.map((i) => itemOf(i)?.id).filter((x): x is string => !!x))];
    const sums = itemIds.length
      ? await this.prisma.stockTxn.groupBy({ by: ['projectId', 'itemId'], where: { organizationId: user.organizationId, itemId: { in: itemIds }, project: this.access.stockSourceWhere(user) }, _sum: { quantity: true } })
      : [];
    const holders = [...new Set(sums.map((s) => s.projectId))];
    const [projects, visible] = await Promise.all([
      this.prisma.project.findMany({ where: { id: { in: holders } }, select: { id: true, name: true, type: true } }),
      this.prisma.project.findMany({ where: { id: { in: holders }, ...this.access.projectWhere(user) }, select: { id: true } }),
    ]);
    const seen = new Set(visible.map((p) => p.id));
    const sender = canKeepStock(user.roleKey);
    return {
      materialRequestId: mr.id,
      projectId: mr.projectId,
      canIssue: sender,
      lines: mr.items.map((i) => {
        const item = itemOf(i);
        const at = sums.filter((s) => item && s.itemId === item.id && (s._sum.quantity ?? ZERO).gt(0));
        return {
          materialRequestItemId: i.id,
          itemName: i.itemName,
          unit: i.unit,
          itemId: item?.id ?? null,
          toOrderQty: dec(toOrderOf(i)),
          coveredQty: dec(i.covers.reduce((s, c) => s.add(c.quantity), ZERO)),
          here: dec(at.find((s) => s.projectId === mr.projectId)?._sum.quantity ?? ZERO),
          others: at
            .filter((s) => s.projectId !== mr.projectId)
            .sort((a, b) => (b._sum.quantity ?? ZERO).cmp(a._sum.quantity ?? ZERO))
            .map((s) => {
              const p = projects.find((x) => x.id === s.projectId);
              // A central store not the user's own is listed for its balance; its keepers send from it.
              return { projectId: s.projectId, projectName: p?.name ?? '', balance: dec(s._sum.quantity)!, canSend: sender && seen.has(s.projectId), store: p?.type === 'STORE' };
            })
            // Central stores first: they hold stock for the sites.
            .sort((a, b) => Number(b.store) - Number(a.store)),
        };
      }),
    };
  }

  /**
   * Meet request lines from stock (v5 item 95): from the request's own site an issue to whoever raised it, from another
   * site a transfer to the request's site (received there as usual). Each line at most what it still needs; what is
   * met no longer needs ordering or receiving. Deleting the entry gives the need back.
   */
  async coverRequest(user: RequestUser, materialRequestId: string, dto: CoverRequestDto): Promise<StockEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    const mr = await this.coverableRequest(user, materialRequestId);
    if (mr.status !== 'APPROVED') throw new ConflictException(`Stock is issued against approved requests. ${mr.requestNo} is ${SUBMISSION_STATUS_LABELS[mr.status].toLowerCase()}.`);
    await this.access.assertCanKeepStock(user, dto.fromProjectId);
    const here = dto.fromProjectId === mr.projectId;
    if (!here && mr.project.status === 'CLOSED') throw new BadRequestException(`${mr.project.name} is closed`);
    const date = this.entryDate(dto.date);
    const want = new Map<string, Decimal>();
    for (const l of dto.lines) {
      const line = mr.items.find((i) => i.id === l.materialRequestItemId);
      if (!line) throw new BadRequestException(`A line is not part of ${mr.requestNo}`);
      want.set(line.id, (want.get(line.id) ?? ZERO).add(this.parseQty(l.quantity, line.itemName)));
    }
    const itemOf = await this.itemsNamed(user.organizationId, mr.items);
    const items: { id: string; name: string; unit: string }[] = [];
    const lines: Line[] = [];
    for (const [lineId, quantity] of want) {
      const line = mr.items.find((i) => i.id === lineId)!;
      const item = itemOf(line);
      if (!item) throw new ConflictException(`${line.itemName} (${line.unit}) is not in any store yet`);
      items.push(item);
      lines.push({ itemId: item.id, quantity });
    }
    const merged = this.mergeLines(lines);
    let before = new Map<string, Decimal>();
    const saved = await this.createGuarded(user, dto.id, () =>
      this.inLock(user.organizationId, async (tx) => {
        // What each line still needs, read again under the lock so two stores cannot both meet it.
        const fresh = await tx.materialRequestItem.findMany({
          where: { id: { in: [...want.keys()] } },
          include: {
            stockTxns: { select: { quantity: true, purchaseOrderLineId: true } },
            covers: { select: { quantity: true } },
            poLines: { where: { purchaseOrder: { status: { not: 'REJECTED' } } }, select: { quantity: true, purchaseOrder: { select: { closedAt: true } }, stockTxns: { select: { quantity: true } } } },
          },
        });
        for (const f of fresh) {
          const need = toOrderOf(f);
          const quantity = want.get(f.id)!;
          if (quantity.gt(need))
            throw new ConflictException(
              need.lte(0) ? `${f.itemName} on ${mr.requestNo} needs nothing more.` : `Only ${dec(need)} ${f.unit} of ${f.itemName} on ${mr.requestNo} is still needed.`,
            );
        }
        before = await this.assertInStock(tx, dto.fromProjectId, merged, items);
        const entry = await this.insertEntry(
          tx,
          user,
          {
            id: dto.id,
            type: here ? 'ISSUE' : 'TRANSFER_OUT',
            projectId: dto.fromProjectId,
            date,
            materialRequestId: mr.id,
            issuedTo: here ? mr.submittedBy.fullName : mr.project.name,
            toProjectId: here ? null : mr.projectId,
            vehicleNo: dto.vehicleNo,
            remarks: dto.remarks || `For ${mr.requestNo}`,
          },
          merged.map((l) => ({ ...l, quantity: l.quantity.neg() })),
        );
        await tx.materialRequestCover.createMany({
          data: [...want].map(([materialRequestItemId, quantity]) => ({ organizationId: user.organizationId, materialRequestItemId, stockEntryId: entry.id, quantity })),
        });
        return entry;
      }),
    );
    if ('existing' in saved) return this.get(user, saved.id);
    await this.audit.log(user, 'STOCK', saved.id, 'CREATED', `${saved.entryNo} for ${mr.requestNo}${here ? '' : ` to ${mr.project.name}`}`);
    await this.alertLowStock(user, dto.fromProjectId, before, saved.id, saved.entryNo);
    return this.get(user, saved.id);
  }

  /* ---------- central stores (v6 item 106) ---------- */

  /** The central stores and yards the user sees, with what each holds, its value and what is on the road to or from it. */
  async stores(user: RequestUser): Promise<StoreSummaryDto[]> {
    if (!canSeeStores(user.roleKey)) throw new ForbiddenException('Central stores are for those who keep, buy or account for stock');
    const where: Prisma.ProjectWhereInput = { ...this.access.projectWhere(user), type: 'STORE' };
    const stores = await this.prisma.project.findMany({ where, select: { id: true, code: true, name: true, location: true, status: true }, orderBy: { code: 'asc' } });
    if (!stores.length) return [];
    const ids = stores.map((s) => s.id);
    const showValue = canManageStore(user.roleKey) || canViewCost(user.roleKey);
    const [balances, open] = await Promise.all([
      this.buildBalances(user.organizationId, where),
      this.prisma.stockEntry.findMany({
        where: { organizationId: user.organizationId, type: 'TRANSFER_OUT', transferIn: null, OR: [{ projectId: { in: ids } }, { toProjectId: { in: ids } }] },
        select: { projectId: true, toProjectId: true },
      }),
    ]);
    const rates = showValue
      ? new Map((await this.prisma.item.findMany({ where: { id: { in: [...new Set(balances.map((b) => b.itemId))] } }, select: { id: true, rate: true } })).map((i) => [i.id, i.rate]))
      : null;
    return stores.map((s) => {
      const held = balances.filter((b) => b.projectId === s.id);
      const value = rates ? held.reduce((t, b) => (D(b.balance).gt(0) ? t.add(D(b.balance).mul(rates.get(b.itemId) ?? ZERO)) : t), ZERO) : null;
      const last = held.map((b) => b.lastMovement).filter((d): d is string => !!d).sort().pop() ?? null;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        location: s.location,
        status: s.status,
        items: held.filter((b) => D(b.balance).gt(0)).length,
        value: value ? money(value.toDecimalPlaces(2)) : null,
        low: held.filter((b) => b.low).length,
        lastMovement: last,
        outInTransit: open.filter((e) => e.projectId === s.id).length,
        inInTransit: open.filter((e) => e.toProjectId === s.id).length,
        canKeep: canKeepStock(user.roleKey),
      };
    });
  }

  /**
   * Where a stock keeper can send material (v6 item 106): every open site and store of the company, not only the ones
   * they are a member of, as `transfer` already allows. The receiving site's own keepers receive it.
   */
  async destinations(user: RequestUser): Promise<StockDestinationDto[]> {
    if (!canKeepStock(user.roleKey)) throw new ForbiddenException('Your role cannot send stock');
    const rows = await this.prisma.project.findMany({
      where: { organizationId: user.organizationId, status: { notIn: ['CLOSED', 'COMPLETED'] } },
      select: { id: true, code: true, name: true, type: true },
      orderBy: [{ code: 'asc' }],
    });
    return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, store: p.type === 'STORE' })).sort((a, b) => Number(b.store) - Number(a.store));
  }

  /* ---------- item master ---------- */

  async listItems(user: RequestUser, q: ListItemsQuery): Promise<Paginated<ItemDto>> {
    const where: Prisma.ItemWhereInput = { organizationId: user.organizationId };
    if (q.fuel) where.isFuel = true;
    const words = searchWords(q.q);
    // A merged old name finds the item too ("cement opc" → OPC 53 Grade Cement).
    if (words.length) where.OR = [{ AND: words.map((w) => ({ OR: [{ name: ilike(w) }, { category: ilike(w) }, { unit: ilike(w) }] })) }, { aliases: { has: itemKey(q.q!) } }];
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
      rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, category: r.category, rate: money(r.rate), isFuel: r.isFuel, ...pipeFields(r), aliases: r.aliases, projectCount: used.filter((u) => u.itemId === r.id).length, createdAt: iso(r.createdAt) })),
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

  /** The pipe fields of a create or change (item 128); left out, unchanged. */
  private pipeData(dto: { pipeDiameterMm?: number | null; pipeMaterial?: PipeMaterial | null; kgPerMetre?: string | null }): { pipeDiameterMm?: number | null; pipeMaterial?: PipeMaterial | null; kgPerMetre?: Decimal | null } {
    const kg = dto.kgPerMetre === undefined ? undefined : dto.kgPerMetre === null || dto.kgPerMetre === '' ? null : new Prisma.Decimal(dto.kgPerMetre).toDecimalPlaces(3);
    if (kg && kg.lte(0)) throw new BadRequestException('Enter a weight per metre above zero');
    return {
      ...(dto.pipeDiameterMm !== undefined ? { pipeDiameterMm: dto.pipeDiameterMm } : {}),
      ...(dto.pipeMaterial !== undefined ? { pipeMaterial: dto.pipeMaterial } : {}),
      ...(kg !== undefined ? { kgPerMetre: kg } : {}),
    };
  }

  private async assertItemUnique(organizationId: string, name: string, unit: string, excludeId?: string) {
    // The same name however it is written ("opc 53 grade cement, bag"), or an old name merged into another item.
    const dup = masterItemFor(name, unit, (await masterCandidates(this.prisma, organizationId, [name])).filter((i) => i.id !== excludeId));
    if (dup) throw new ConflictException(itemKey(dup.name) === itemKey(name) ? `${dup.name} (${dup.unit}) is already in the item master` : `${name} is already in the item master as ${dup.name} (${dup.unit})`);
  }

  private async getItem(user: RequestUser, id: string): Promise<ItemDto> {
    const r = await this.prisma.item.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!r) throw new NotFoundException('Item not found');
    const used = await this.prisma.stockTxn.groupBy({ by: ['projectId'], where: { itemId: id } });
    return { id: r.id, name: r.name, unit: r.unit, category: r.category, rate: money(r.rate), isFuel: r.isFuel, ...pipeFields(r), aliases: r.aliases, projectCount: used.length, createdAt: iso(r.createdAt) };
  }

  async createItem(user: RequestUser, dto: CreateItemDto): Promise<ItemDto> {
    await this.access.assertCanManageStore(user);
    await this.assertItemUnique(user.organizationId, dto.name, dto.unit);
    try {
      const row = await this.prisma.item.create({ data: { organizationId: user.organizationId, name: dto.name, unit: dto.unit, category: blank(dto.category), rate: this.rate(dto.rate) ?? null, isFuel: dto.isFuel ?? false, ...this.pipeData(dto) } });
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
      await this.prisma.item.update({ where: { id }, data: { name, unit, ...(dto.category !== undefined ? { category: blank(dto.category) } : {}), ...(dto.rate !== undefined ? { rate: this.rate(dto.rate) } : {}), ...(dto.isFuel !== undefined ? { isFuel: dto.isFuel } : {}), ...this.pipeData(dto) } });
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
    const minLevels = await this.prisma.stockMinLevel.findMany({ where: { itemId: id } });
    await this.prisma.item.delete({ where: { id } });
    await this.audit.log(user, 'ITEM', id, 'DELETED', `${row.name} (${row.unit})`);
    const rows = [{ model: 'item', data: row }, ...minLevels.map((m) => ({ model: 'stockMinLevel', data: m }))];
    return { ok: true, undo: this.undo.offer(user, 'ITEM', { rows }) };
  }
  /** How often each item is named: stock movements, and request and order lines with its name and unit. */
  private async itemUses(organizationId: string, items: { id: string; name: string; unit: string }[]): Promise<Map<string, number>> {
    const [txns, mrLines, poLines] = await Promise.all([
      this.prisma.stockTxn.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _count: { _all: true } }),
      this.prisma.materialRequestItem.groupBy({ by: ['itemName', 'unit'], where: { request: { organizationId } }, _count: { _all: true } }),
      this.prisma.purchaseOrderLine.groupBy({ by: ['itemName', 'unit'], where: { purchaseOrder: { organizationId } }, _count: { _all: true } }),
    ]);
    const named = (i: { name: string; unit: string }) =>
      [...mrLines, ...poLines].filter((l) => l.itemName.toLowerCase() === i.name.toLowerCase() && l.unit.toLowerCase() === i.unit.toLowerCase()).reduce((n, l) => n + l._count._all, 0);
    return new Map(items.map((i) => [i.id, (txns.find((t) => t.itemId === i.id)?._count._all ?? 0) + named(i)]));
  }

  /**
   * Items that look like one item written more ways (finding 3 of the October review), for the store manager to merge
   * once: the same unit, and the same spelling or one name inside the other (`duplicateGroups`).
   */
  async itemDuplicates(user: RequestUser): Promise<ItemDuplicateGroupDto[]> {
    await this.access.assertCanManageStore(user);
    const items = await this.prisma.item.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true, unit: true, aliases: true } });
    const uses = await this.itemUses(user.organizationId, items);
    const entry = (i: { id: string; name: string; unit: string }) => ({ id: i.id, name: i.name, unit: i.unit, uses: uses.get(i.id) ?? 0 });
    return duplicateGroups(items.map((i) => ({ ...i, uses: uses.get(i.id) ?? 0 }))).map((g) => ({ keep: entry(g.keep), merge: g.merge.map(entry) }));
  }

  /**
   * Merge items into one (finding 3): every record that points at them points at the item kept, request and order
   * lines take its name, and their names become its old names so a line typed that way lands on it. A minimum level
   * or norm both items have keeps the kept item's. Items in different units do not merge.
   */
  async mergeItems(user: RequestUser, keepId: string, dto: MergeItemsDto): Promise<ItemDto> {
    await this.access.assertCanManageStore(user);
    const ids = [...new Set(dto.fromIds)].filter((id) => id !== keepId);
    if (!ids.length) throw new BadRequestException('Choose the items to merge into this one');
    const rows = await this.prisma.item.findMany({ where: { organizationId: user.organizationId, id: { in: [keepId, ...ids] } } });
    const keep = rows.find((r) => r.id === keepId);
    if (!keep) throw new NotFoundException('Item not found');
    const from = rows.filter((r) => r.id !== keepId);
    if (from.length !== ids.length) throw new NotFoundException('An item to merge was not found; reload the list');
    const other = from.find((f) => normUnit(f.unit) !== normUnit(keep.unit));
    if (other) throw new ConflictException(`${other.name} is counted in ${other.unit} and ${keep.name} in ${keep.unit}. Only items in the same unit merge.`);

    await this.prisma.$transaction(async (tx) => {
      for (const f of from) {
        for (const ref of ITEM_REFS) {
          for (const others of ref.uniqueWith) {
            const same = others.map((c) => `t.${sqlName(c)} = s.${sqlName(c)}`).join(' AND ');
            const clash = `SELECT s."id" FROM ${sqlName(ref.table)} s WHERE s.${sqlName(ref.column)} = $1 AND EXISTS (SELECT 1 FROM ${sqlName(ref.table)} t WHERE t.${sqlName(ref.column)} = $2 AND ${same})`;
            if (ITEM_SETTINGS.has(ref.table)) await tx.$executeRawUnsafe(`DELETE FROM ${sqlName(ref.table)} WHERE "id" IN (${clash})`, f.id, keep.id);
            else if ((await tx.$queryRawUnsafe<unknown[]>(clash, f.id, keep.id)).length)
              throw new ConflictException(`${f.name} and ${keep.name} are both on one ${ITEM_REF_WORDS[ref.table] ?? 'record'}. Put them on one line there first.`);
          }
          await tx.$executeRawUnsafe(`UPDATE ${sqlName(ref.table)} SET ${sqlName(ref.column)} = $1 WHERE ${sqlName(ref.column)} = $2`, keep.id, f.id);
        }
        const named = { itemName: { equals: f.name, mode: 'insensitive' as const }, unit: { equals: f.unit, mode: 'insensitive' as const } };
        await tx.materialRequestItem.updateMany({ where: { request: { organizationId: user.organizationId }, ...named }, data: { itemName: keep.name, unit: keep.unit } });
        await tx.purchaseOrderLine.updateMany({ where: { purchaseOrder: { organizationId: user.organizationId }, ...named }, data: { itemName: keep.name, unit: keep.unit } });
      }
      const own = itemKey(keep.name);
      const aliases = [...new Set([...keep.aliases, ...from.flatMap((f) => [itemKey(f.name), ...f.aliases])])].filter((a) => a && a !== own);
      await tx.item.deleteMany({ where: { id: { in: ids } } });
      await tx.item.update({
        where: { id: keep.id },
        data: {
          aliases,
          // What the kept item lacks, it takes from the first merged item that has it.
          category: keep.category ?? from.find((f) => f.category)?.category ?? null,
          rate: keep.rate ?? from.find((f) => f.rate)?.rate ?? null,
          isFuel: keep.isFuel || from.some((f) => f.isFuel),
          pipeDiameterMm: keep.pipeDiameterMm ?? from.find((f) => f.pipeDiameterMm)?.pipeDiameterMm ?? null,
          pipeMaterial: keep.pipeMaterial ?? from.find((f) => f.pipeMaterial)?.pipeMaterial ?? null,
          kgPerMetre: keep.kgPerMetre ?? from.find((f) => f.kgPerMetre)?.kgPerMetre ?? null,
        },
      });
    });
    await this.audit.log(user, 'ITEM', keep.id, 'MERGED', `${from.map((f) => `${f.name} (${f.unit})`).join(', ')} merged into ${keep.name} (${keep.unit})`);
    for (const f of from) await this.audit.log(user, 'ITEM', f.id, 'MERGED', `Merged into ${keep.name} (${keep.unit})`);
    return this.getItem(user, keep.id);
  }
}

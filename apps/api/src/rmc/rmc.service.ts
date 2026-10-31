import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canApproveMixDesign,
  canBillRmc,
  canRecordTest,
  canRunRmcPlant,
  canSellRmc,
  canViewRmc,
  gradeStrength,
  gstStateCode,
  type MixDesignDto,
  type Paginated,
  type RmcBatchDto,
  type RmcDayDto,
  type RmcInvoiceDto,
  type RmcOrderDto,
  type RmcPlantDto,
  type RmcReceiptDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { nextDocNo } from '../common/doc-number';
import { isUniqueViolation } from '../common/idempotency';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { dateRange, ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { todayIn } from '../notifications/time';
import { StockService } from '../stock/stock.service';
import { QualityService } from '../quality/quality.service';
import { PlantBatchesService } from './plant-batches.service';
import { isInterState } from '../tally/vouchers';
import { actualQuantities, amountDue, batchQuantities, dispatchable, invoiceAmounts, materialsNeeded, orderProgress, orderValue, variancePct } from './rmc-rules';
import type {
  CreateMixDesignDto,
  CreateRmcInvoiceDto,
  CreateRmcOrderDto,
  CreateRmcReceiptDto,
  DeliverBatchDto,
  DispatchBatchDto,
  MixDesignQuery,
  RejectBatchDto,
  RmcBatchQuery,
  RmcDayQuery,
  RmcInvoiceQuery,
  RmcOrderQuery,
  RmcReceiptQuery,
  UpdateMixDesignDto,
  UpdateRmcOrderDto,
} from './rmc.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

const designInclude = {
  plant: { select: { name: true } },
  approvedBy: { select: { fullName: true } },
  lines: { include: { item: { select: { name: true, unit: true, rate: true } } }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.MixDesignInclude;
type DesignRow = Prisma.MixDesignGetPayload<{ include: typeof designInclude }>;

const orderInclude = {
  plant: { select: { name: true } },
  client: { select: { name: true } },
  project: { select: { name: true } },
  mixDesign: { select: { code: true, grade: true, status: true } },
  batches: { select: { quantity: true, status: true, invoiceId: true } },
} satisfies Prisma.RmcOrderInclude;
type OrderRow = Prisma.RmcOrderGetPayload<{ include: typeof orderInclude }>;

const batchInclude = {
  plant: { select: { name: true } },
  order: { select: { orderNo: true, site: true, client: { select: { name: true } }, project: { select: { name: true } } } },
  mixDesign: { select: { code: true, grade: true } },
  stockEntry: { select: { entryNo: true } },
  invoice: { select: { invoiceNo: true } },
  cubeTest: { select: { id: true, testNo: true, result: true } },
  lines: { include: { item: { select: { name: true, unit: true } } } },
  plantRows: { select: { batchNo: true }, take: 1 },
} satisfies Prisma.RmcBatchInclude;
type BatchRow = Prisma.RmcBatchGetPayload<{ include: typeof batchInclude }>;

const invoiceInclude = {
  plant: { select: { name: true } },
  client: { select: { name: true, gstin: true } },
  order: { select: { orderNo: true } },
  batches: { select: { id: true, batchNo: true, date: true, quantity: true, mixDesign: { select: { grade: true } } }, orderBy: { batchNo: 'asc' } },
  receipts: { select: { amount: true } },
} satisfies Prisma.RmcInvoiceInclude;
type InvoiceRow = Prisma.RmcInvoiceGetPayload<{ include: typeof invoiceInclude }>;

const customerOf = (o: { client: { name: string } | null; project: { name: string } | null }) => o.client?.name ?? (o.project ? `Own site: ${o.project.name}` : '');

/**
 * Ready-mix concrete. A plant is a project of type PLANT, so its materials are bought, received and
 * counted as at any site, and only those who see the plant see its RMC. Sales quote and confirm orders; quality
 * approves mix designs; the plant dispatches trucks (each a batch and its challan, issuing the materials from the plant's
 * stock through the stock service) and takes cubes (a quality test); accounts bill delivered challans with GST and
 * record what customers pay, which the posting service books and sends to Tally.
 */
@Injectable()
export class RmcService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private stock: StockService,
    private quality: QualityService,
    private plantBatches: PlantBatchesService,
  ) {}

  private assertView(user: RequestUser) {
    if (!canViewRmc(user.roleKey)) throw new ForbiddenException('Your role does not see RMC');
  }

  private plantWhere(user: RequestUser): Prisma.ProjectWhereInput {
    return { ...this.access.projectWhere(user), type: 'PLANT' };
  }

  /** The plants the caller sees, or the one asked for (which must be one of them). */
  private async plantIds(user: RequestUser, plantId?: string): Promise<string[]> {
    const rows = await this.prisma.project.findMany({ where: { ...this.plantWhere(user), ...(plantId ? { id: plantId } : {}) }, select: { id: true } });
    if (plantId && !rows.length) throw new NotFoundException('Plant not found or not accessible');
    return rows.map((r) => r.id);
  }

  private async assertPlant(user: RequestUser, plantId: string) {
    await this.plantIds(user, plantId);
  }

  async plants(user: RequestUser): Promise<RmcPlantDto[]> {
    this.assertView(user);
    return this.prisma.project.findMany({ where: this.plantWhere(user), select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } });
  }

  // Mix designs

  private designDto(user: RequestUser, d: DesignRow): MixDesignDto {
    const priced = d.lines.every((l) => l.item.rate !== null);
    const cost = d.lines.reduce((s, l) => s.add(D(l.quantity).mul(l.item.rate ?? 0)), ZERO);
    return {
      id: d.id,
      plantId: d.plantId,
      plantName: d.plant.name,
      code: d.code,
      grade: d.grade,
      description: d.description,
      slumpMm: d.slumpMm,
      status: d.status,
      approvedByName: d.approvedBy?.fullName ?? null,
      approvedAt: iso(d.approvedAt),
      lines: d.lines.map((l) => ({ itemId: l.itemId, itemName: l.item.name, unit: l.item.unit, quantity: dec(l.quantity) })),
      costPerM3: priced && d.lines.length ? money(cost) : null,
      canEdit: d.status === 'DRAFT' && (canRunRmcPlant(user.roleKey) || canApproveMixDesign(user.roleKey)),
      canApprove: d.status === 'DRAFT' && canApproveMixDesign(user.roleKey),
    };
  }

  async mixDesigns(user: RequestUser, q: MixDesignQuery): Promise<MixDesignDto[]> {
    this.assertView(user);
    const plants = await this.plantIds(user, q.plantId);
    const rows = await this.prisma.mixDesign.findMany({ where: { organizationId: user.organizationId, plantId: { in: plants } }, include: designInclude, orderBy: [{ status: 'asc' }, { grade: 'asc' }, { code: 'asc' }] });
    return rows.map((d) => this.designDto(user, d));
  }

  private async design(user: RequestUser, id: string): Promise<DesignRow> {
    const d = await this.prisma.mixDesign.findFirst({ where: { id, organizationId: user.organizationId, plant: this.plantWhere(user) }, include: designInclude });
    if (!d) throw new NotFoundException('Mix design not found');
    return d;
  }

  private async assertItems(user: RequestUser, lines: { itemId: string }[]) {
    const ids = [...new Set(lines.map((l) => l.itemId))];
    if (ids.length !== lines.length) throw new BadRequestException('Each material goes in once');
    const n = await this.prisma.item.count({ where: { id: { in: ids }, organizationId: user.organizationId } });
    if (n !== ids.length) throw new BadRequestException('Choose materials from the item master');
  }

  private codeTaken(e: unknown, code: string): never {
    if (isUniqueViolation(e)) throw new ConflictException(`A mix design ${code} is already there. Give this one another code.`);
    throw e;
  }

  async createMixDesign(user: RequestUser, dto: CreateMixDesignDto): Promise<MixDesignDto> {
    this.assertView(user);
    if (!canRunRmcPlant(user.roleKey) && !canApproveMixDesign(user.roleKey)) throw new ForbiddenException('Only the plant and quality make mix designs');
    await this.assertPlant(user, dto.plantId);
    await this.assertItems(user, dto.lines);
    const row = await this.prisma.mixDesign
      .create({
        data: {
          organizationId: user.organizationId,
          plantId: dto.plantId,
          code: dto.code,
          grade: dto.grade,
          description: dto.description || null,
          slumpMm: dto.slumpMm ?? null,
          createdById: user.id,
          lines: { create: dto.lines.map((l, i) => ({ organizationId: user.organizationId, itemId: l.itemId, quantity: l.quantity, sortOrder: i })) },
        },
        select: { id: true },
      })
      .catch((e) => this.codeTaken(e, dto.code));
    await this.audit.log(user, 'MIX_DESIGN', row.id, 'CREATED', `${dto.code} (${dto.grade})`);
    return this.designDto(user, await this.design(user, row.id));
  }

  async updateMixDesign(user: RequestUser, id: string, dto: UpdateMixDesignDto): Promise<MixDesignDto> {
    const d = await this.design(user, id);
    if (!this.designDto(user, d).canEdit) throw new BadRequestException('An approved design does not change. Retire it and make a new one.');
    if (dto.lines) await this.assertItems(user, dto.lines);
    await this.prisma
      .$transaction(async (tx) => {
        await tx.mixDesign.update({
          where: { id },
          data: { code: dto.code, grade: dto.grade, description: dto.description === undefined ? undefined : dto.description || null, slumpMm: dto.slumpMm },
        });
        if (dto.lines) {
          await tx.mixDesignLine.deleteMany({ where: { mixDesignId: id } });
          await tx.mixDesignLine.createMany({ data: dto.lines.map((l, i) => ({ organizationId: user.organizationId, mixDesignId: id, itemId: l.itemId, quantity: l.quantity, sortOrder: i })) });
        }
      })
      .catch((e) => this.codeTaken(e, dto.code ?? d.code));
    await this.audit.log(user, 'MIX_DESIGN', id, 'UPDATED', dto.code ?? d.code);
    return this.designDto(user, await this.design(user, id));
  }

  async approveMixDesign(user: RequestUser, id: string): Promise<MixDesignDto> {
    if (!canApproveMixDesign(user.roleKey)) throw new ForbiddenException('Only quality or management approve mix designs');
    const d = await this.design(user, id);
    if (d.status !== 'DRAFT') throw new BadRequestException('Only a design waiting for approval can be approved');
    await this.prisma.mixDesign.update({ where: { id }, data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() } });
    await this.audit.log(user, 'MIX_DESIGN', id, 'APPROVED', d.code);
    return this.designDto(user, await this.design(user, id));
  }

  async retireMixDesign(user: RequestUser, id: string): Promise<MixDesignDto> {
    if (!canApproveMixDesign(user.roleKey)) throw new ForbiddenException('Only quality or management retire mix designs');
    const d = await this.design(user, id);
    if (d.status === 'RETIRED') return this.designDto(user, d);
    const open = await this.prisma.rmcOrder.count({ where: { mixDesignId: id, status: { in: ['QUOTED', 'CONFIRMED'] } } });
    if (open) throw new BadRequestException(`${open} open ${open === 1 ? 'order uses' : 'orders use'} this design. Complete or move them to another design first.`);
    await this.prisma.mixDesign.update({ where: { id }, data: { status: 'RETIRED' } });
    await this.audit.log(user, 'MIX_DESIGN', id, 'RETIRED', d.code);
    return this.designDto(user, await this.design(user, id));
  }

  // Orders

  private orderDto(user: RequestUser, o: OrderRow): RmcOrderDto {
    const p = orderProgress(o.batches);
    const left = dispatchable(o.quantity, p);
    const sell = canSellRmc(user.roleKey);
    return {
      id: o.id,
      orderNo: o.orderNo,
      plantId: o.plantId,
      plantName: o.plant.name,
      date: dateOnly(o.date),
      status: o.status,
      clientId: o.clientId,
      projectId: o.projectId,
      customer: customerOf(o),
      site: o.site,
      mixDesignId: o.mixDesignId,
      mixDesignCode: o.mixDesign.code,
      grade: o.mixDesign.grade,
      quantity: dec(o.quantity),
      rate: money(o.rate),
      pumpRate: money(o.pumpRate),
      pourDate: dateOnly(o.pourDate),
      validUntil: dateOnly(o.validUntil),
      notes: o.notes,
      delivered: dec(p.delivered),
      onTheWay: dec(p.onTheWay),
      unbilled: dec(p.unbilled),
      value: money(orderValue(o.quantity, o.rate, o.pumpRate)),
      canEdit: sell && (o.status === 'QUOTED' || o.status === 'CONFIRMED'),
      canConfirm: sell && o.status === 'QUOTED',
      canDispatch: canRunRmcPlant(user.roleKey) && o.status === 'CONFIRMED' && o.mixDesign.status === 'APPROVED' && left.gt(0),
      canClose: sell && o.status === 'CONFIRMED',
    };
  }

  private orderWhere(user: RequestUser): Prisma.RmcOrderWhereInput {
    return { organizationId: user.organizationId, plant: this.plantWhere(user) };
  }

  async orders(user: RequestUser, q: RmcOrderQuery): Promise<Paginated<RmcOrderDto>> {
    this.assertView(user);
    const args = pageArgs(q);
    const where: Prisma.RmcOrderWhereInput = {
      ...this.orderWhere(user),
      ...(q.plantId ? { plantId: q.plantId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      AND: searchWords(q.q).map((w) => ({ OR: [{ orderNo: ilike(w) }, { site: ilike(w) }, { client: { name: ilike(w) } }, { project: { name: ilike(w) } }, { mixDesign: { grade: ilike(w) } }] })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rmcOrder.findMany({ where, include: orderInclude, orderBy: [{ date: q.sortOrder === 'asc' ? 'asc' : 'desc' }, { orderNo: 'desc' }], skip: args.skip, take: args.take }),
      this.prisma.rmcOrder.count({ where }),
    ]);
    return paginated(
      rows.map((o) => this.orderDto(user, o)),
      total,
      args,
    );
  }

  private async orderRow(user: RequestUser, id: string): Promise<OrderRow> {
    const o = await this.prisma.rmcOrder.findFirst({ where: { id, ...this.orderWhere(user) }, include: orderInclude });
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  async order(user: RequestUser, id: string): Promise<RmcOrderDto> {
    this.assertView(user);
    return this.orderDto(user, await this.orderRow(user, id));
  }

  private assertSell(user: RequestUser) {
    if (!canSellRmc(user.roleKey)) throw new ForbiddenException('Only sales, the project manager and management quote and take RMC orders');
  }

  private async assertDesignAt(user: RequestUser, mixDesignId: string, plantId: string) {
    const d = await this.prisma.mixDesign.findFirst({ where: { id: mixDesignId, organizationId: user.organizationId }, select: { plantId: true, status: true, code: true } });
    if (!d || d.plantId !== plantId) throw new BadRequestException('Choose a mix design of this plant');
    if (d.status === 'RETIRED') throw new BadRequestException(`${d.code} is retired. Choose a design in use.`);
    return d;
  }

  async createOrder(user: RequestUser, dto: CreateRmcOrderDto): Promise<RmcOrderDto> {
    this.assertView(user);
    this.assertSell(user);
    await this.assertPlant(user, dto.plantId);
    if (!dto.clientId === !dto.projectId) throw new BadRequestException('Choose the customer, or the own site the plant supplies');
    if (dto.clientId && !(await this.prisma.client.count({ where: { id: dto.clientId, organizationId: user.organizationId } }))) throw new BadRequestException('Choose a customer from the client master');
    if (dto.projectId) await this.access.assertCanAccessProject(user, dto.projectId);
    await this.assertDesignAt(user, dto.mixDesignId, dto.plantId);
    const id = await this.prisma.$transaction(async (tx) => {
      const orderNo = await nextDocNo(tx, user.organizationId, 'RMC', async (prefix) => (await tx.rmcOrder.findFirst({ where: { organizationId: user.organizationId, orderNo: { startsWith: prefix } }, orderBy: { orderNo: 'desc' }, select: { orderNo: true } }))?.orderNo ?? null);
      const row = await tx.rmcOrder.create({
        data: {
          organizationId: user.organizationId,
          orderNo,
          plantId: dto.plantId,
          date: parseDate(dto.date),
          clientId: dto.clientId || null,
          projectId: dto.projectId || null,
          site: dto.site || null,
          mixDesignId: dto.mixDesignId,
          quantity: dto.quantity,
          rate: dto.rate,
          pumpRate: dto.pumpRate ?? null,
          pourDate: dto.pourDate ? parseDate(dto.pourDate) : null,
          validUntil: dto.validUntil ? parseDate(dto.validUntil) : null,
          notes: dto.notes || null,
          createdById: user.id,
        },
        select: { id: true, orderNo: true },
      });
      return row;
    });
    await this.audit.log(user, 'RMC_ORDER', id.id, 'CREATED', `${id.orderNo}: ${dto.quantity} m³`);
    return this.order(user, id.id);
  }

  async updateOrder(user: RequestUser, id: string, dto: UpdateRmcOrderDto): Promise<RmcOrderDto> {
    this.assertSell(user);
    const o = await this.orderRow(user, id);
    if (o.status !== 'QUOTED' && o.status !== 'CONFIRMED') throw new BadRequestException('A completed or cancelled order does not change');
    if (dto.mixDesignId && dto.mixDesignId !== o.mixDesignId) {
      if (o.batches.length) throw new BadRequestException('Trucks have gone on this design. Make a new order for another design.');
      const d = await this.assertDesignAt(user, dto.mixDesignId, o.plantId);
      if (o.status === 'CONFIRMED' && d.status !== 'APPROVED') throw new BadRequestException(`${d.code} is not approved yet`);
    }
    if (dto.quantity !== undefined) {
      const p = orderProgress(o.batches);
      if (p.delivered.add(p.onTheWay).gt(D(dto.quantity).mul(1.1))) throw new BadRequestException(`${dec(p.delivered.add(p.onTheWay))} m³ has already gone. Enter at least that much.`);
    }
    await this.prisma.rmcOrder.update({
      where: { id },
      data: {
        date: dto.date ? parseDate(dto.date) : undefined,
        site: dto.site === undefined ? undefined : dto.site || null,
        mixDesignId: dto.mixDesignId,
        quantity: dto.quantity,
        rate: dto.rate,
        pumpRate: dto.pumpRate,
        pourDate: dto.pourDate === undefined ? undefined : dto.pourDate ? parseDate(dto.pourDate) : null,
        validUntil: dto.validUntil === undefined ? undefined : dto.validUntil ? parseDate(dto.validUntil) : null,
        notes: dto.notes === undefined ? undefined : dto.notes || null,
      },
    });
    await this.audit.log(user, 'RMC_ORDER', id, 'UPDATED', o.orderNo);
    return this.order(user, id);
  }

  async confirmOrder(user: RequestUser, id: string): Promise<RmcOrderDto> {
    this.assertSell(user);
    const o = await this.orderRow(user, id);
    if (o.status !== 'QUOTED') throw new BadRequestException('Only a quote becomes an order');
    if (o.mixDesign.status !== 'APPROVED') throw new BadRequestException(`Quality has not approved ${o.mixDesign.code} yet. Ask them to, or choose an approved design.`);
    await this.prisma.rmcOrder.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    await this.audit.log(user, 'RMC_ORDER', id, 'CONFIRMED', o.orderNo);
    return this.order(user, id);
  }

  async closeOrder(user: RequestUser, id: string): Promise<RmcOrderDto> {
    this.assertSell(user);
    const o = await this.orderRow(user, id);
    if (o.status !== 'CONFIRMED') throw new BadRequestException('Only an open order is completed');
    if (o.batches.some((b) => b.status === 'DISPATCHED')) throw new BadRequestException('A truck is still on the way. Mark it delivered or turned back first.');
    await this.prisma.rmcOrder.update({ where: { id }, data: { status: 'CLOSED' } });
    await this.audit.log(user, 'RMC_ORDER', id, 'CLOSED', o.orderNo);
    return this.order(user, id);
  }

  async cancelOrder(user: RequestUser, id: string, note: string | null | undefined): Promise<RmcOrderDto> {
    this.assertSell(user);
    const o = await this.orderRow(user, id);
    if (o.status !== 'QUOTED' && o.status !== 'CONFIRMED') throw new BadRequestException('This order is already completed or cancelled');
    if (o.batches.some((b) => b.status !== 'REJECTED')) throw new BadRequestException('Concrete has gone on this order. Complete it instead.');
    await this.prisma.rmcOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log(user, 'RMC_ORDER', id, 'CANCELLED', note || o.orderNo);
    return this.order(user, id);
  }

  // Batches and challans

  private batchDto(user: RequestUser, b: BatchRow): RmcBatchDto {
    return {
      id: b.id,
      batchNo: b.batchNo,
      orderId: b.orderId,
      orderNo: b.order.orderNo,
      plantId: b.plantId,
      plantName: b.plant.name,
      customer: customerOf(b.order),
      site: b.order.site,
      grade: b.mixDesign.grade,
      mixDesignCode: b.mixDesign.code,
      date: dateOnly(b.date),
      dispatchedAt: iso(b.dispatchedAt),
      quantity: dec(b.quantity),
      truck: b.truck,
      driver: b.driver,
      pumped: b.pumped,
      slumpMm: b.slumpMm,
      status: b.status,
      deliveredAt: iso(b.deliveredAt),
      receivedBy: b.receivedBy,
      note: b.note,
      stockEntryNo: b.stockEntry?.entryNo ?? null,
      invoiceNo: b.invoice?.invoiceNo ?? null,
      cubeTestId: b.cubeTest?.id ?? null,
      cubeTestNo: b.cubeTest?.testNo ?? null,
      cubeResult: b.cubeTest?.result ?? null,
      plantBatchNo: b.plantRows[0]?.batchNo ?? null,
      lines: b.lines.map((l) => ({ itemId: l.itemId, itemName: l.item.name, unit: l.item.unit, designQty: dec(l.designQty), actualQty: dec(l.actualQty), variancePct: variancePct(l.designQty, l.actualQty) })),
      canDeliver: b.status === 'DISPATCHED' && (canRunRmcPlant(user.roleKey) || canSellRmc(user.roleKey)),
      canTakeCubes: b.status !== 'REJECTED' && !b.cubeTest && canRecordTest(user.roleKey),
    };
  }

  private batchWhere(user: RequestUser): Prisma.RmcBatchWhereInput {
    return { organizationId: user.organizationId, plant: this.plantWhere(user) };
  }

  async batches(user: RequestUser, q: RmcBatchQuery): Promise<Paginated<RmcBatchDto>> {
    this.assertView(user);
    const args = pageArgs(q);
    const where: Prisma.RmcBatchWhereInput = {
      ...this.batchWhere(user),
      ...(q.plantId ? { plantId: q.plantId } : {}),
      ...(q.orderId ? { orderId: q.orderId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(dateRange(q.from, q.to) ? { date: dateRange(q.from, q.to) } : {}),
      AND: searchWords(q.q).map((w) => ({ OR: [{ batchNo: ilike(w) }, { truck: ilike(w) }, { order: { orderNo: ilike(w) } }, { order: { client: { name: ilike(w) } } }, { order: { site: ilike(w) } }] })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rmcBatch.findMany({ where, include: batchInclude, orderBy: [{ dispatchedAt: q.sortOrder === 'asc' ? 'asc' : 'desc' }], skip: args.skip, take: args.take }),
      this.prisma.rmcBatch.count({ where }),
    ]);
    return paginated(
      rows.map((b) => this.batchDto(user, b)),
      total,
      args,
    );
  }

  async batch(user: RequestUser, id: string): Promise<RmcBatchDto> {
    this.assertView(user);
    const b = await this.prisma.rmcBatch.findFirst({ where: { id, ...this.batchWhere(user) }, include: batchInclude });
    if (!b) throw new NotFoundException('Batch not found');
    return this.batchDto(user, b);
  }

  /**
   * A truck leaves: the batch and its challan are numbered, then the materials go out of the plant's stock at the design
   * (or as weighed) through the stock service, which refuses what the plant does not have; then the batch is undone.
   */
  async dispatch(user: RequestUser, dto: DispatchBatchDto): Promise<RmcBatchDto> {
    this.assertView(user);
    if (dto.id && (await this.prisma.rmcBatch.count({ where: { id: dto.id, organizationId: user.organizationId } }))) return this.batch(user, dto.id);
    if (!canRunRmcPlant(user.roleKey)) throw new ForbiddenException('Only the plant’s store and engineers dispatch trucks');
    const o = await this.orderRow(user, dto.orderId);
    if (o.status !== 'CONFIRMED') throw new BadRequestException(o.status === 'QUOTED' ? 'This is still a quote. Confirm the order first.' : 'This order is completed or cancelled');
    if (o.mixDesign.status !== 'APPROVED') throw new BadRequestException(`Quality has not approved ${o.mixDesign.code}`);
    const left = dispatchable(o.quantity, orderProgress(o.batches));
    if (D(dto.quantity).gt(left)) throw new BadRequestException(left.lte(0) ? `${o.orderNo} has had all its concrete. Raise the order's quantity to send more.` : `${o.orderNo} can take ${dec(left)} m³ more. Raise the order's quantity to send more.`);
    const design = await this.prisma.mixDesignLine.findMany({ where: { mixDesignId: o.mixDesignId }, orderBy: { sortOrder: 'asc' } });
    const planned = batchQuantities(design, dto.quantity);
    // From the controller's batch: its weights are the lines unless the form sent its own.
    const fromPlant = dto.plantRowId ? await this.plantBatches.forDispatch(user.organizationId, dto.plantRowId, o.plantId) : null;
    if (fromPlant?.read.problems.length) throw new BadRequestException(`The controller's batch cannot be read: ${fromPlant.read.problems[0]}`);
    const weighed = dto.lines?.length ? dto.lines : fromPlant?.read.materials;
    const stray = weighed?.find((l) => !planned.some((p) => p.itemId === l.itemId));
    if (stray) throw new BadRequestException(fromPlant && !dto.lines?.length ? `The controller weighed a material that is not in ${o.mixDesign.code}; check the order or the report's columns` : 'A weighed material is not in the mix design');
    const lines = actualQuantities(planned, weighed);
    const date = todayIn();
    const batch = await this.prisma.$transaction(async (tx) => {
      const batchNo = await nextDocNo(tx, user.organizationId, 'DC', async (prefix) => (await tx.rmcBatch.findFirst({ where: { organizationId: user.organizationId, batchNo: { startsWith: prefix } }, orderBy: { batchNo: 'desc' }, select: { batchNo: true } }))?.batchNo ?? null);
      const made = await tx.rmcBatch.create({
        data: {
          id: dto.id,
          organizationId: user.organizationId,
          batchNo,
          plantId: o.plantId,
          orderId: o.id,
          mixDesignId: o.mixDesignId,
          date: parseDate(date),
          dispatchedAt: new Date(),
          quantity: dto.quantity,
          truck: dto.truck || null,
          driver: dto.driver || null,
          pumped: dto.pumped ?? o.pumpRate !== null,
          slumpMm: dto.slumpMm ?? null,
          note: dto.note || null,
          createdById: user.id,
          lines: { create: lines.map((l) => ({ organizationId: user.organizationId, itemId: l.itemId, designQty: l.designQty, actualQty: l.actualQty })) },
        },
        select: { id: true, batchNo: true },
      });
      if (fromPlant && !(await this.plantBatches.tie(tx, fromPlant.row, made.id))) throw new ConflictException('That batch from the controller is on another challan now');
      return made;
    });
    const issue = lines.filter((l) => l.actualQty.gt(0));
    if (issue.length) {
      try {
        const entry = await this.stock.issue(user, {
          id: randomUUID(),
          projectId: o.plantId,
          date,
          issuedTo: `${batch.batchNo} to ${customerOf(o)}`.slice(0, 200),
          remarks: `${dto.quantity} m³ ${o.mixDesign.grade} (${o.mixDesign.code}) on ${o.orderNo}${dto.truck ? `, truck ${dto.truck}` : ''}`,
          lines: issue.map((l) => ({ itemId: l.itemId, quantity: l.actualQty.toFixed(3) })),
        });
        await this.prisma.rmcBatch.update({ where: { id: batch.id }, data: { stockEntryId: entry.id } });
      } catch (e) {
        await this.prisma.rmcBatch.delete({ where: { id: batch.id } });
        throw e;
      }
    }
    await this.audit.log(user, 'RMC_BATCH', batch.id, 'CREATED', `${batch.batchNo}: ${dto.quantity} m³ on ${o.orderNo}${fromPlant ? `, from the controller's batch ${fromPlant.read.batchNo}` : ''}`);
    return this.batch(user, batch.id);
  }

  private async batchRow(user: RequestUser, id: string) {
    const b = await this.prisma.rmcBatch.findFirst({ where: { id, ...this.batchWhere(user) }, include: batchInclude });
    if (!b) throw new NotFoundException('Batch not found');
    return b;
  }

  async deliver(user: RequestUser, id: string, dto: DeliverBatchDto): Promise<RmcBatchDto> {
    const b = await this.batchRow(user, id);
    if (!this.batchDto(user, b).canDeliver) throw new BadRequestException(b.status === 'DISPATCHED' ? 'Your role does not mark deliveries' : 'This truck is not on the way');
    await this.prisma.rmcBatch.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date(), receivedBy: dto.receivedBy, note: dto.note === undefined ? undefined : dto.note || b.note } });
    await this.audit.log(user, 'RMC_BATCH', id, 'DELIVERED', `${b.batchNo} received by ${dto.receivedBy}`);
    return this.batch(user, id);
  }

  /** The site turned the truck back: it is not billed, and its materials stay issued (the concrete is spent). */
  async reject(user: RequestUser, id: string, dto: RejectBatchDto): Promise<RmcBatchDto> {
    const b = await this.batchRow(user, id);
    if (!this.batchDto(user, b).canDeliver) throw new BadRequestException(b.status === 'DISPATCHED' ? 'Your role does not mark deliveries' : 'This truck is not on the way');
    await this.prisma.rmcBatch.update({ where: { id }, data: { status: 'REJECTED', note: dto.note } });
    await this.audit.log(user, 'RMC_BATCH', id, 'REJECTED', `${b.batchNo}: ${dto.note}`);
    return this.batch(user, id);
  }

  /** Cubes cast from a truck: a concrete cube test at the plant, due at 7 and 28 days, passing at the grade's strength. */
  async takeCubes(user: RequestUser, id: string): Promise<RmcBatchDto> {
    const b = await this.batchRow(user, id);
    if (!canRecordTest(user.roleKey)) throw new ForbiddenException('Your role does not record quality tests');
    if (b.cubeTest) return this.batchDto(user, b);
    if (b.status === 'REJECTED') throw new BadRequestException('This truck was turned back');
    const strength = gradeStrength(b.mixDesign.grade);
    const test = await this.quality.createTest(user, {
      projectId: b.plantId,
      kind: 'CONCRETE_CUBE',
      title: `${b.mixDesign.grade} cubes, ${b.batchNo} to ${customerOf(b.order)}`.slice(0, 200),
      location: b.order.site,
      sampledOn: dateOnly(b.date),
      specification: strength ? `Not less than ${strength} N/mm² at 28 days` : null,
      specMin: strength ? String(strength) : null,
    });
    await this.prisma.qualityTest.update({ where: { id: test.id }, data: { rmcBatchId: b.id } });
    await this.audit.log(user, 'RMC_BATCH', id, 'CUBES', `${test.testNo} for ${b.batchNo}`);
    return this.batch(user, id);
  }

  // The plant's day

  async day(user: RequestUser, q: RmcDayQuery): Promise<RmcDayDto> {
    this.assertView(user);
    const date = q.date ?? todayIn();
    const plants = await this.plantIds(user, q.plantId);
    const day = parseDate(date);
    const [orderRows, batchRows] = await Promise.all([
      this.prisma.rmcOrder.findMany({
        where: { organizationId: user.organizationId, plantId: { in: plants }, OR: [{ status: 'CONFIRMED', OR: [{ pourDate: null }, { pourDate: { lte: day } }] }, { batches: { some: { date: day } } }] },
        include: { ...orderInclude, mixDesign: { select: { code: true, grade: true, status: true, lines: { select: { itemId: true, quantity: true } } } } },
        orderBy: [{ pourDate: 'asc' }, { orderNo: 'asc' }],
      }),
      this.prisma.rmcBatch.findMany({ where: { organizationId: user.organizationId, plantId: { in: plants }, date: day }, include: batchInclude, orderBy: { dispatchedAt: 'desc' } }),
    ]);
    const orders = orderRows.filter((o) => o.status === 'CONFIRMED' || o.batches.length);
    const byGrade = new Map<string, { m3: Prisma.Decimal; trucks: number }>();
    for (const b of batchRows) {
      if (b.status === 'REJECTED') continue;
      const g = byGrade.get(b.mixDesign.grade) ?? { m3: ZERO, trucks: 0 };
      byGrade.set(b.mixDesign.grade, { m3: g.m3.add(b.quantity), trucks: g.trucks + 1 });
    }
    // Materials, plant by plant (a plant's stock covers only its own orders), then added up by item.
    const open = orders.filter((o) => o.status === 'CONFIRMED');
    const merged = new Map<string, { needed: Prisma.Decimal; inStock: Prisma.Decimal; short: boolean }>();
    for (const plantId of new Set(open.map((o) => o.plantId))) {
      const mine = open.filter((o) => o.plantId === plantId);
      const itemIds = [...new Set(mine.flatMap((o) => o.mixDesign.lines.map((l) => l.itemId)))];
      const stockRows = await this.prisma.stockTxn.groupBy({ by: ['itemId'], where: { projectId: plantId, itemId: { in: itemIds } }, _sum: { quantity: true } });
      const stock = new Map(stockRows.map((r) => [r.itemId, r._sum.quantity ?? ZERO]));
      for (const n of materialsNeeded(
        mine.map((o) => ({ quantity: o.quantity, ...orderProgress(o.batches), design: o.mixDesign.lines })),
        stock,
      )) {
        const m = merged.get(n.itemId) ?? { needed: ZERO, inStock: ZERO, short: false };
        merged.set(n.itemId, { needed: m.needed.add(n.needed), inStock: m.inStock.add(n.inStock), short: m.short || n.short });
      }
    }
    const items = await this.prisma.item.findMany({ where: { id: { in: [...merged.keys()] } }, select: { id: true, name: true, unit: true } });
    return {
      date,
      plantId: q.plantId ?? null,
      orders: orders.map((o) => this.orderDto(user, o)),
      batches: batchRows.map((b) => this.batchDto(user, b)),
      byGrade: [...byGrade].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([grade, g]) => ({ grade, m3: dec(g.m3), trucks: g.trucks })),
      materials: items
        .map((i) => {
          const m = merged.get(i.id)!;
          return { itemId: i.id, itemName: i.name, unit: i.unit, needed: dec(m.needed), inStock: dec(m.inStock), short: m.short };
        })
        .sort((a, b) => Number(b.short) - Number(a.short) || a.itemName.localeCompare(b.itemName)),
    };
  }

  // Bills and money received

  private invoiceDto(user: RequestUser, r: InvoiceRow): RmcInvoiceDto {
    const received = r.receipts.reduce((s, x) => s.add(x.amount), ZERO);
    const due = r.status === 'ISSUED' ? amountDue(r.total, r.receipts.map((x) => x.amount)) : ZERO;
    return {
      id: r.id,
      invoiceNo: r.invoiceNo,
      date: dateOnly(r.date),
      plantId: r.plantId,
      plantName: r.plant.name,
      clientId: r.clientId,
      customer: r.client.name,
      gstin: r.client.gstin,
      orderNo: r.order?.orderNo ?? null,
      status: r.status,
      quantity: dec(r.quantity),
      concrete: money(r.concrete),
      pumping: money(r.pumping),
      taxable: money(r.taxable),
      cgst: money(r.cgst),
      sgst: money(r.sgst),
      igst: money(r.igst),
      total: money(r.total),
      received: money(received),
      due: money(due),
      challans: r.batches.map((b) => ({ batchId: b.id, batchNo: b.batchNo, date: dateOnly(b.date), quantity: dec(b.quantity), grade: b.mixDesign.grade })),
      canCancel: canBillRmc(user.roleKey) && r.status === 'ISSUED' && !r.tallyExportId && !r.receipts.length,
      canReceive: canBillRmc(user.roleKey) && r.status === 'ISSUED' && due.gt(0),
    };
  }

  private invoiceWhere(user: RequestUser): Prisma.RmcInvoiceWhereInput {
    return { organizationId: user.organizationId, plant: this.plantWhere(user) };
  }

  async invoices(user: RequestUser, q: RmcInvoiceQuery): Promise<Paginated<RmcInvoiceDto>> {
    this.assertView(user);
    const args = pageArgs(q);
    const where: Prisma.RmcInvoiceWhereInput = {
      ...this.invoiceWhere(user),
      ...(q.plantId ? { plantId: q.plantId } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      AND: searchWords(q.q).map((w) => ({ OR: [{ invoiceNo: ilike(w) }, { client: { name: ilike(w) } }, { order: { orderNo: ilike(w) } }] })),
    };
    const rows = await this.prisma.rmcInvoice.findMany({ where, include: invoiceInclude, orderBy: [{ date: q.sortOrder === 'asc' ? 'asc' : 'desc' }, { invoiceNo: 'desc' }] });
    const dtos = rows.map((r) => this.invoiceDto(user, r)).filter((r) => !q.due || Number(r.due) > 0);
    return paginated(dtos.slice(args.skip, args.skip + args.take), dtos.length, args);
  }

  async invoice(user: RequestUser, id: string): Promise<RmcInvoiceDto> {
    this.assertView(user);
    const r = await this.prisma.rmcInvoice.findFirst({ where: { id, ...this.invoiceWhere(user) }, include: invoiceInclude });
    if (!r) throw new NotFoundException('Bill not found');
    return this.invoiceDto(user, r);
  }

  private assertBill(user: RequestUser) {
    if (!canBillRmc(user.roleKey)) throw new ForbiddenException('Only accounts and management bill RMC customers');
  }

  /** A GST bill for an order's delivered challans not yet billed (all of them, or those chosen). */
  async createInvoice(user: RequestUser, dto: CreateRmcInvoiceDto): Promise<RmcInvoiceDto> {
    this.assertBill(user);
    const o = await this.orderRow(user, dto.orderId);
    if (!o.clientId) throw new BadRequestException('Concrete for an own site is not billed');
    if (dto.date > todayIn()) throw new BadRequestException('A bill cannot be dated in the future');
    const challans = await this.prisma.rmcBatch.findMany({
      where: { orderId: o.id, status: 'DELIVERED', invoiceId: null, ...(dto.batchIds ? { id: { in: dto.batchIds } } : {}) },
      select: { id: true, quantity: true, pumped: true },
    });
    if (dto.batchIds && challans.length !== dto.batchIds.length) throw new BadRequestException('Choose delivered challans of this order not yet billed');
    if (!challans.length) throw new BadRequestException('This order has no delivered challans to bill');
    const [client, cfg] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: o.clientId }, select: { gstin: true, stateCode: true } }),
      this.prisma.tallyConfig.findUnique({ where: { organizationId: user.organizationId }, select: { stateCode: true } }),
    ]);
    const a = invoiceAmounts(challans, o.rate, o.pumpRate, isInterState(cfg?.stateCode, gstStateCode(client.gstin) ?? client.stateCode));
    const created = await this.prisma.$transaction(async (tx) => {
      const invoiceNo = await nextDocNo(tx, user.organizationId, 'RINV', async (prefix) => (await tx.rmcInvoice.findFirst({ where: { organizationId: user.organizationId, invoiceNo: { startsWith: prefix } }, orderBy: { invoiceNo: 'desc' }, select: { invoiceNo: true } }))?.invoiceNo ?? null);
      const row = await tx.rmcInvoice.create({
        data: { organizationId: user.organizationId, invoiceNo, plantId: o.plantId, clientId: o.clientId!, orderId: o.id, date: parseDate(dto.date), ...a, createdById: user.id },
        select: { id: true, invoiceNo: true },
      });
      const n = await tx.rmcBatch.updateMany({ where: { id: { in: challans.map((c) => c.id) }, invoiceId: null }, data: { invoiceId: row.id } });
      if (n.count !== challans.length) throw new ConflictException('Someone billed some of these challans just now. Open the order again.');
      return row;
    });
    await this.audit.log(user, 'RMC_INVOICE', created.id, 'CREATED', `${created.invoiceNo}: ${challans.length} challans, ₹${a.total.toFixed(2)}`);
    return this.invoice(user, created.id);
  }

  async cancelInvoice(user: RequestUser, id: string, note: string | null | undefined): Promise<RmcInvoiceDto> {
    this.assertBill(user);
    const r = await this.prisma.rmcInvoice.findFirst({ where: { id, ...this.invoiceWhere(user) }, include: invoiceInclude });
    if (!r) throw new NotFoundException('Bill not found');
    if (r.status !== 'ISSUED') throw new BadRequestException('This bill is already cancelled');
    if (r.tallyExportId) throw new BadRequestException('This bill has gone to Tally. Raise a credit note there instead.');
    if (r.receipts.length) throw new BadRequestException('Money has been received against this bill. Remove that first.');
    await this.prisma.$transaction([
      this.prisma.rmcBatch.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
      this.prisma.rmcInvoice.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelNote: note || null } }),
    ]);
    await this.audit.log(user, 'RMC_INVOICE', id, 'CANCELLED', note || r.invoiceNo);
    return this.invoice(user, id);
  }

  private receiptDto(r: Prisma.RmcReceiptGetPayload<{ include: { client: { select: { name: true } }; invoice: { select: { invoiceNo: true } } } }>): RmcReceiptDto {
    return {
      id: r.id,
      date: dateOnly(r.date),
      clientId: r.clientId,
      customer: r.client.name,
      invoiceId: r.invoiceId,
      invoiceNo: r.invoice?.invoiceNo ?? null,
      amount: money(r.amount),
      mode: r.mode,
      reference: r.reference,
    };
  }

  async receipts(user: RequestUser, q: RmcReceiptQuery): Promise<Paginated<RmcReceiptDto>> {
    this.assertView(user);
    if (!canBillRmc(user.roleKey) && !canSellRmc(user.roleKey)) throw new ForbiddenException('Only accounts and sales see money received');
    const args = pageArgs(q);
    const where: Prisma.RmcReceiptWhereInput = {
      organizationId: user.organizationId,
      ...(q.clientId ? { clientId: q.clientId } : {}),
      AND: searchWords(q.q).map((w) => ({ OR: [{ reference: ilike(w) }, { client: { name: ilike(w) } }, { invoice: { invoiceNo: ilike(w) } }] })),
    };
    const include = { client: { select: { name: true } }, invoice: { select: { invoiceNo: true } } } as const;
    const [rows, total] = await Promise.all([this.prisma.rmcReceipt.findMany({ where, include, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: args.skip, take: args.take }), this.prisma.rmcReceipt.count({ where })]);
    return paginated(
      rows.map((r) => this.receiptDto(r)),
      total,
      args,
    );
  }

  async createReceipt(user: RequestUser, dto: CreateRmcReceiptDto): Promise<RmcReceiptDto> {
    this.assertBill(user);
    if (dto.date > todayIn()) throw new BadRequestException('Money cannot be received in the future');
    if (!(await this.prisma.client.count({ where: { id: dto.clientId, organizationId: user.organizationId } }))) throw new BadRequestException('Choose a customer from the client master');
    if (dto.invoiceId) {
      const inv = await this.invoice(user, dto.invoiceId);
      if (inv.clientId !== dto.clientId) throw new BadRequestException(`${inv.invoiceNo} is ${inv.customer}'s bill`);
      if (inv.status !== 'ISSUED') throw new BadRequestException(`${inv.invoiceNo} is cancelled`);
      if (D(dto.amount).gt(inv.due)) throw new BadRequestException(`${inv.invoiceNo} has ₹${inv.due} due. Record the rest on account, without a bill.`);
    }
    const row = await this.prisma.rmcReceipt.create({
      data: { organizationId: user.organizationId, clientId: dto.clientId, invoiceId: dto.invoiceId || null, date: parseDate(dto.date), amount: dto.amount, mode: dto.mode, reference: dto.reference || null, createdById: user.id },
      include: { client: { select: { name: true } }, invoice: { select: { invoiceNo: true } } },
    });
    await this.audit.log(user, 'RMC_RECEIPT', row.id, 'CREATED', `₹${dto.amount} from ${row.client.name}`);
    return this.receiptDto(row);
  }
}

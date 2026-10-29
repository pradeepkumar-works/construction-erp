import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canKeepStock,
  canManageStore,
  grnAboveNet,
  kgToUnit,
  shortSupply,
  weighNet,
  weighStepProblem,
  weighTicketState,
  type WeighbridgeBoardDto,
  type WeighingDto,
  type WeighTicketDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dec, iso } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextTicketNo, type WeighingIn } from './weighbridge-rules';
import type { CancelWeighTicketDto, CreateWeighTicketDto, TicketDetailsDto, UpdateWeighTicketDto, WeightDto } from './weighbridge.dto';

const ticketInclude = {
  project: { select: { name: true } },
  purchaseOrder: { select: { poNo: true, vendorId: true, vendor: { select: { name: true } } } },
  purchaseOrderLine: { select: { itemName: true, unit: true } },
  stockEntry: { select: { entryNo: true, lines: { select: { purchaseOrderLineId: true, quantity: true } } } },
  createdBy: { select: { fullName: true } },
} as const;
type Ticket = Prisma.WeighTicketGetPayload<{ include: typeof ticketInclude }>;

const n = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : Number(v));
const DAY = 86_400_000;

/**
 * Weighbridge (item 148, ARCHITECTURE "Weighbridge"): the weights the Connector reads from a site's indicator, and the
 * store's tickets, each a truck's first and second weight with the order and challan it brought. The net weight drafts
 * the GRN, which `StockService.receive` makes and ties to the ticket; short supply and the GRN against the net weight
 * are `shortSupply` and `grnAboveNet` (`@erp/shared/weighbridge.ts`).
 */
@Injectable()
export class WeighbridgeService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  /** A weight from the Connector, kept for the site's store to put on a ticket. */
  async take(conn: { id: string; organizationId: string; projectId: string | null }, w: WeighingIn): Promise<{ id: string }> {
    if (!conn.projectId) throw new BadRequestException("The weighbridge has no site; choose it in the connection's settings");
    return this.prisma.weighing.create({
      data: { organizationId: conn.organizationId, connectionId: conn.id, projectId: conn.projectId, at: w.at, weightKg: w.weightKg, stableSeconds: w.stableSeconds },
      select: { id: true },
    });
  }

  private assertSees(user: RequestUser) {
    if (!canKeepStock(user.roleKey) && !canManageStore(user.roleKey)) throw new ForbiddenException('Your role does not see the weighbridge');
  }

  private toDto(t: Ticket): WeighTicketDto {
    const first = Number(t.firstKg);
    const second = n(t.secondKg);
    const net = weighNet(first, second);
    const unit = t.purchaseOrderLine?.unit ?? null;
    const grnQty = t.stockEntry && t.purchaseOrderLineId ? t.stockEntry.lines.filter((l) => l.purchaseOrderLineId === t.purchaseOrderLineId).reduce((s, l) => s + Number(l.quantity), 0) : null;
    return {
      id: t.id,
      ticketNo: t.ticketNo,
      projectId: t.projectId,
      projectName: t.project.name,
      vehicleNo: t.vehicleNo,
      vendorId: t.purchaseOrder?.vendorId ?? null,
      vendorName: t.purchaseOrder?.vendor.name ?? null,
      purchaseOrderId: t.purchaseOrderId,
      poNo: t.purchaseOrder?.poNo ?? null,
      purchaseOrderLineId: t.purchaseOrderLineId,
      itemName: t.purchaseOrderLine?.itemName ?? null,
      unit,
      challanNo: t.challanNo,
      challanQty: dec(t.challanQty),
      first: { kg: dec(t.firstKg)!, at: t.firstAt.toISOString(), typed: !t.firstWeighingId && !t.cancelledAt },
      second: second === null || !t.secondAt ? null : { kg: dec(t.secondKg)!, at: t.secondAt.toISOString(), typed: !t.secondWeighingId && !t.cancelledAt },
      grossKg: net ? String(net.grossKg) : null,
      tareKg: net ? String(net.tareKg) : null,
      netKg: net ? String(net.netKg) : null,
      netQty: net ? (kgToUnit(net.netKg, unit)?.toString() ?? null) : null,
      short: net ? shortSupply(net.netKg, n(t.challanQty), unit) : null,
      state: weighTicketState(t),
      stockEntryId: t.stockEntryId,
      grnNo: t.stockEntry?.entryNo ?? null,
      grnQty: grnQty === null ? null : String(Math.round(grnQty * 1000) / 1000),
      grnAboveNetKg: net && grnQty !== null ? grnAboveNet(grnQty, net.netKg, unit) : null,
      cancelReason: t.cancelReason,
      remarks: t.remarks,
      createdByName: t.createdBy.fullName,
      createdAt: t.createdAt.toISOString(),
    };
  }

  /** GET /weighbridge: the weights on the bridge no ticket uses, the trucks waiting, the tickets to receive and the week's done. */
  async board(user: RequestUser, projectId?: string): Promise<WeighbridgeBoardDto> {
    this.assertSees(user);
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const project: Prisma.ProjectWhereInput = { ...this.access.projectWhere(user), ...(projectId ? { id: projectId } : {}) };
    const now = Date.now();
    const [bridges, weighings, tickets] = await Promise.all([
      this.prisma.integrationConnection.count({ where: { organizationId: user.organizationId, kind: 'WEIGHBRIDGE', project } }),
      this.prisma.weighing.findMany({
        where: { organizationId: user.organizationId, project, at: { gte: new Date(now - DAY) }, firstOf: null, secondOf: null },
        include: { connection: { select: { name: true } } },
        orderBy: { at: 'desc' },
        take: 50,
      }),
      this.prisma.weighTicket.findMany({
        where: {
          organizationId: user.organizationId,
          project,
          OR: [
            { cancelledAt: null, stockEntryId: null, createdAt: { gte: new Date(now - 30 * DAY) } },
            { OR: [{ cancelledAt: { gte: new Date(now - 7 * DAY) } }, { stockEntryId: { not: null }, updatedAt: { gte: new Date(now - 7 * DAY) } }] },
          ],
        },
        include: ticketInclude,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    const dtos = tickets.map((t) => this.toDto(t));
    return {
      bridges,
      weighings: weighings.map(
        (w): WeighingDto => ({ id: w.id, projectId: w.projectId, connectionId: w.connectionId, connectionName: w.connection.name, at: w.at.toISOString(), weightKg: dec(w.weightKg)!, stableSeconds: w.stableSeconds }),
      ),
      open: dtos.filter((t) => t.state === 'FIRST'),
      weighed: dtos.filter((t) => t.state === 'WEIGHED'),
      done: dtos.filter((t) => t.state === 'RECEIVED' || t.state === 'CANCELLED'),
    };
  }

  private async ticket(user: RequestUser, id: string): Promise<Ticket> {
    const t = await this.prisma.weighTicket.findFirst({ where: { id, organizationId: user.organizationId, project: this.access.projectWhere(user) }, include: ticketInclude });
    if (!t) throw new NotFoundException('Weighbridge ticket not found');
    return t;
  }

  async get(user: RequestUser, id: string): Promise<WeighTicketDto> {
    this.assertSees(user);
    return this.toDto(await this.ticket(user, id));
  }

  /** A weight for a ticket: the bridge's weighing (this site's, not on another ticket), or the one typed. */
  private async weightOf(user: RequestUser, projectId: string, w: WeightDto | undefined): Promise<{ kg: number; at: Date; weighingId: string | null }> {
    if (w?.weighingId) {
      const r = await this.prisma.weighing.findFirst({ where: { id: w.weighingId, organizationId: user.organizationId }, include: { firstOf: { select: { ticketNo: true } }, secondOf: { select: { ticketNo: true } } } });
      if (!r || r.projectId !== projectId) throw new BadRequestException("Pick a weight from this site's weighbridge");
      const on = r.firstOf ?? r.secondOf;
      if (on) throw new ConflictException(`That weight is already on ${on.ticketNo}`);
      return { kg: Number(r.weightKg), at: r.at, weighingId: r.id };
    }
    if (typeof w?.weightKg !== 'number') throw new BadRequestException('Pick the weight on the bridge or type it');
    return { kg: Math.round(w.weightKg * 1000) / 1000, at: new Date(), weighingId: null };
  }

  /** The order and line a ticket names: an approved, open order of the ticket's project, and one of its lines. */
  private async orderOf(user: RequestUser, projectId: string, d: TicketDetailsDto, current?: { purchaseOrderId: string | null; purchaseOrderLineId: string | null }) {
    const purchaseOrderId = d.purchaseOrderId === undefined ? (current?.purchaseOrderId ?? null) : d.purchaseOrderId;
    let purchaseOrderLineId = d.purchaseOrderLineId === undefined ? (current?.purchaseOrderLineId ?? null) : d.purchaseOrderLineId;
    if (!purchaseOrderId) return { purchaseOrderId: null, purchaseOrderLineId: null };
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, organizationId: user.organizationId }, select: { poNo: true, projectId: true, status: true, closedAt: true, lines: { select: { id: true } } } });
    if (!po || po.projectId !== projectId) throw new BadRequestException("Pick a purchase order of this ticket's project");
    if (po.status !== 'APPROVED' || po.closedAt) throw new ConflictException(`${po.poNo} is not an approved, open order`);
    if (!purchaseOrderLineId && po.lines.length === 1) purchaseOrderLineId = po.lines[0].id;
    if (purchaseOrderLineId && !po.lines.some((l) => l.id === purchaseOrderLineId)) throw new BadRequestException(`Pick a line of ${po.poNo}`);
    return { purchaseOrderId, purchaseOrderLineId };
  }

  private nextNo(tx: Prisma.TransactionClient, organizationId: string) {
    const year = new Date().getUTCFullYear();
    return tx.weighTicket
      .findFirst({ where: { organizationId, ticketNo: { startsWith: `WB-${year}-` } }, orderBy: { ticketNo: 'desc' }, select: { ticketNo: true } })
      .then((last) => nextTicketNo(last?.ticketNo ?? null, year));
  }

  /** POST /weighbridge/tickets: a truck on the bridge, its first weight and what it brings. */
  async create(user: RequestUser, dto: CreateWeighTicketDto): Promise<WeighTicketDto> {
    if (dto.id) {
      const seen = await this.prisma.weighTicket.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (seen) return this.get(user, seen.id);
    }
    await this.access.assertCanKeepStock(user, dto.projectId);
    const first = await this.weightOf(user, dto.projectId, dto.first);
    const order = await this.orderOf(user, dto.projectId, dto);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`weigh:${user.organizationId}`}))`;
        const row = await tx.weighTicket.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            ticketNo: await this.nextNo(tx, user.organizationId),
            vehicleNo: dto.vehicleNo.toUpperCase().replace(/\s+/g, ' '),
            ...order,
            challanNo: dto.challanNo || null,
            challanQty: dto.challanQty ?? null,
            firstKg: first.kg,
            firstAt: first.at,
            firstWeighingId: first.weighingId,
            remarks: dto.remarks || null,
            createdById: user.id,
          },
          select: { id: true, ticketNo: true },
        });
        await this.audit.log(user, 'WEIGH_TICKET', row.id, 'CREATED', `${row.ticketNo}: ${dto.vehicleNo}, first weight ${first.kg} kg${first.weighingId ? '' : ' (typed)'}`);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('That weight was just put on another ticket; pick it again');
      throw e;
    }
    return this.get(user, id);
  }

  private open(t: Ticket) {
    if (t.cancelledAt) throw new ConflictException(`${t.ticketNo} is cancelled`);
    if (t.stockEntryId) throw new ConflictException(`${t.ticketNo} is received as ${t.stockEntry?.entryNo}; it can no longer change`);
  }

  /** POST /weighbridge/tickets/:id/second: the truck back on the bridge; the net weight is the difference. */
  async second(user: RequestUser, id: string, dto: WeightDto): Promise<WeighTicketDto> {
    const t = await this.ticket(user, id);
    await this.access.assertCanKeepStock(user, t.projectId);
    this.open(t);
    if (t.secondKg !== null) throw new ConflictException(`${t.ticketNo} already has its second weight`);
    const w = await this.weightOf(user, t.projectId, dto);
    const problem = weighStepProblem({ kg: Number(t.firstKg), at: t.firstAt }, { kg: w.kg, at: w.at });
    if (problem) throw new BadRequestException(problem);
    try {
      await this.prisma.weighTicket.update({ where: { id }, data: { secondKg: w.kg, secondAt: w.at, secondWeighingId: w.weighingId } });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('That weight was just put on another ticket; pick it again');
      throw e;
    }
    const net = weighNet(Number(t.firstKg), w.kg)!;
    await this.audit.log(user, 'WEIGH_TICKET', id, 'UPDATED', `Second weight ${w.kg} kg${w.weighingId ? '' : ' (typed)'}, net ${net.netKg} kg`);
    return this.get(user, id);
  }

  /** PATCH /weighbridge/tickets/:id: the truck, order, line and challan, until the GRN is made. */
  async update(user: RequestUser, id: string, dto: UpdateWeighTicketDto): Promise<WeighTicketDto> {
    const t = await this.ticket(user, id);
    await this.access.assertCanKeepStock(user, t.projectId);
    this.open(t);
    const order = await this.orderOf(user, t.projectId, dto, t);
    await this.prisma.weighTicket.update({
      where: { id },
      data: {
        ...(dto.vehicleNo ? { vehicleNo: dto.vehicleNo.toUpperCase().replace(/\s+/g, ' ') } : {}),
        ...order,
        ...(dto.challanNo !== undefined ? { challanNo: dto.challanNo || null } : {}),
        ...(dto.challanQty !== undefined ? { challanQty: dto.challanQty } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks || null } : {}),
      },
    });
    await this.audit.log(user, 'WEIGH_TICKET', id, 'UPDATED', null);
    return this.get(user, id);
  }

  /** POST /weighbridge/tickets/:id/cancel: a truck that turned back; its weights go back to the bridge's list. */
  async cancel(user: RequestUser, id: string, dto: CancelWeighTicketDto): Promise<WeighTicketDto> {
    const t = await this.ticket(user, id);
    await this.access.assertCanKeepStock(user, t.projectId);
    this.open(t);
    await this.prisma.weighTicket.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: dto.reason, firstWeighingId: null, secondWeighingId: null } });
    await this.audit.log(user, 'WEIGH_TICKET', id, 'CANCELLED', dto.reason);
    return this.get(user, id);
  }

  /** Received tickets with a challan quantity, for the watch list's short deliveries (WEIGH_SHORT). */
  async receivedSince(projectIds: string[], since: Date) {
    if (!projectIds.length) return [];
    const rows = await this.prisma.weighTicket.findMany({
      where: { projectId: { in: projectIds }, stockEntryId: { not: null }, cancelledAt: null, secondAt: { gte: since } },
      include: ticketInclude,
      orderBy: { secondAt: 'asc' },
    });
    return rows.map((t) => this.toDto(t));
  }
}

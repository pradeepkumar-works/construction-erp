import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  amendFloorQty,
  amendLineAmount,
  amendmentLinesProblem,
  amendmentOpenProblem,
  amendmentSummary,
  canEditSubmission,
  canIssueWorkOrder,
  canViewWorkOrders,
  woAmendmentLabel,
  type AmendLineNow,
  type AmendLineProposed,
  type WorkOrderAmendmentDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { D, ZERO, sum } from '../purchasing/purchase-math';
import { CreateWoAmendmentDto, UpdateWoAmendmentDto, WoAmendmentLineInput } from './subcontracts.dto';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

/** What an order's lines are held to now: billed on bills not rejected, and measured on approved sheets. */
const ORDER_STATE = {
  lines: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: { boqItem: { select: { itemNo: true } }, billLines: { where: { bill: { status: { not: 'REJECTED' as const } } }, select: { thisQty: true } } },
  },
  measurements: { where: { status: 'APPROVED' as const }, select: { boqItemId: true, totalQty: true } },
  bills: { where: { isFinal: true, status: 'APPROVED' as const }, select: { id: true } },
} satisfies Prisma.WorkOrderInclude;
type OrderState = Prisma.WorkOrderGetPayload<{ include: typeof ORDER_STATE }>;

const include = {
  project: { select: { name: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  lines: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }], include: { boqItem: { select: { itemNo: true } } } },
  workOrder: { include: { vendor: { select: { name: true } }, ...ORDER_STATE } },
} satisfies Prisma.WorkOrderAmendmentInclude;
type Row = Prisma.WorkOrderAmendmentGetPayload<{ include: typeof include }>;

/** The order's lines as the pure rules read them. */
function linesNow(wo: OrderState): AmendLineNow[] {
  const measured = new Map<string, Prisma.Decimal>();
  for (const m of wo.measurements) measured.set(m.boqItemId, (measured.get(m.boqItemId) ?? ZERO).add(m.totalQty));
  return wo.lines.map((l) => ({
    id: l.id,
    boqItemId: l.boqItemId,
    description: l.description,
    quantity: l.quantity.toString(),
    rate: l.rate.toString(),
    billedQty: sum(l.billLines, (b) => b.thisQty).toString(),
    measuredQty: (l.boqItemId ? (measured.get(l.boqItemId) ?? ZERO) : ZERO).toString(),
  }));
}

const proposedOf = (lines: { workOrderLineId: string | null; qtyBefore: Prisma.Decimal | null; boqItemId: string | null; description: string; quantity: Prisma.Decimal; rate: Prisma.Decimal }[]): AmendLineProposed[] =>
  lines.map((l) => ({ workOrderLineId: l.qtyBefore === null ? null : l.workOrderLineId, boqItemId: l.boqItemId, description: l.description, quantity: l.quantity.toString(), rate: l.rate.toString() }));

function parseAmendQty(raw: string, what: string) {
  const q = D(raw);
  if (q.decimalPlaces() > 3) throw new BadRequestException(`${what}: use at most 3 decimals`);
  if (q.gte(1e12)) throw new BadRequestException(`${what}: the quantity is too large`);
  return q;
}

function parseAmendRate(raw: string, what: string) {
  const r = D(raw);
  if (r.decimalPlaces() > 2) throw new BadRequestException(`${what}: the rate can have at most 2 decimals`);
  if (r.gte(1e12)) throw new BadRequestException(`${what}: the rate is too large`);
  return r;
}

/**
 * Amendments to approved work orders (submission type WO_AMENDMENT): a draft starts from the order's lines as they are;
 * quantities and rates change, items are added and the end date moves, held by the pure rules in
 * `@erp/shared/work-order-amendment.ts`. The approval matrix decides it on the order's value after the amendment. Once
 * approved it is written to the order's lines in place (never deleted and made again, so bills keep pointing at them).
 * The order keeps taking measurements, issues and bills while an amendment waits.
 */
@Injectable()
export class WorkOrderAmendmentsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private rights: ApprovalRightsService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
  ) {
    lifecycle.beforeApprove('WO_AMENDMENT', (_user, id) => this.assertStillFits(id));
    lifecycle.onApproved('WO_AMENDMENT', async (_user, id) => {
      await this.apply(id);
    });
  }

  toDto(r: Row): WorkOrderAmendmentDto {
    const now = new Map(linesNow(r.workOrder).map((l) => [l.id, l]));
    const summary = amendmentSummary(
      r.lines.filter((l) => l.qtyBefore !== null).map((l) => ({ id: l.workOrderLineId ?? l.id, quantity: l.qtyBefore!.toString(), rate: l.rateBefore!.toString() })),
      r.lines.map((l) => ({ workOrderLineId: l.qtyBefore === null ? null : (l.workOrderLineId ?? l.id), boqItemId: l.boqItemId, description: l.description, quantity: l.quantity.toString(), rate: l.rate.toString() })),
    );
    const label = woAmendmentLabel(r.workOrder.woNo, r.amendmentNo);
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      workOrderId: r.workOrderId,
      woNo: r.workOrder.woNo,
      woTitle: r.workOrder.title,
      vendorId: r.workOrder.vendorId,
      vendorName: r.workOrder.vendor.name,
      amendmentNo: r.amendmentNo,
      label,
      reason: r.reason,
      endDate: dateOnly(r.endDate),
      endDateBefore: dateOnly(r.endDateBefore),
      valueBefore: money(r.valueBefore),
      valueAfter: money(r.valueAfter),
      change: money(r.valueAfter.sub(r.valueBefore)),
      changedLines: summary.changed,
      addedLines: summary.added,
      appliedAt: iso(r.appliedAt),
      lines: r.lines.map((l) => {
        const isNew = l.qtyBefore === null;
        const held = l.workOrderLineId ? now.get(l.workOrderLineId) : undefined;
        return {
          id: l.id,
          workOrderLineId: l.workOrderLineId,
          boqItemId: l.boqItemId,
          itemNo: l.boqItem?.itemNo ?? null,
          description: l.description,
          unit: l.unit,
          qtyBefore: dec(l.qtyBefore),
          rateBefore: money(l.rateBefore),
          amountBefore: isNew ? null : amendLineAmount(l.qtyBefore!.toString(), l.rateBefore!.toString()),
          quantity: dec(l.quantity),
          rate: money(l.rate),
          amount: money(l.amount),
          isNew,
          changed: isNew || !l.quantity.eq(l.qtyBefore!) || !l.rate.eq(l.rateBefore!),
          floorQty: held ? dec(D(amendFloorQty(held))) : '0',
        };
      }),
      status: r.status,
      submittedById: r.submittedById,
      submittedByName: r.submittedBy.fullName,
      submittedAt: iso(r.submittedAt),
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      reviewedAt: iso(r.reviewedAt),
      reviewNote: r.reviewNote,
      attachments: [],
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  /** Roles that see work orders, and any role the approval matrix lets approve amendments. */
  private async assertCanSee(user: RequestUser) {
    if (canViewWorkOrders(user.roleKey)) return;
    const rights = await this.rights.rightsFor(user);
    if (!rights.some((r) => r.type === 'WO_AMENDMENT')) throw new ForbiddenException('Your role cannot see work orders');
  }

  private async assertCanRaise(user: RequestUser, projectId: string) {
    if (!canIssueWorkOrder(user.roleKey)) throw new ForbiddenException('Only project managers, the QS, procurement and management amend work orders');
    await this.access.assertCanAccessProject(user, projectId);
  }

  async get(user: RequestUser, id: string): Promise<WorkOrderAmendmentDto> {
    await this.assertCanSee(user);
    const row = await this.prisma.workOrderAmendment.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Work order amendment not found');
    return this.toDto(row);
  }

  async forOrder(user: RequestUser, workOrderId: string): Promise<WorkOrderAmendmentDto[]> {
    await this.assertCanSee(user);
    const rows = await this.prisma.workOrderAmendment.findMany({ where: { workOrderId, ...this.access.submissionWhere(user) }, include, orderBy: { amendmentNo: 'asc' } });
    return rows.map((r) => this.toDto(r));
  }

  private async order(db: Db, organizationId: string, workOrderId: string) {
    const wo = await db.workOrder.findFirst({ where: { id: workOrderId, organizationId }, include: ORDER_STATE });
    if (!wo) throw new NotFoundException('Work order not found');
    return wo;
  }

  /** Why the order cannot take an amendment now (`except`: the amendment being checked does not count as another). */
  private async openProblem(db: Db, wo: OrderState, except?: string) {
    const open = await db.workOrderAmendment.findFirst({
      where: { workOrderId: wo.id, id: except ? { not: except } : undefined, OR: [{ status: { notIn: ['APPROVED', 'REJECTED'] } }, { status: 'APPROVED', appliedAt: null }] },
      select: { amendmentNo: true },
    });
    return amendmentOpenProblem({ woNo: wo.woNo, status: wo.status, closedAt: iso(wo.closedAt), finalBillApproved: wo.bills.length > 0, openAmendmentNo: open?.amendmentNo ?? null });
  }

  /** A draft on the order's lines as they stand, numbered after the last one raised on it. */
  async create(user: RequestUser, workOrderId: string, dto: CreateWoAmendmentDto): Promise<WorkOrderAmendmentDto> {
    const head = await this.order(this.prisma, user.organizationId, workOrderId);
    await this.assertCanRaise(user, head.projectId);
    await this.applyPending(workOrderId);
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`WOA:${workOrderId}`}))`;
      const wo = await this.order(tx, user.organizationId, workOrderId);
      const problem = await this.openProblem(tx, wo);
      if (problem) throw new ConflictException(problem);
      const last = await tx.workOrderAmendment.aggregate({ where: { workOrderId }, _max: { amendmentNo: true } });
      const row = await tx.workOrderAmendment.create({
        data: {
          organizationId: user.organizationId,
          projectId: wo.projectId,
          workOrderId,
          amendmentNo: (last._max.amendmentNo ?? 0) + 1,
          reason: dto.reason ?? '',
          endDateBefore: wo.endDate,
          valueBefore: wo.value,
          valueAfter: wo.value,
          submittedById: user.id,
          status: 'DRAFT',
          lines: {
            create: wo.lines.map((l, i) => ({
              workOrderLineId: l.id,
              boqItemId: l.boqItemId,
              description: l.description,
              unit: l.unit,
              qtyBefore: l.quantity,
              rateBefore: l.rate,
              quantity: l.quantity,
              rate: l.rate,
              amount: l.amount,
              sortOrder: i,
            })),
          },
        },
        select: { id: true },
      });
      return row.id;
    });
    await this.audit.log(user, 'WO_AMENDMENT', id, 'CREATED');
    return this.get(user, id);
  }

  /** The proposal priced: the order's lines (given ones changed, the rest as they are) and the new items after them. */
  private async proposal(wo: OrderState, input: WoAmendmentLineInput[]) {
    const given = new Map<string, WoAmendmentLineInput>();
    for (const l of input) {
      if (!l.workOrderLineId) continue;
      if (given.has(l.workOrderLineId)) throw new BadRequestException('A line of the order is in the amendment twice');
      if (!wo.lines.some((x) => x.id === l.workOrderLineId)) throw new BadRequestException('A line is not part of this work order');
      given.set(l.workOrderLineId, l);
    }
    const added = input.filter((l) => !l.workOrderLineId);
    const boqIds = added.map((l) => l.boqItemId).filter((x): x is string => !!x);
    const boq = boqIds.length ? await this.prisma.boqItem.findMany({ where: { id: { in: boqIds }, projectId: wo.projectId }, select: { id: true, itemNo: true, description: true, unit: true } }) : [];
    const kept = wo.lines.map((l, i) => {
      const g = given.get(l.id);
      const quantity = g ? parseAmendQty(g.quantity, l.description) : l.quantity;
      const rate = g ? parseAmendRate(g.rate, l.description) : l.rate;
      return { workOrderLineId: l.id, boqItemId: l.boqItemId, description: l.description, unit: l.unit, qtyBefore: l.quantity, rateBefore: l.rate, quantity, rate, sortOrder: i };
    });
    const fresh = added.map((l, i) => {
      const b = l.boqItemId ? boq.find((x) => x.id === l.boqItemId) : null;
      if (l.boqItemId && !b) throw new BadRequestException(`New line ${i + 1}: the BOQ item is not part of this project`);
      const description = (b ? `${b.itemNo} ${b.description}` : l.description?.trim())?.slice(0, 300);
      const unit = b?.unit ?? l.unit?.trim();
      if (!description || !unit) throw new BadRequestException(`New line ${i + 1}: give the description and unit`);
      return { workOrderLineId: null, boqItemId: b?.id ?? null, description, unit, qtyBefore: null, rateBefore: null, quantity: parseAmendQty(l.quantity, description), rate: parseAmendRate(l.rate, description), sortOrder: kept.length + i };
    });
    const lines = [...kept, ...fresh].map((l) => ({ ...l, amount: D(amendLineAmount(l.quantity.toString(), l.rate.toString())) }));
    const problem = amendmentLinesProblem(linesNow(wo), proposedOf(lines));
    if (problem) throw new BadRequestException(problem);
    return lines;
  }

  private async loadOwn(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'WO_AMENDMENT', id);
    const a = await this.prisma.workOrderAmendment.findUniqueOrThrow({ where: { id }, select: { workOrderId: true, status: true, submittedById: true } });
    return { row, a };
  }

  /** A decided amendment stays as the record of that decision: a rejected one is not taken up again, a new one is raised. */
  private assertOpen(status: string) {
    if (status === 'APPROVED') throw new BadRequestException('An approved amendment cannot be changed: raise another one');
    if (status === 'REJECTED') throw new BadRequestException('A rejected amendment stays as it was decided: raise a new one');
  }

  async update(user: RequestUser, id: string, dto: UpdateWoAmendmentDto): Promise<WorkOrderAmendmentDto> {
    const { row, a } = await this.loadOwn(user, id);
    await this.assertCanRaise(user, row.projectId);
    this.assertOpen(a.status);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`WOA:${a.workOrderId}`}))`;
      const wo = await this.order(tx, user.organizationId, a.workOrderId);
      const current = await tx.workOrderAmendment.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
      const input: WoAmendmentLineInput[] =
        dto.lines ??
        current.lines.map((l) => ({ workOrderLineId: l.qtyBefore === null ? undefined : (l.workOrderLineId ?? undefined), boqItemId: l.boqItemId ?? undefined, description: l.description, unit: l.unit, quantity: l.quantity.toString(), rate: l.rate.toString() }));
      const lines = await this.proposal(wo, input);
      const endDate = dto.endDate !== undefined ? (dto.endDate ? parseDate(dto.endDate) : null) : current.endDate;
      if (endDate && wo.startDate && endDate < wo.startDate) throw new BadRequestException('The work order cannot end before it starts');
      await tx.workOrderAmendmentLine.deleteMany({ where: { amendmentId: id } });
      await tx.workOrderAmendment.update({
        where: { id },
        data: {
          reason: dto.reason !== undefined ? (dto.reason ?? '') : current.reason,
          endDate,
          endDateBefore: wo.endDate,
          valueBefore: wo.value,
          valueAfter: sum(lines, (l) => l.amount),
          lines: { create: lines },
        },
      });
    });
    await this.audit.log(user, 'WO_AMENDMENT', id, 'UPDATED');
    if (dto.submit) return this.submit(user, id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string): Promise<WorkOrderAmendmentDto> {
    const { row, a } = await this.loadOwn(user, id);
    await this.assertCanRaise(user, row.projectId);
    this.assertOpen(a.status);
    const am = await this.prisma.workOrderAmendment.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (!am.reason.trim()) throw new BadRequestException('Say why the order changes');
    const changes = am.lines.some((l) => l.qtyBefore === null || !l.quantity.eq(l.qtyBefore) || !l.rate.eq(l.rateBefore!));
    const moves = am.endDate !== null && am.endDate.getTime() !== am.endDateBefore?.getTime();
    if (!changes && !moves) throw new BadRequestException('Nothing changes yet: change a quantity or rate, add an item or give a new end date');
    await this.assertStillFits(id);
    await this.lifecycle.submit(user, 'WO_AMENDMENT', id);
    return this.get(user, id);
  }

  /** The order can still take it and every line still holds against what is billed and measured now (also before approval). */
  private async assertStillFits(id: string) {
    const am = await this.prisma.workOrderAmendment.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    const wo = await this.order(this.prisma, am.organizationId, am.workOrderId);
    const problem = (await this.openProblem(this.prisma, wo, id)) ?? amendmentLinesProblem(linesNow(wo), proposedOf(am.lines));
    if (problem) throw new ConflictException(problem);
  }

  async remove(user: RequestUser, id: string) {
    const { row, a } = await this.loadOwn(user, id);
    await this.assertCanRaise(user, row.projectId);
    this.assertOpen(a.status);
    if (!canEditSubmission(user, row)) throw new ForbiddenException('You cannot delete this amendment');
    await this.prisma.$transaction([
      this.prisma.approvalStep.deleteMany({ where: { entityType: 'WO_AMENDMENT', entityId: id } }),
      this.prisma.workOrderAmendment.delete({ where: { id } }),
    ]);
    await this.audit.log(user, 'WO_AMENDMENT', id, 'DELETED');
    return { ok: true };
  }

  /**
   * Write an approved amendment to its order: each line's quantity, rate and amount in place, the new items as new lines,
   * then the order's value, end date and the amendment in force. Runs once: `appliedAt` marks it done.
   */
  async apply(id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const head = await tx.workOrderAmendment.findUniqueOrThrow({ where: { id }, select: { workOrderId: true } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`WOA:${head.workOrderId}`}))`;
      const am = await tx.workOrderAmendment.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
      if (am.status !== 'APPROVED' || am.appliedAt) return false;
      const top = await tx.workOrderLine.aggregate({ where: { workOrderId: am.workOrderId }, _max: { sortOrder: true } });
      let next = (top._max.sortOrder ?? -1) + 1;
      for (const l of am.lines) {
        if (l.qtyBefore !== null && l.workOrderLineId) {
          await tx.workOrderLine.update({ where: { id: l.workOrderLineId }, data: { quantity: l.quantity, rate: l.rate, amount: l.amount } });
        } else if (l.qtyBefore === null) {
          const made = await tx.workOrderLine.create({
            data: { workOrderId: am.workOrderId, boqItemId: l.boqItemId, description: l.description, unit: l.unit, quantity: l.quantity, rate: l.rate, amount: l.amount, sortOrder: next++ },
            select: { id: true },
          });
          await tx.workOrderAmendmentLine.update({ where: { id: l.id }, data: { workOrderLineId: made.id } });
        }
      }
      const value = await tx.workOrderLine.aggregate({ where: { workOrderId: am.workOrderId }, _sum: { amount: true } });
      await tx.workOrder.update({
        where: { id: am.workOrderId },
        data: { value: value._sum.amount ?? ZERO, amendmentNo: am.amendmentNo, ...(am.endDate ? { endDate: am.endDate } : {}) },
      });
      await tx.workOrderAmendment.update({ where: { id }, data: { appliedAt: new Date() } });
      return true;
    });
  }

  /** An approval whose writing to the order did not finish (a crash between the two) is finished first. */
  private async applyPending(workOrderId: string) {
    const left = await this.prisma.workOrderAmendment.findMany({ where: { workOrderId, status: 'APPROVED', appliedAt: null }, orderBy: { amendmentNo: 'asc' }, select: { id: true } });
    for (const a of left) await this.apply(a.id);
  }
}

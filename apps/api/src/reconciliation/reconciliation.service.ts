import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ExcessRecoveryDto,
  MaterialNormDto,
  ProjectReconciliationDto,
  ProjectSubconReconciliationDto,
  ReconciliationItemDto,
  StockAdjustmentReason,
  SubconMaterialDto,
  WastageReportDto,
  WastageRowDto,
} from '@erp/shared';
import { STOCK_ADJUSTMENT_REASONS, canRecoverExcessMaterial, canSetMaterialNorms, canViewCost, canViewReconciliation, subBillLabel } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dec, iso, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { SubcontractBillsService } from '../subcontracts/subcontract-bills.service';
import { type ItemMovement, movementsFrom, reconcile, wastageGroups } from './reconciliation-rules';
import { ReconciliationQuery, RecoverExcessDto, SaveMaterialNormDto } from './reconciliation.dto';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);

/** Norms keep six decimals; trailing zeros dropped. */
const norm6 = (v: D) => v.toFixed(6).replace(/\.?0+$/, '') || '0';
const pctStr = (v: D) => v.toFixed(2).replace(/\.?0+$/, '') || '0';

const NORM_INCLUDE = {
  boqItem: { select: { itemNo: true, description: true, unit: true, sortOrder: true } },
  item: { select: { name: true, unit: true } },
  updatedBy: { select: { fullName: true } },
} satisfies Prisma.MaterialNormInclude;
type NormRow = Prisma.MaterialNormGetPayload<{ include: typeof NORM_INCLUDE }>;

const normDto = (n: NormRow): MaterialNormDto => ({
  id: n.id,
  boqItemId: n.boqItemId,
  boqItemNo: n.boqItem.itemNo,
  boqDescription: n.boqItem.description,
  boqUnit: n.boqItem.unit,
  itemId: n.itemId,
  itemName: n.item.name,
  itemUnit: n.item.unit,
  qtyPerUnit: norm6(n.qtyPerUnit),
  wastagePct: n.wastagePct.toFixed(2).replace(/\.?0+$/, '') || '0',
  note: n.note,
  updatedByName: n.updatedBy.fullName,
  updatedAt: iso(n.updatedAt)!,
});

/**
 * Material reconciliation per project: norms (item per unit of a BOQ item) set by the QS, and theoretical consumption
 * from approved progress checked against net issues to site. Arithmetic in reconciliation-rules.ts.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private subBills: SubcontractBillsService,
  ) {}

  private async assertView(user: RequestUser, projectId: string) {
    if (!canViewReconciliation(user.roleKey)) throw new ForbiddenException('Material reconciliation is for the QS, stores, procurement, accounts and approvers');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async assertEdit(user: RequestUser, projectId: string) {
    if (!canSetMaterialNorms(user.roleKey)) throw new ForbiddenException('Only the QS, the project manager, management or admin can set material norms');
    await this.access.assertCanAccessProject(user, projectId);
  }

  async get(user: RequestUser, projectId: string, q: ReconciliationQuery): Promise<ProjectReconciliationDto> {
    await this.assertView(user, projectId);
    return this.build(projectId, q, canViewCost(user.roleKey), canSetMaterialNorms(user.roleKey));
  }

  /** The report without the caller's checks, for the watch list (which has already scoped the projects). */
  async forWarnings(projectId: string, to: string): Promise<ProjectReconciliationDto> {
    return this.build(projectId, { to }, true, false);
  }

  private async build(projectId: string, q: ReconciliationQuery, seeValues: boolean, canEditNorms: boolean): Promise<ProjectReconciliationDto> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true } });
    if (!project) throw new NotFoundException('Project not found');
    const to = q.to ?? todayIn();
    if (q.from && q.from > to) throw new BadRequestException('The period starts after it ends: choose an earlier From date');
    const date = { ...(q.from ? { gte: parseDate(q.from) } : {}), lte: parseDate(to) };

    const [norms, progress, activities, stock] = await Promise.all([
      this.prisma.materialNorm.findMany({ where: { projectId }, include: NORM_INCLUDE }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId, status: 'APPROVED', date }, _sum: { quantity: true } }),
      this.prisma.activity.findMany({ where: { projectId, boqItemId: { not: null } }, select: { id: true, boqItemId: true } }),
      this.prisma.stockTxn.groupBy({
        by: ['itemId', 'type'],
        where: { projectId, date, type: { in: ['ISSUE', 'RETURN_FROM_SITE'] } },
        _sum: { quantity: true },
      }),
    ]);
    norms.sort((a, b) => a.boqItem.sortOrder - b.boqItem.sortOrder || a.boqItem.itemNo.localeCompare(b.boqItem.itemNo, undefined, { numeric: true }) || a.item.name.localeCompare(b.item.name));

    const boqOfActivity = new Map(activities.map((a) => [a.id, a.boqItemId!]));
    const executed = new Map<string, D>();
    for (const g of progress) {
      const id = boqOfActivity.get(g.activityId);
      if (id) executed.set(id, (executed.get(id) ?? ZERO).plus(g._sum.quantity ?? ZERO));
    }
    const movements = movementsFrom(stock.map((s) => ({ itemId: s.itemId, type: s.type, quantity: s._sum.quantity ?? ZERO })));
    const result = reconcile(norms, executed, movements);

    const itemIds = [...new Set([...result.map((r) => r.itemId), ...movements.keys()])];
    const items = new Map((await this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true, rate: true } })).map((i) => [i.id, i]));
    const normById = new Map(norms.map((n) => [n.id, n]));

    let excessValue = ZERO;
    const rows: ReconciliationItemDto[] = result.map((r) => {
      const item = items.get(r.itemId)!;
      const value = seeValues && item.rate ? r.excess.mul(item.rate) : null;
      if (value) excessValue = excessValue.plus(value);
      return {
        itemId: r.itemId,
        itemName: item.name,
        unit: item.unit,
        rate: seeValues ? money(item.rate) : null,
        theoreticalQty: dec(r.theoretical)!,
        allowedQty: dec(r.allowed)!,
        issuedQty: dec(r.issued)!,
        returnedQty: dec(r.returned)!,
        consumedQty: dec(r.consumed)!,
        varianceQty: dec(r.variance)!,
        variancePct: r.variancePct,
        status: r.status,
        excessQty: dec(r.excess)!,
        excessValue: value ? money(value) : null,
        lines: r.lines.map((l) => {
          const b = normById.get(l.normId)!.boqItem;
          return {
            normId: l.normId,
            boqItemId: l.boqItemId,
            itemNo: b.itemNo,
            description: b.description,
            unit: b.unit,
            executedQty: dec(l.executed)!,
            qtyPerUnit: norm6(l.qtyPerUnit),
            wastagePct: l.wastagePct.toFixed(2).replace(/\.?0+$/, '') || '0',
            theoreticalQty: dec(l.theoretical)!,
          };
        }),
      };
    });
    const order = { OVER: 0, UNDER: 1, WITHIN: 2, NO_WORK: 3 } as const;
    rows.sort((a, b) => order[a.status] - order[b.status] || a.itemName.localeCompare(b.itemName));

    const normed = new Set(norms.map((n) => n.itemId));
    const unreconciled = [...movements]
      .filter(([id, m]) => !normed.has(id) && m.issued.minus(m.returned).gt(0))
      .map(([id, m]) => ({ itemId: id, itemName: items.get(id)?.name ?? '', unit: items.get(id)?.unit ?? '', consumedQty: dec(m.issued.minus(m.returned))! }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
    const boqWithNorm = new Set(norms.map((n) => n.boqItemId));

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      from: q.from ?? null,
      to,
      items: rows,
      unreconciled,
      norms: norms.map(normDto),
      boqItemsWithoutNorm: [...executed].filter(([id, qty]) => qty.gt(0) && !boqWithNorm.has(id)).length,
      overCount: rows.filter((r) => r.status === 'OVER').length,
      underCount: rows.filter((r) => r.status === 'UNDER').length,
      excessValue: seeValues ? money(excessValue) : null,
      canEditNorms,
      canSeeValues: seeValues,
    };
  }

  /** Add a norm, or change the one the BOQ item already has for that store item. */
  async save(user: RequestUser, projectId: string, dto: SaveMaterialNormDto): Promise<MaterialNormDto> {
    await this.assertEdit(user, projectId);
    const [boq, item] = await Promise.all([
      this.prisma.boqItem.findFirst({ where: { id: dto.boqItemId, projectId }, select: { id: true, itemNo: true } }),
      this.prisma.item.findFirst({ where: { id: dto.itemId, organizationId: user.organizationId }, select: { id: true, name: true } }),
    ]);
    if (!boq) throw new BadRequestException('Choose a BOQ item of this project');
    if (!item) throw new BadRequestException('Choose an item from the item master');
    const qtyPerUnit = new Dec(dto.qtyPerUnit).toDecimalPlaces(6);
    if (qtyPerUnit.lte(0)) throw new BadRequestException('Enter a quantity per unit above zero');
    if (qtyPerUnit.gte(new Dec('1e12'))) throw new BadRequestException('Enter a smaller quantity per unit');
    const existing = await this.prisma.materialNorm.findUnique({ where: { boqItemId_itemId: { boqItemId: boq.id, itemId: item.id } }, select: { id: true, wastagePct: true } });
    // Left out: 0 on a new norm, unchanged on an existing one
    const wastagePct = dto.wastagePct === undefined ? (existing?.wastagePct ?? ZERO) : new Dec(dto.wastagePct).toDecimalPlaces(2);
    if (wastagePct.isNegative() || wastagePct.gt(100)) throw new BadRequestException('Enter a wastage between 0 and 100%');
    const note = dto.note === undefined ? undefined : dto.note?.trim() || null;

    const saved = await this.prisma.materialNorm.upsert({
      where: { boqItemId_itemId: { boqItemId: boq.id, itemId: item.id } },
      create: { organizationId: user.organizationId, projectId, boqItemId: boq.id, itemId: item.id, qtyPerUnit, wastagePct, note: note ?? null, updatedById: user.id },
      update: { qtyPerUnit, wastagePct, ...(note !== undefined ? { note } : {}), updatedById: user.id },
      include: NORM_INCLUDE,
    });
    await this.audit.log(user, 'PROJECT', projectId, existing ? 'MATERIAL_NORM_UPDATED' : 'MATERIAL_NORM_ADDED', `${boq.itemNo}: ${item.name} ${norm6(qtyPerUnit)} per unit, ${wastagePct.toFixed(2)}% wastage`);
    return normDto(saved);
  }

  async remove(user: RequestUser, projectId: string, normId: string): Promise<{ ok: true }> {
    await this.assertEdit(user, projectId);
    const n = await this.prisma.materialNorm.findFirst({ where: { id: normId, projectId }, include: NORM_INCLUDE });
    if (!n) throw new NotFoundException('Norm not found');
    await this.prisma.materialNorm.delete({ where: { id: n.id } });
    await this.audit.log(user, 'PROJECT', projectId, 'MATERIAL_NORM_REMOVED', `${n.boqItem.itemNo}: ${n.item.name}`);
    return { ok: true };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Per subcontractor (v5 item 92)

  /**
   * Material issued to each subcontractor's work order against what their approved measured work should have taken
   * (measured quantity × the project's norms, with wastage), since the start, and the excess already raised for recovery.
   */
  async subcontractors(user: RequestUser, projectId: string, workOrderId?: string): Promise<ProjectSubconReconciliationDto> {
    await this.assertView(user, projectId);
    const seeValues = canViewCost(user.roleKey);
    const woWhere = { projectId, status: 'APPROVED' as const, ...(workOrderId ? { id: workOrderId } : {}) };
    const [orders, norms, measured, issues, recoveries] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: woWhere,
        select: {
          id: true,
          woNo: true,
          title: true,
          closedAt: true,
          vendor: { select: { name: true } },
          bills: { where: { status: { not: 'APPROVED' } }, select: { id: true, billNo: true, isFinal: true, status: true }, orderBy: { billNo: 'desc' }, take: 1 },
        },
        orderBy: { woNo: 'asc' },
      }),
      this.prisma.materialNorm.findMany({ where: { projectId }, include: NORM_INCLUDE }),
      this.prisma.measurementSheet.groupBy({ by: ['workOrderId', 'boqItemId'], where: { projectId, status: 'APPROVED', workOrder: woWhere }, _sum: { totalQty: true } }),
      this.prisma.stockTxn.findMany({ where: { projectId, type: 'ISSUE', entry: { workOrder: woWhere } }, select: { itemId: true, quantity: true, entry: { select: { workOrderId: true } } } }),
      this.prisma.excessMaterialRecovery.findMany({
        where: { projectId, workOrder: woWhere },
        include: { item: { select: { name: true, unit: true } }, createdBy: { select: { fullName: true } }, subcontractBill: { select: { billNo: true, isFinal: true, status: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const normById = new Map(norms.map((n) => [n.id, n]));
    const itemIds = [...new Set([...norms.map((n) => n.itemId), ...issues.map((i) => i.itemId)])];
    const items = new Map((await this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true, rate: true } })).map((i) => [i.id, i]));

    const workOrders = orders.map((wo) => {
      const executed = new Map<string, D>();
      for (const m of measured) if (m.workOrderId === wo.id) executed.set(m.boqItemId, m._sum.totalQty ?? ZERO);
      const movements = new Map<string, ItemMovement>();
      for (const t of issues) {
        if (t.entry.workOrderId !== wo.id) continue;
        const cur = movements.get(t.itemId) ?? { issued: ZERO, returned: ZERO };
        movements.set(t.itemId, { issued: cur.issued.plus(t.quantity.neg()), returned: ZERO });
      }
      const mine = recoveries.filter((r) => r.workOrderId === wo.id);
      const result = reconcile(norms, executed, movements).filter((r) => r.theoretical.gt(0) || r.issued.gt(0));
      const label = (b: { billNo: number; isFinal: boolean }) => subBillLabel(wo.woNo, b.billNo, b.isFinal);
      let toRecoverValue = ZERO;
      const rows: SubconMaterialDto[] = result.map((r) => {
        const item = items.get(r.itemId)!;
        const recovered = mine.filter((x) => x.itemId === r.itemId).reduce((sum, x) => sum.plus(x.quantity), ZERO);
        const toRecover = Prisma.Decimal.max(r.excess.minus(recovered), ZERO);
        if (seeValues && item.rate) toRecoverValue = toRecoverValue.plus(toRecover.mul(item.rate));
        return {
          itemId: r.itemId,
          itemName: item.name,
          unit: item.unit,
          rate: seeValues ? money(item.rate) : null,
          theoreticalQty: dec(r.theoretical)!,
          allowedQty: dec(r.allowed)!,
          issuedQty: dec(r.issued)!,
          varianceQty: dec(r.variance)!,
          variancePct: r.variancePct,
          status: r.status,
          excessQty: dec(r.excess)!,
          excessValue: seeValues && item.rate ? money(r.excess.mul(item.rate)) : null,
          recoveredQty: dec(recovered)!,
          toRecoverQty: dec(toRecover)!,
          lines: r.lines
            .filter((l) => l.executed.gt(0))
            .map((l) => {
              const b = normById.get(l.normId)!.boqItem;
              return { boqItemNo: b.itemNo, description: b.description, unit: b.unit, measuredQty: dec(l.executed)!, qtyPerUnit: norm6(l.qtyPerUnit), wastagePct: pctStr(l.wastagePct), theoreticalQty: dec(l.theoretical)! };
            }),
        };
      });
      const order = { OVER: 0, UNDER: 1, WITHIN: 2, NO_WORK: 3 } as const;
      rows.sort((a, b) => order[a.status] - order[b.status] || a.itemName.localeCompare(b.itemName));
      const open = wo.bills[0];
      return {
        workOrderId: wo.id,
        woNo: wo.woNo,
        title: wo.title,
        vendorName: wo.vendor.name,
        closed: !!wo.closedAt,
        openBill: open ? { id: open.id, label: label(open), status: open.status } : null,
        items: rows,
        overCount: rows.filter((r) => r.status === 'OVER').length,
        toRecoverValue: seeValues ? money(toRecoverValue) : null,
        recoveries: mine.map(
          (x): ExcessRecoveryDto => ({
            id: x.id,
            workOrderId: x.workOrderId,
            itemId: x.itemId,
            itemName: x.item.name,
            unit: x.item.unit,
            quantity: dec(x.quantity)!,
            rate: money(x.rate)!,
            amount: money(x.amount)!,
            note: x.note,
            billId: x.subcontractBillId,
            billLabel: x.subcontractBill ? label(x.subcontractBill) : null,
            billStatus: x.subcontractBill?.status ?? null,
            createdByName: x.createdBy.fullName,
            createdAt: iso(x.createdAt)!,
            canCancel: !x.subcontractBill || (x.subcontractBill.status !== 'APPROVED' && x.subcontractBill.status !== 'SUBMITTED'),
          }),
        ),
      };
    });
    return {
      projectId,
      // Work orders with nothing to reconcile and nothing raised are left out.
      workOrders: workOrders.filter((w) => w.items.length || w.recoveries.length),
      canRecover: canRecoverExcessMaterial(user.roleKey),
      canSeeValues: seeValues,
    };
  }

  /** Raise material used beyond the allowance for recovery on the subcontractor's next bill (or the one being prepared). */
  async recover(user: RequestUser, projectId: string, workOrderId: string, dto: RecoverExcessDto): Promise<{ recovery: ExcessRecoveryDto; billLabel: string | null }> {
    if (!canRecoverExcessMaterial(user.roleKey)) throw new ForbiddenException('Recoveries are raised by those who prepare subcontractor bills and see cost');
    await this.access.assertCanAccessProject(user, projectId);
    const wo = await this.prisma.workOrder.findFirst({ where: { id: workOrderId, projectId }, select: { id: true, woNo: true, status: true, closedAt: true } });
    if (!wo) throw new NotFoundException('Work order not found');
    if (wo.status !== 'APPROVED') throw new ConflictException(`${wo.woNo} is not approved`);
    if (wo.closedAt) throw new ConflictException(`${wo.woNo} is closed; there is no next bill to take it off`);
    const view = (await this.subcontractors(user, projectId, wo.id)).workOrders[0];
    const row = view?.items.find((i) => i.itemId === dto.itemId);
    if (!row) throw new BadRequestException('That material has no reconciliation on this work order');
    const quantity = new Dec(dto.quantity).toDecimalPlaces(3);
    const rate = new Dec(dto.rate).toDecimalPlaces(2);
    const most = new Dec(row.toRecoverQty);
    if (quantity.lte(0)) throw new BadRequestException('Enter a quantity above zero');
    if (quantity.gt(most)) throw new BadRequestException(most.isZero() ? `Nothing of ${row.itemName} is left to recover` : `At most ${dec(most)} ${row.unit} of ${row.itemName} is over the allowance and not yet raised`);
    if (rate.lte(0)) throw new BadRequestException('Enter a rate above zero');
    const amount = quantity.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const created = await this.prisma.excessMaterialRecovery.create({
      data: { organizationId: user.organizationId, projectId, workOrderId: wo.id, itemId: dto.itemId, quantity, rate, amount, note: dto.note?.trim() || null, createdById: user.id },
      select: { id: true },
    });
    await this.audit.log(user, 'WORK_ORDER', wo.id, 'EXCESS_MATERIAL_RECOVERY_RAISED', `${dec(quantity)} ${row.unit} of ${row.itemName} at ${money(rate)}: ${money(amount)}`);
    await this.subBills.retakeOpenBill(wo.id);
    const after = (await this.subcontractors(user, projectId, wo.id)).workOrders[0];
    const recovery = after.recoveries.find((r) => r.id === created.id)!;
    return { recovery, billLabel: recovery.billLabel };
  }

  /** Withdraw a recovery while the bill that takes it is not waiting for approval or approved. */
  async cancelRecovery(user: RequestUser, projectId: string, id: string): Promise<{ ok: true }> {
    if (!canRecoverExcessMaterial(user.roleKey)) throw new ForbiddenException('Recoveries are withdrawn by those who prepare subcontractor bills and see cost');
    await this.access.assertCanAccessProject(user, projectId);
    const r = await this.prisma.excessMaterialRecovery.findFirst({
      where: { id, projectId },
      include: { item: { select: { name: true } }, workOrder: { select: { woNo: true } }, subcontractBill: { select: { billNo: true, isFinal: true, status: true } } },
    });
    if (!r) throw new NotFoundException('That recovery was not found');
    const bill = r.subcontractBill;
    if (bill && (bill.status === 'APPROVED' || bill.status === 'SUBMITTED'))
      throw new ConflictException(`${subBillLabel(r.workOrder.woNo, bill.billNo, bill.isFinal)} ${bill.status === 'APPROVED' ? 'is approved with it' : 'is waiting for approval; send it back first'}`);
    await this.prisma.excessMaterialRecovery.delete({ where: { id: r.id } });
    await this.audit.log(user, 'WORK_ORDER', r.workOrderId, 'EXCESS_MATERIAL_RECOVERY_WITHDRAWN', `${r.item.name}: ${money(r.amount)}`);
    if (r.subcontractBillId) await this.subBills.retakeOpenBill(r.workOrderId);
    return { ok: true };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Wastage (v5 item 92)

  /** Stock adjustments in the period by reason and item, opening stock left out, valued at item rates. */
  async wastage(user: RequestUser, projectId: string, q: ReconciliationQuery): Promise<WastageReportDto> {
    await this.assertView(user, projectId);
    const to = q.to ?? todayIn();
    if (q.from && q.from > to) throw new BadRequestException('The period starts after it ends: choose an earlier From date');
    const date = { ...(q.from ? { gte: parseDate(q.from) } : {}), lte: parseDate(to) };
    const lines = await this.prisma.stockTxn.findMany({ where: { projectId, type: 'ADJUSTMENT', date }, select: { itemId: true, quantity: true, entryId: true, entry: { select: { adjustmentReason: true } } } });
    const groups = wastageGroups(lines.map((l) => ({ reason: l.entry.adjustmentReason, itemId: l.itemId, entryId: l.entryId, quantity: l.quantity })));
    const seeValues = canViewCost(user.roleKey);
    const items = new Map((await this.prisma.item.findMany({ where: { id: { in: [...new Set(groups.map((g) => g.itemId))] } }, select: { id: true, name: true, unit: true, rate: true } })).map((i) => [i.id, i]));
    const order = (r: string | null) => (r === null ? STOCK_ADJUSTMENT_REASONS.length : STOCK_ADJUSTMENT_REASONS.indexOf(r as StockAdjustmentReason));
    const rows: WastageRowDto[] = groups
      .map((g) => {
        const item = items.get(g.itemId)!;
        return {
          reason: g.reason as StockAdjustmentReason | null,
          itemId: g.itemId,
          itemName: item.name,
          unit: item.unit,
          lostQty: dec(g.lost)!,
          gainedQty: dec(g.gained)!,
          rate: seeValues ? money(item.rate) : null,
          lostValue: seeValues && item.rate ? money(g.lost.mul(item.rate)) : null,
          entries: g.entries,
        };
      })
      .sort((a, b) => order(a.reason) - order(b.reason) || a.itemName.localeCompare(b.itemName));
    const reasons = [...new Set(rows.map((r) => r.reason))];
    const value = (rs: WastageRowDto[]) => (seeValues ? money(rs.reduce((s, r) => s.plus(r.lostValue ?? 0), ZERO)) : null);
    const entryIds = (reason: string | null) => new Set(lines.filter((l) => l.entry.adjustmentReason === reason && reason !== 'OPENING').map((l) => l.entryId)).size;
    return {
      projectId,
      from: q.from ?? null,
      to,
      rows,
      byReason: reasons.map((reason) => ({ reason, lostValue: value(rows.filter((r) => r.reason === reason)), entries: entryIds(reason) })),
      lostValue: value(rows),
      canSeeValues: seeValues,
    };
  }
}

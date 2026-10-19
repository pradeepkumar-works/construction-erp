import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MaterialNormDto, ProjectReconciliationDto, ReconciliationItemDto } from '@erp/shared';
import { canSetMaterialNorms, canViewCost, canViewReconciliation } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dec, iso, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { movementsFrom, reconcile } from './reconciliation-rules';
import { ReconciliationQuery, SaveMaterialNormDto } from './reconciliation.dto';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ZERO = new Dec(0);

/** Norms keep six decimals; trailing zeros dropped. */
const norm6 = (v: D) => v.toFixed(6).replace(/\.?0+$/, '') || '0';

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

    const seeValues = canViewCost(user.roleKey);
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
      canEditNorms: canSetMaterialNorms(user.roleKey),
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
}

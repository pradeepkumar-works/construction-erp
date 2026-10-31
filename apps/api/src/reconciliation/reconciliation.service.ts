import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ActivityNormDto,
  ExcessRecoveryDto,
  MaterialNormDto,
  ProjectReconciliationDto,
  ProjectSubconReconciliationDto,
  ReconciliationItemDto,
  StockAdjustmentReason,
  StandardNormMatchDto,
  StandardNormPlanDto,
  StandardNormResultDto,
  SubconMaterialDto,
  WastageReportDto,
  WastageRowDto,
} from '@erp/shared';
import { STOCK_ADJUSTMENT_REASONS, USE_ISSUE_DAYS, canRecoverExcessMaterial, canSetMaterialNorms, canViewCost, canViewReconciliation, masterItemFor, subBillLabel, suggestStandardNorms } from '@erp/shared';
import { masterCandidates } from '../stock/item-master';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { SubcontractBillsService } from '../subcontracts/subcontract-bills.service';
import { type ItemMovement, type NormInput, bookOf, executedBySource, frontFlag, movementsFrom, reconcile, reconciliationStatus, wastageGroups } from './reconciliation-rules';
import { ReconciliationQuery, RecoverExcessDto, SaveActivityNormDto, SaveMaterialNormDto } from './reconciliation.dto';

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

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const ACTIVITY_NORM_INCLUDE = {
  activity: { select: { name: true, unit: true, sortOrder: true, workElement: { select: { code: true, name: true, level: true, parent: { select: { name: true } } } } } },
  item: { select: { name: true, unit: true } },
  updatedBy: { select: { fullName: true } },
} satisfies Prisma.ActivityMaterialNormInclude;
type ActivityNormRow = Prisma.ActivityMaterialNormGetPayload<{ include: typeof ACTIVITY_NORM_INCLUDE }>;

export const elementLabel = (e: { name: string; level: string; parent: { name: string } | null } | null) => (e ? (e.level === 'SUB_COMPONENT' && e.parent ? `${e.parent.name} › ${e.name}` : e.name) : null);

const compareActivityNorms = (a: ActivityNormRow, b: ActivityNormRow) =>
  (a.activity.workElement?.code ?? '~').localeCompare(b.activity.workElement?.code ?? '~', undefined, { numeric: true }) ||
  a.activity.sortOrder - b.activity.sortOrder ||
  a.activity.name.localeCompare(b.activity.name) ||
  a.item.name.localeCompare(b.item.name);

const activityNormDto = (n: ActivityNormRow): ActivityNormDto => ({
  id: n.id,
  activityId: n.activityId,
  activityName: n.activity.name,
  activityUnit: n.activity.unit,
  elementLabel: n.activity.workElement ? `${n.activity.workElement.code} ${elementLabel(n.activity.workElement)}` : null,
  itemId: n.itemId,
  itemName: n.item.name,
  itemUnit: n.item.unit,
  qtyPerUnit: norm6(n.qtyPerUnit),
  wastagePct: pctStr(n.wastagePct),
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

  async assertView(user: RequestUser, projectId: string) {
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

  /**
   * A period's report without the caller's checks (leakage checks): the interface other modules read the
   * reconciliation's figures through, so they follow it as it changes.
   */
  async forPeriod(projectId: string, from: string, to: string): Promise<ProjectReconciliationDto> {
    return this.build(projectId, { from, to }, true, false);
  }

  private async build(projectId: string, q: ReconciliationQuery, seeValues: boolean, canEditNorms: boolean): Promise<ProjectReconciliationDto> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true } });
    if (!project) throw new NotFoundException('Project not found');
    const to = q.to ?? todayIn();
    if (q.from && q.from > to) throw new BadRequestException('The period starts after it ends: choose an earlier From date');
    const date = { ...(q.from ? { gte: parseDate(q.from) } : {}), lte: parseDate(to) };
    const approved = { projectId, status: 'APPROVED' as const, date };
    // A DPR's work lines, or any line that says what it used: what the use is checked against
    const reported = { ...approved, OR: [{ dailyReportId: { not: null } }, { materials: { some: {} } }] };

    const [norms, activityNorms, progress, onLines, activities, stock, before, used, firstUse] = await Promise.all([
      this.prisma.materialNorm.findMany({ where: { projectId }, include: NORM_INCLUDE }),
      this.prisma.activityMaterialNorm.findMany({ where: { projectId }, include: ACTIVITY_NORM_INCLUDE }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: approved, _sum: { quantity: true } }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: reported, _sum: { quantity: true } }),
      this.prisma.activity.findMany({ where: { projectId }, select: { id: true, boqItemId: true } }),
      this.prisma.stockTxn.groupBy({ by: ['itemId', 'type'], where: { projectId, date }, _sum: { quantity: true } }),
      q.from ? this.prisma.stockTxn.groupBy({ by: ['itemId'], where: { projectId, date: { lt: parseDate(q.from) } }, _sum: { quantity: true } }) : Promise.resolve([]),
      this.prisma.progressMaterial.groupBy({ by: ['itemId'], where: { progressEntry: approved }, _sum: { quantity: true } }),
      this.prisma.progressEntry.findFirst({ where: { projectId, status: 'APPROVED', date: { lte: parseDate(to) }, materials: { some: {} } }, orderBy: { date: 'asc' }, select: { date: true } }),
    ]);
    norms.sort((a, b) => a.boqItem.sortOrder - b.boqItem.sortOrder || a.boqItem.itemNo.localeCompare(b.boqItem.itemNo, undefined, { numeric: true }) || a.item.name.localeCompare(b.item.name));
    activityNorms.sort(compareActivityNorms);

    const boqOf = new Map(activities.map((a) => [a.id, a.boqItemId]));
    const ownNormed = new Set(activityNorms.map((n) => n.activityId));
    const sum = (rows: { activityId: string; _sum: { quantity: D | null } }[]) => rows.map((g) => ({ activityId: g.activityId, quantity: g._sum.quantity ?? ZERO }));
    const executed = executedBySource(sum(progress), boqOf, ownNormed);
    const normInputs: NormInput[] = [...norms, ...activityNorms.map((n) => ({ ...n, boqItemId: null }))];
    const movements = movementsFrom(stock.map((s) => ({ itemId: s.itemId, type: s.type, quantity: s._sum.quantity ?? ZERO })));
    const result = reconcile(normInputs, executed, movements);
    const needed = new Map(reconcile(normInputs, executedBySource(sum(onLines), boqOf, ownNormed), movements).map((r) => [r.itemId, r]));
    const book = bookOf(
      before.map((b) => ({ itemId: b.itemId, quantity: b._sum.quantity ?? ZERO })),
      stock.map((s) => ({ itemId: s.itemId, type: s.type, quantity: s._sum.quantity ?? ZERO })),
    );
    const usedOf = new Map(used.map((u) => [u.itemId, u._sum.quantity ?? ZERO]));
    const reportsUse = !!firstUse;
    // The work front is a position at the period's end: since the first DPR that reported material, all it says was
    // used against what was issued from a week before it (material for that first day's work came then). Issues before
    // were never checked against use.
    const frontFrom = firstUse ? dateOnly(firstUse.date)! : null;
    const [front, usedSince] = frontFrom
      ? await Promise.all([
          this.prisma.stockTxn
            .groupBy({ by: ['itemId', 'type'], where: { projectId, date: { gte: parseDate(addDays(frontFrom, -USE_ISSUE_DAYS)), lte: parseDate(to) }, type: { in: ['ISSUE', 'RETURN_FROM_SITE'] } }, _sum: { quantity: true } })
            .then((rows) => movementsFrom(rows.map((s) => ({ itemId: s.itemId, type: s.type, quantity: s._sum.quantity ?? ZERO })))),
          this.prisma.progressMaterial
            .groupBy({ by: ['itemId'], where: { progressEntry: { projectId, status: 'APPROVED', date: { lte: parseDate(to) } } }, _sum: { quantity: true } })
            .then((rows) => new Map(rows.map((u) => [u.itemId, u._sum.quantity ?? ZERO]))),
        ])
      : [new Map<string, ItemMovement>(), new Map<string, D>()];
    const atFront = (itemId: string) => {
      if (!frontFrom) return { atFrontQty: null, front: null };
      const m = front.get(itemId) ?? { issued: ZERO, returned: ZERO };
      const net = m.issued.minus(m.returned);
      const use = usedSince.get(itemId) ?? ZERO;
      return { atFrontQty: dec(net.minus(use))!, front: frontFlag(net, use, reportsUse) };
    };

    const itemIds = [...new Set([...result.map((r) => r.itemId), ...movements.keys(), ...usedOf.keys()])];
    const items = new Map((await this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true, rate: true } })).map((i) => [i.id, i]));
    const normById = new Map<string, { itemNo: string; description: string; unit: string }>([
      ...norms.map((n) => [n.id, { itemNo: n.boqItem.itemNo, description: n.boqItem.description, unit: n.boqItem.unit }] as const),
      ...activityNorms.map((n) => [n.id, { itemNo: n.activity.workElement?.code ?? '', description: n.activity.name, unit: n.activity.unit }] as const),
    ]);

    let excessValue = ZERO;
    const rows: ReconciliationItemDto[] = result.map((r) => {
      const item = items.get(r.itemId)!;
      const value = seeValues && item.rate ? r.excess.mul(item.rate) : null;
      if (value) excessValue = excessValue.plus(value);
      const need = needed.get(r.itemId)!;
      const use = usedOf.get(r.itemId) ?? ZERO;
      const b = book.get(r.itemId) ?? { opening: ZERO, received: ZERO, closing: ZERO };
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
          const n = normById.get(l.normId)!;
          return {
            normId: l.normId,
            boqItemId: l.boqItemId,
            activityId: l.activityId,
            itemNo: n.itemNo,
            description: n.description,
            unit: n.unit,
            executedQty: dec(l.executed)!,
            qtyPerUnit: norm6(l.qtyPerUnit),
            wastagePct: pctStr(l.wastagePct),
            theoreticalQty: dec(l.theoretical)!,
          };
        }),
        openingQty: dec(b.opening)!,
        receivedQty: dec(b.received)!,
        closingQty: dec(b.closing)!,
        usedQty: dec(use)!,
        neededQty: dec(need.theoretical)!,
        neededAllowedQty: dec(need.allowed)!,
        usedVarianceQty: dec(use.minus(need.theoretical))!,
        usedVariancePct: need.theoretical.gt(0) ? Math.round(use.minus(need.theoretical).div(need.theoretical).mul(1000).toNumber()) / 10 : null,
        usedStatus: reportsUse ? reconciliationStatus(need.theoretical, need.allowed, use) : null,
        ...atFront(r.itemId),
      };
    });
    const order = { OVER: 0, UNDER: 1, WITHIN: 2, NO_WORK: 3 } as const;
    rows.sort((a, b) => order[a.status] - order[b.status] || a.itemName.localeCompare(b.itemName));

    const normed = new Set(normInputs.map((n) => n.itemId));
    const unreconciled = itemIds
      .filter((id) => !normed.has(id))
      .map((id) => {
        const m = movements.get(id) ?? { issued: ZERO, returned: ZERO };
        return { itemId: id, itemName: items.get(id)?.name ?? '', unit: items.get(id)?.unit ?? '', consumedQty: dec(m.issued.minus(m.returned))!, usedQty: dec(usedOf.get(id) ?? ZERO)!, ...atFront(id) };
      })
      .filter((r) => Number(r.consumedQty) > 0 || Number(r.usedQty) > 0)
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
    const boqWithNorm = new Set(norms.map((n) => n.boqItemId));
    const fronts = [...rows, ...unreconciled];

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      from: q.from ?? null,
      to,
      items: rows,
      unreconciled,
      norms: norms.map(normDto),
      activityNorms: activityNorms.map(activityNormDto),
      boqItemsWithoutNorm: [...executed].filter(([id, qty]) => !id.startsWith('a:') && qty.gt(0) && !boqWithNorm.has(id)).length,
      frontFrom,
      notReportedCount: fronts.filter((r) => r.front === 'NOT_REPORTED').length,
      usedNotIssuedCount: fronts.filter((r) => r.front === 'USED_NOT_ISSUED').length,
      overCount: rows.filter((r) => r.status === 'OVER').length,
      underCount: rows.filter((r) => r.status === 'UNDER').length,
      excessValue: seeValues ? money(excessValue) : null,
      canEditNorms,
      canSeeValues: seeValues,
    };
  }

  /** Add a norm, or change the one the BOQ item already has for that store item. */
  /**
   * What adopting the standard norms library would do to a project: the BOQ items
   * the library recognises, the norms they would get, and the store items it would have to add. Nothing is written.
   */
  async standardNormPlan(user: RequestUser, projectId: string): Promise<StandardNormPlanDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const boq = await this.prisma.boqItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }],
      select: { id: true, itemNo: true, description: true, unit: true, _count: { select: { materialNorms: true } } },
    });
    const suggestions = suggestStandardNorms(boq.map((b) => ({ id: b.id, description: b.description, unit: b.unit })));
    const names = [...new Set(suggestions.flatMap((s) => s.norm.materials.map((m) => m.item)))];
    const master = await masterCandidates(this.prisma, user.organizationId, names);
    const newItems: { name: string; unit: string }[] = [];
    const matches: StandardNormMatchDto[] = suggestions.map(({ item, norm }) => {
      const row = boq.find((b) => b.id === item.id)!;
      return {
        boqItemId: row.id,
        itemNo: row.itemNo,
        description: row.description,
        unit: row.unit,
        normKey: norm.key,
        normLabel: norm.label,
        note: norm.note,
        hasNorms: row._count.materialNorms > 0,
        materials: norm.materials.map((m) => {
          const found = masterItemFor(m.item, m.unit, master);
          if (!found && !newItems.some((n) => n.name === m.item)) newItems.push({ name: m.item, unit: m.unit });
          return {
            item: m.item,
            unit: m.unit,
            qtyPerUnit: norm6(new Dec(m.qtyPerUnit)),
            wastagePct: pctStr(new Dec(m.wastagePct)),
            itemId: found?.id ?? null,
            itemName: found?.name ?? null,
          };
        }),
      };
    });
    return { projectId, matches, unmatchedCount: boq.length - matches.length, newItems, canAdopt: canSetMaterialNorms(user.roleKey) };
  }

  /**
   * Adopt the library on a project: the store items it needs are added to the master, and each recognised BOQ item
   * gets its norms. An item that already has norms of its own is left alone unless `replace` says otherwise, so a
   * second run never quietly undoes the quantity surveyor's figures.
   */
  async adoptStandardNorms(user: RequestUser, projectId: string, replace: boolean): Promise<StandardNormResultDto> {
    await this.assertEdit(user, projectId);
    const plan = await this.standardNormPlan(user, projectId);
    const take = plan.matches.filter((m) => replace || !m.hasNorms);
    const skipped = plan.matches.length - take.length;
    if (!take.length) return { boqItems: 0, norms: 0, newItems: 0, skipped };

    // The items the norms point at: the master's own where it has them, added where it does not.
    const needed = [...new Map(take.flatMap((m) => m.materials).map((m) => [`${m.item}|${m.unit}`, m])).values()];
    const idOf = new Map<string, string>();
    let added = 0;
    for (const m of needed) {
      if (m.itemId) {
        idOf.set(`${m.item}|${m.unit}`, m.itemId);
        continue;
      }
      const where = { organizationId_name_unit: { organizationId: user.organizationId, name: m.item, unit: m.unit } };
      const had = await this.prisma.item.findUnique({ where, select: { id: true } });
      const row =
        had ??
        (await this.prisma.item.upsert({ where, create: { organizationId: user.organizationId, name: m.item, unit: m.unit, category: 'Standard norms' }, update: {}, select: { id: true } }));
      idOf.set(`${m.item}|${m.unit}`, row.id);
      if (!had) added++;
    }

    let norms = 0;
    for (const m of take)
      for (const mat of m.materials) {
        const itemId = idOf.get(`${mat.item}|${mat.unit}`)!;
        const qtyPerUnit = new Dec(mat.qtyPerUnit);
        const wastagePct = new Dec(mat.wastagePct);
        await this.prisma.materialNorm.upsert({
          where: { boqItemId_itemId: { boqItemId: m.boqItemId, itemId } },
          create: { organizationId: user.organizationId, projectId, boqItemId: m.boqItemId, itemId, qtyPerUnit, wastagePct, note: m.note, updatedById: user.id },
          update: { qtyPerUnit, wastagePct, note: m.note, updatedById: user.id },
        });
        norms++;
      }
    await this.audit.log(user, 'PROJECT', projectId, 'MATERIAL_NORMS_ADOPTED', `${norms} norms on ${take.length} BOQ items from the standard library${added ? `, ${added} items added to the master` : ''}`);
    return { boqItems: take.length, norms, newItems: added, skipped };
  }

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

  /**
   * Add a norm on an activity, or change the one it has for that store item: for work with no BOQ item of its
   * own, such as a lump-sum component's activities or a house connection's kit. It counts before the BOQ item's norms.
   */
  async saveActivityNorm(user: RequestUser, projectId: string, dto: SaveActivityNormDto): Promise<ActivityNormDto> {
    await this.assertEdit(user, projectId);
    const [activity, item] = await Promise.all([
      this.prisma.activity.findFirst({ where: { id: dto.activityId, projectId }, select: { id: true, name: true, _count: { select: { subActivities: true } } } }),
      this.prisma.item.findFirst({ where: { id: dto.itemId, organizationId: user.organizationId }, select: { id: true, name: true } }),
    ]);
    if (!activity) throw new BadRequestException('Choose an activity of this project');
    if (activity._count.subActivities) throw new BadRequestException(`${activity.name} has sub-activities: set the norm on the sub-activity that takes the work`);
    if (!item) throw new BadRequestException('Choose an item from the item master');
    const qtyPerUnit = new Dec(dto.qtyPerUnit).toDecimalPlaces(6);
    if (qtyPerUnit.lte(0)) throw new BadRequestException('Enter a quantity per unit above zero');
    if (qtyPerUnit.gte(new Dec('1e12'))) throw new BadRequestException('Enter a smaller quantity per unit');
    const existing = await this.prisma.activityMaterialNorm.findUnique({ where: { activityId_itemId: { activityId: activity.id, itemId: item.id } }, select: { id: true, wastagePct: true } });
    const wastagePct = dto.wastagePct === undefined ? (existing?.wastagePct ?? ZERO) : new Dec(dto.wastagePct).toDecimalPlaces(2);
    if (wastagePct.isNegative() || wastagePct.gt(100)) throw new BadRequestException('Enter a wastage between 0 and 100%');
    const note = dto.note === undefined ? undefined : dto.note?.trim() || null;
    const saved = await this.prisma.activityMaterialNorm.upsert({
      where: { activityId_itemId: { activityId: activity.id, itemId: item.id } },
      create: { organizationId: user.organizationId, projectId, activityId: activity.id, itemId: item.id, qtyPerUnit, wastagePct, note: note ?? null, updatedById: user.id },
      update: { qtyPerUnit, wastagePct, ...(note !== undefined ? { note } : {}), updatedById: user.id },
      include: ACTIVITY_NORM_INCLUDE,
    });
    await this.audit.log(user, 'PROJECT', projectId, existing ? 'MATERIAL_NORM_UPDATED' : 'MATERIAL_NORM_ADDED', `${activity.name}: ${item.name} ${norm6(qtyPerUnit)} per unit, ${wastagePct.toFixed(2)}% wastage`);
    return activityNormDto(saved);
  }

  async removeActivityNorm(user: RequestUser, projectId: string, normId: string): Promise<{ ok: true }> {
    await this.assertEdit(user, projectId);
    const n = await this.prisma.activityMaterialNorm.findFirst({ where: { id: normId, projectId }, include: ACTIVITY_NORM_INCLUDE });
    if (!n) throw new NotFoundException('Norm not found');
    await this.prisma.activityMaterialNorm.delete({ where: { id: n.id } });
    await this.audit.log(user, 'PROJECT', projectId, 'MATERIAL_NORM_REMOVED', `${n.activity.name}: ${n.item.name}`);
    return { ok: true };
  }

  async remove(user: RequestUser, projectId: string, normId: string): Promise<{ ok: true }> {
    await this.assertEdit(user, projectId);
    const n = await this.prisma.materialNorm.findFirst({ where: { id: normId, projectId }, include: NORM_INCLUDE });
    if (!n) throw new NotFoundException('Norm not found');
    await this.prisma.materialNorm.delete({ where: { id: n.id } });
    await this.audit.log(user, 'PROJECT', projectId, 'MATERIAL_NORM_REMOVED', `${n.boqItem.itemNo}: ${n.item.name}`);
    return { ok: true };
  }

  // Per subcontractor

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

  // Wastage

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

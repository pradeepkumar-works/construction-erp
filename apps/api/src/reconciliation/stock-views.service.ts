import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  KitReconDto,
  PipeMaterial,
  PipeReconRowDto,
  PipeZoneReconDto,
  ProjectKitReconDto,
  ProjectPipeReconDto,
  ProjectReconExceptionsDto,
  ProjectStructureReconDto,
  ReconExceptionDto,
  StructureElementDto,
} from '@erp/shared';
import { PIPE_CUT_WASTAGE_PCT, USE_ISSUE_DAYS, pipeMetres, pipeSizeLabel, pipeSizeOf } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { dateOnly, dec, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { PipeNetworkService } from '../pipe-network/pipe-network.service';
import { ReconciliationService, elementLabel } from './reconciliation.service';
import { type ActivityNormInput, type PipeFigures, exceptionEvents, kitRows, pipeRow, structureRows } from './reconciliation-rules';
import { ReconciliationQuery } from './reconciliation.dto';

type D = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const norm6 = (v: D) => v.toFixed(6).replace(/\.?0+$/, '') || '0';
const pctStr = (v: D) => v.toFixed(2).replace(/\.?0+$/, '') || '0';
const m3 = (v: number) => Math.round(v * 1000) / 1000;
const round1 = (v: number) => Math.round(v * 10) / 10;
const ISSUE_TYPES: ('ISSUE' | 'RETURN_FROM_SITE')[] = ['ISSUE', 'RETURN_FROM_SITE'];
/** Days the exceptions look back when no period is given. */
const EXCEPTION_DAYS = 30;

const ELEMENT_SELECT = { id: true, code: true, name: true, level: true, elementType: true, parent: { select: { name: true } } } satisfies Prisma.WorkElementSelect;
type ElementRow = Prisma.WorkElementGetPayload<{ select: typeof ELEMENT_SELECT }>;
const labelOf = (e: ElementRow) => elementLabel(e)!;

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Stock against the DPR: the reconciliation per structure, per pipe size, per house-connection kit, and the
 * day-to-day exceptions. Loads the records and hands the arithmetic to reconciliation-rules.ts. Who may see them is
 * the reconciliation's own check.
 */
@Injectable()
export class StockViewsService {
  constructor(
    private prisma: PrismaService,
    private reconciliation: ReconciliationService,
    private pipes: PipeNetworkService,
  ) {}

  private async project(projectId: string) {
    const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  private period(q: ReconciliationQuery) {
    const to = q.to ?? todayIn();
    if (q.from && q.from > to) throw new BadRequestException('The period starts after it ends: choose an earlier From date');
    return { from: q.from ?? null, to, date: { ...(q.from ? { gte: parseDate(q.from) } : {}), lte: parseDate(to) } };
  }

  /** Each activity's norms as they apply: its own, else its BOQ item's. */
  private async effectiveNorms(projectId: string, activityIds?: string[]): Promise<ActivityNormInput[]> {
    const activities = await this.prisma.activity.findMany({
      where: { projectId, ...(activityIds ? { id: { in: activityIds } } : {}) },
      select: {
        id: true,
        materialNorms: { select: { itemId: true, qtyPerUnit: true, wastagePct: true } },
        boqItem: { select: { materialNorms: { select: { itemId: true, qtyPerUnit: true, wastagePct: true } } } },
      },
    });
    return activities.flatMap((a) => (a.materialNorms.length ? a.materialNorms : (a.boqItem?.materialNorms ?? [])).map((n) => ({ activityId: a.id, ...n })));
  }

  // R2: structure

  async structure(user: RequestUser, projectId: string, q: ReconciliationQuery): Promise<ProjectStructureReconDto> {
    await this.reconciliation.assertView(user, projectId);
    const project = await this.project(projectId);
    const { from, to, date } = this.period(q);
    const approvedLines = { projectId, status: 'APPROVED' as const, date, OR: [{ dailyReportId: { not: null } }, { materials: { some: {} } }] };
    const firstUse = await this.prisma.progressEntry.findFirst({ where: { projectId, status: 'APPROVED', date: { lte: parseDate(to) }, materials: { some: {} } }, orderBy: { date: 'asc' }, select: { date: true } });
    const frontFrom = firstUse ? addDays(dateOnly(firstUse.date)!, -USE_ISSUE_DAYS) : null;
    const [elements, activities, norms, placed, used, issues, untied, frontIssues, frontUsed] = await Promise.all([
      this.prisma.workElement.findMany({ where: { projectId }, select: ELEMENT_SELECT }),
      this.prisma.activity.findMany({ where: { projectId }, select: { id: true, name: true, unit: true, plannedQty: true, workElementId: true } }),
      this.effectiveNorms(projectId),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: approvedLines, _sum: { quantity: true } }),
      this.prisma.progressMaterial.findMany({ where: { progressEntry: { projectId, status: 'APPROVED', date } }, select: { itemId: true, quantity: true, progressEntry: { select: { activityId: true } } } }),
      this.prisma.stockTxn.findMany({ where: { projectId, date, type: { in: ISSUE_TYPES }, entry: { workElementId: { not: null } } }, select: { itemId: true, quantity: true, entry: { select: { workElementId: true } } } }),
      this.prisma.stockEntry.count({ where: { projectId, date, type: 'ISSUE', workElementId: null } }),
      frontFrom
        ? this.prisma.stockTxn.findMany({
            where: { projectId, date: { gte: parseDate(frontFrom), lte: parseDate(to) }, type: { in: ISSUE_TYPES }, entry: { workElementId: { not: null } } },
            select: { itemId: true, quantity: true, entry: { select: { workElementId: true } } },
          })
        : Promise.resolve([]),
      frontFrom
        ? this.prisma.progressMaterial.findMany({ where: { progressEntry: { projectId, status: 'APPROVED', date: { lte: parseDate(to) } } }, select: { itemId: true, quantity: true, progressEntry: { select: { activityId: true } } } })
        : Promise.resolve([]),
    ]);
    const rows = structureRows({
      norms,
      activities: new Map(activities.map((a) => [a.id, { elementId: a.workElementId, planned: a.plannedQty }])),
      placed: new Map(placed.map((p) => [p.activityId, p._sum.quantity ?? ZERO])),
      used: used.map((u) => ({ activityId: u.progressEntry.activityId, itemId: u.itemId, quantity: u.quantity })),
      // Issues are negative rows, returns from site positive
      issued: issues.map((i) => ({ elementId: i.entry.workElementId!, itemId: i.itemId, quantity: i.quantity.neg() })),
      front: frontFrom
        ? {
            issued: frontIssues.map((i) => ({ elementId: i.entry.workElementId!, itemId: i.itemId, quantity: i.quantity.neg() })),
            used: frontUsed.map((u) => ({ activityId: u.progressEntry.activityId, itemId: u.itemId, quantity: u.quantity })),
          }
        : null,
    });
    const itemIds = [...new Set([...rows.values()].flatMap((r) => r.map((i) => i.itemId)))];
    const items = new Map((await this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } })).map((i) => [i.id, i]));
    const activityOf = new Map(activities.map((a) => [a.id, a]));
    const order = { OVER: 0, UNDER: 1, WITHIN: 2, NO_WORK: 3 } as const;

    const out: StructureElementDto[] = elements
      .filter((e) => rows.has(e.id))
      .map((e) => {
        const list = rows
          .get(e.id)!
          .map((r) => {
            const item = items.get(r.itemId)!;
            return {
              itemId: r.itemId,
              itemName: item.name,
              unit: item.unit,
              designQty: dec(r.design)!,
              neededQty: dec(r.needed)!,
              allowedQty: dec(r.allowed)!,
              usedQty: dec(r.used)!,
              issuedQty: dec(r.issued)!,
              atFrontQty: r.atFront ? dec(r.atFront) : null,
              variancePct: r.variancePct,
              status: r.status,
              lines: r.lines.map((l) => {
                const a = activityOf.get(l.activityId)!;
                return {
                  activityId: a.id,
                  activityName: a.name,
                  unit: a.unit,
                  plannedQty: dec(l.planned)!,
                  placedQty: dec(l.placed)!,
                  qtyPerUnit: norm6(l.qtyPerUnit),
                  wastagePct: pctStr(l.wastagePct),
                  usedQty: dec(l.used)!,
                  achievedPerUnit: l.achievedPerUnit ? norm6(l.achievedPerUnit) : null,
                };
              }),
            };
          })
          .sort((a, b) => order[a.status] - order[b.status] || a.itemName.localeCompare(b.itemName));
        return { elementId: e.id, code: e.code, name: e.name, label: labelOf(e), items: list, overCount: list.filter((i) => i.status === 'OVER').length };
      })
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    return { projectId, projectCode: project.code, from, to, elements: out, untiedIssues: untied };
  }

  // R3: pipe

  async pipe(user: RequestUser, projectId: string): Promise<ProjectPipeReconDto> {
    await this.reconciliation.assertView(user, projectId);
    return this.pipeFigures(projectId);
  }

  /** Pipe by size since the start, over the project and per zone of the network. */
  private async pipeFigures(projectId: string, to = todayIn()): Promise<ProjectPipeReconDto> {
    const { code } = await this.project(projectId);
    const upTo = parseDate(to);
    const network = await this.pipes.network(projectId);
    const zoneIds = network.zones.map((z) => z.id);
    const layIds = network.zones.flatMap((z) => (z.stageActivities.LAY_JOINT ? [z.stageActivities.LAY_JOINT] : []));
    const [stock, zoneIssues, uses, ordered, items] = await Promise.all([
      this.prisma.stockTxn.groupBy({ by: ['itemId', 'type'], where: { projectId, date: { lte: upTo } }, _sum: { quantity: true } }),
      zoneIds.length
        ? this.prisma.stockTxn.findMany({ where: { projectId, date: { lte: upTo }, type: { in: ISSUE_TYPES }, entry: { workElementId: { in: zoneIds } } }, select: { itemId: true, quantity: true, entry: { select: { workElementId: true } } } })
        : Promise.resolve([]),
      layIds.length
        ? this.prisma.progressEntry.findMany({
            where: { activityId: { in: layIds }, status: 'APPROVED', date: { lte: upTo }, pipeSegmentId: { not: null }, materials: { some: {} } },
            select: { quantity: true, pipeSegmentId: true, materials: { select: { itemId: true, quantity: true } } },
          })
        : Promise.resolve([]),
      this.prisma.purchaseOrderLine.findMany({ where: { purchaseOrder: { projectId, status: 'APPROVED' } }, select: { itemName: true, unit: true, quantity: true } }),
      this.prisma.item.findMany({
        where: { OR: [{ txns: { some: { projectId } } }, { progressUses: { some: { progressEntry: { projectId } } } }] },
        select: { id: true, name: true, unit: true, pipeDiameterMm: true, pipeMaterial: true, kgPerMetre: true },
      }),
    ]);

    type Size = { diameterMm: number; material: PipeMaterial };
    const keyOf = (s: Size) => `${s.diameterMm}-${s.material}`;
    const sizeOf = new Map<string, Size & { key: string }>();
    const unconverted: ProjectPipeReconDto['unconverted'] = [];
    const metresOf = new Map<string, (qty: number) => number>();
    for (const i of items) {
      const size = pipeSizeOf(i);
      if (!size) continue;
      const kg = i.kgPerMetre ? Number(i.kgPerMetre) : null;
      if (pipeMetres(1, i.unit, kg) === null) {
        unconverted.push({ itemId: i.id, itemName: i.name, unit: i.unit });
        continue;
      }
      sizeOf.set(i.id, { ...size, key: keyOf(size) });
      metresOf.set(i.id, (qty) => pipeMetres(qty, i.unit, kg)!);
    }

    const blank = (): PipeFigures => ({ scope: 0, laid: 0, tested: 0, used: 0, laidWithUse: 0, issued: 0, ordered: 0, received: 0, inStore: 0 });
    const sizes = new Map<string, Size>();
    const total = new Map<string, PipeFigures>();
    const zone = new Map<string, Map<string, PipeFigures>>();
    const at = (map: Map<string, PipeFigures>, s: Size) => {
      sizes.set(keyOf(s), s);
      const f = map.get(keyOf(s)) ?? blank();
      map.set(keyOf(s), f);
      return f;
    };
    const inZone = (zoneId: string, s: Size) => {
      const m = zone.get(zoneId) ?? new Map<string, PipeFigures>();
      zone.set(zoneId, m);
      return at(m, s);
    };

    for (const z of network.zones) {
      for (const r of z.table.rows) {
        const s = { diameterMm: r.diameterMm, material: r.material };
        for (const f of [at(total, s), inZone(z.id, s)]) {
          f.scope += r.scopeM;
          f.laid += r.laidM;
          f.tested += r.testedM;
        }
      }
    }
    for (const g of stock) {
      const s = sizeOf.get(g.itemId);
      if (!s) continue;
      const m = metresOf.get(g.itemId)!(Number(g._sum.quantity ?? 0));
      const f = at(total, s);
      f.inStore! += m;
      if (g.type === 'RECEIPT' || g.type === 'TRANSFER_IN' || g.type === 'RETURN_TO_VENDOR') f.received! += m;
      if (g.type === 'ISSUE' || g.type === 'RETURN_FROM_SITE') f.issued -= m;
    }
    const hasIssues = new Set<string>();
    for (const t of zoneIssues) {
      hasIssues.add(t.entry.workElementId!);
      const s = sizeOf.get(t.itemId);
      if (s) inZone(t.entry.workElementId!, s).issued -= metresOf.get(t.itemId)!(Number(t.quantity));
    }
    const segmentOf = new Map(network.segments.map((s) => [s.id, s]));
    for (const e of uses) {
      const seg = segmentOf.get(e.pipeSegmentId!);
      if (!seg) continue;
      const laidSizes = new Set<string>();
      for (const m of e.materials) {
        const s = sizeOf.get(m.itemId);
        if (!s) continue;
        const metres = metresOf.get(m.itemId)!(Number(m.quantity));
        for (const f of [at(total, s), inZone(seg.zoneId, s)]) f.used += metres;
        if (s.diameterMm === seg.diameterMm && s.material === seg.material && !laidSizes.has(s.key)) {
          laidSizes.add(s.key);
          for (const f of [at(total, s), inZone(seg.zoneId, s)]) f.laidWithUse += Number(e.quantity);
        }
      }
    }
    const byName = new Map(items.map((i) => [`${i.name.toLowerCase()}|${i.unit.toLowerCase()}`, i]));
    for (const l of ordered) {
      const item = byName.get(`${l.itemName.toLowerCase()}|${l.unit.toLowerCase()}`);
      const s = pipeSizeOf(item ?? { name: l.itemName });
      const metres = s ? pipeMetres(Number(l.quantity), l.unit, item?.kgPerMetre ? Number(item.kgPerMetre) : null) : null;
      if (s && metres !== null) at(total, s).ordered! += metres;
    }

    const row = (key: string, f: PipeFigures, isProject: boolean, issues: boolean): PipeReconRowDto => {
      const s = sizes.get(key)!;
      const r = pipeRow(s.material, f, PIPE_CUT_WASTAGE_PCT[s.material], isProject, issues);
      return {
        key,
        diameterMm: s.diameterMm,
        material: s.material,
        label: pipeSizeLabel(s),
        scopeM: m3(f.scope),
        orderedM: isProject ? m3(f.ordered ?? 0) : null,
        receivedM: isProject ? m3(f.received ?? 0) : null,
        issuedM: m3(f.issued),
        inStoreM: isProject ? m3(f.inStore ?? 0) : null,
        laidM: m3(f.laid),
        testedM: m3(f.tested),
        usedM: m3(f.used),
        laidWithUseM: m3(f.laidWithUse),
        wastagePct: r.wastagePct,
        allowedWastagePct: r.allowedWastagePct,
        atSiteM: r.atSite,
        balanceToLayM: r.balanceToLay,
        balanceToBuyM: r.balanceToBuy,
        flags: r.flags,
      };
    };
    const bySize = (a: PipeReconRowDto, b: PipeReconRowDto) => b.diameterMm - a.diameterMm || a.material.localeCompare(b.material);
    const anyIssued = [...total.values()].some((f) => f.issued !== 0);
    const zones: PipeZoneReconDto[] = network.zones
      .filter((z) => zone.has(z.id))
      .map((z) => ({
        zoneId: z.id,
        code: z.code,
        label: z.label,
        hasIssues: hasIssues.has(z.id),
        rows: [...zone.get(z.id)!]
          .filter(([, f]) => f.scope > 0)
          .map(([k, f]) => row(k, f, false, hasIssues.has(z.id)))
          .sort(bySize),
      }))
      .filter((z) => z.rows.length);
    return {
      projectId,
      projectCode: code,
      to,
      // Pipe of a size no network has (service pipe to the houses, say) is in Materials and the kits
      sizes: [...total].filter(([, f]) => f.scope > 0).map(([k, f]) => row(k, f, true, anyIssued)).sort(bySize),
      zones,
      unconverted: unconverted.sort((a, b) => a.itemName.localeCompare(b.itemName)),
    };
  }

  // R5: house-connection kits

  async kits(user: RequestUser, projectId: string): Promise<ProjectKitReconDto> {
    await this.reconciliation.assertView(user, projectId);
    const project = await this.project(projectId);
    const activities = await this.prisma.activity.findMany({
      where: { projectId, workElement: { elementType: 'HOUSE_CONNECTIONS' }, materialNorms: { some: {} } },
      select: {
        id: true,
        name: true,
        unit: true,
        plannedQty: true,
        workElementId: true,
        workElement: { select: ELEMENT_SELECT },
        materialNorms: { select: { itemId: true, qtyPerUnit: true, wastagePct: true, item: { select: { name: true, unit: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (!activities.length) return { projectId, projectCode: project.code, kits: [] };
    const ids = activities.map((a) => a.id);
    const elementIds = [...new Set(activities.map((a) => a.workElementId!))];
    const [done, issues, used] = await Promise.all([
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { activityId: { in: ids }, status: 'APPROVED' }, _sum: { quantity: true } }),
      this.prisma.stockTxn.findMany({
        where: { projectId, type: { in: ISSUE_TYPES }, entry: { OR: [{ activityId: { in: ids } }, { activityId: null, workElementId: { in: elementIds } }] } },
        select: { itemId: true, quantity: true, entry: { select: { activityId: true, workElementId: true } } },
      }),
      this.prisma.progressMaterial.findMany({ where: { progressEntry: { activityId: { in: ids }, status: 'APPROVED' } }, select: { itemId: true, quantity: true, progressEntry: { select: { activityId: true } } } }),
    ]);
    // An issue to the component and not to an activity goes to the one kit there that has the item
    const kitFor = (t: (typeof issues)[number]) =>
      t.entry.activityId ?? (activities.filter((a) => a.workElementId === t.entry.workElementId && a.materialNorms.some((n) => n.itemId === t.itemId)).length === 1 ? activities.find((a) => a.workElementId === t.entry.workElementId && a.materialNorms.some((n) => n.itemId === t.itemId))!.id : null);
    const sumOf = (rows: { key: string | null; quantity: D }[]) => {
      const m = new Map<string, D>();
      for (const r of rows) if (r.key) m.set(r.key, (m.get(r.key) ?? ZERO).plus(r.quantity));
      return m;
    };
    const issuedOf = sumOf(issues.map((t) => ({ key: `${kitFor(t)}|${t.itemId}`, quantity: t.quantity.neg() })));
    const usedOf = sumOf(used.map((u) => ({ key: `${u.progressEntry.activityId}|${u.itemId}`, quantity: u.quantity })));
    const doneOf = new Map(done.map((d) => [d.activityId, d._sum.quantity ?? ZERO]));

    const kits: KitReconDto[] = activities.map((a) => {
      const doneQty = doneOf.get(a.id) ?? ZERO;
      const rows = kitRows(
        doneQty,
        a.materialNorms.map((n) => ({ itemId: n.itemId, perKit: n.qtyPerUnit, wastagePct: n.wastagePct, issued: issuedOf.get(`${a.id}|${n.itemId}`) ?? ZERO, used: usedOf.get(`${a.id}|${n.itemId}`) ?? ZERO })),
      );
      const itemOf = new Map(a.materialNorms.map((n) => [n.itemId, n.item]));
      const components = rows.map((r) => ({
        itemId: r.itemId,
        itemName: itemOf.get(r.itemId)!.name,
        unit: itemOf.get(r.itemId)!.unit,
        perKit: norm6(r.perKit),
        wastagePct: pctStr(r.wastagePct),
        neededQty: dec(r.needed)!,
        issuedQty: dec(r.issued)!,
        usedQty: dec(r.used)!,
        differenceQty: dec(r.difference)!,
        kitsShort: r.kitsShort,
        status: r.status,
      }));
      return {
        activityId: a.id,
        activityName: a.name,
        elementLabel: a.workElement ? `${a.workElement.code} ${labelOf(a.workElement)}` : null,
        unit: a.unit,
        doneQty: dec(doneQty)!,
        plannedQty: dec(a.plannedQty)!,
        components,
        kitsShort: Math.max(0, ...components.map((c) => c.kitsShort)),
      };
    });
    return { projectId, projectCode: project.code, kits };
  }

  // R6: exceptions

  async exceptions(user: RequestUser, projectId: string, q: ReconciliationQuery): Promise<ProjectReconExceptionsDto> {
    await this.reconciliation.assertView(user, projectId);
    const project = await this.project(projectId);
    const to = q.to ?? todayIn();
    const from = q.from ?? addDays(to, -EXCEPTION_DAYS);
    if (from > to) throw new BadRequestException('The period starts after it ends: choose an earlier From date');
    const date = { gte: parseDate(from), lte: parseDate(to) };
    const [uses, issues, work, elements] = await Promise.all([
      this.prisma.progressMaterial.findMany({
        where: { progressEntry: { projectId, status: 'APPROVED', date, dailyReportId: { not: null }, activity: { workElementId: { not: null } } } },
        select: { itemId: true, quantity: true, progressEntry: { select: { date: true, dailyReportId: true, activity: { select: { workElementId: true } } } } },
      }),
      this.prisma.stockTxn.findMany({
        where: { projectId, type: { in: ISSUE_TYPES }, date: { gte: parseDate(addDays(from, -USE_ISSUE_DAYS)), lte: parseDate(to) }, entry: { workElementId: { not: null } } },
        select: { itemId: true, quantity: true, date: true, entry: { select: { id: true, entryNo: true, workElementId: true } } },
      }),
      this.prisma.progressEntry.findMany({
        where: { projectId, status: 'APPROVED', date, activity: { workElementId: { not: null } } },
        select: { date: true, activity: { select: { workElementId: true } } },
        distinct: ['date', 'activityId'],
      }),
      this.prisma.workElement.findMany({ where: { projectId }, select: ELEMENT_SELECT }),
    ]);
    const tiesIssues = issues.some((i) => dateOnly(i.date)! >= from);
    const events = exceptionEvents(
      tiesIssues ? uses.map((u) => ({ date: dateOnly(u.progressEntry.date)!, elementId: u.progressEntry.activity.workElementId!, itemId: u.itemId, quantity: u.quantity, dprId: u.progressEntry.dailyReportId! })) : [],
      issues.map((i) => ({ date: dateOnly(i.date)!, elementId: i.entry.workElementId!, itemId: i.itemId, quantity: i.quantity.neg(), entryId: i.entry.id, entryNo: i.entry.entryNo })),
      work.map((w) => ({ date: dateOnly(w.date)!, elementId: w.activity.workElementId! })),
      to,
    ).filter((e) => e.date >= from);
    const items = new Map((await this.prisma.item.findMany({ where: { id: { in: [...new Set(events.map((e) => e.itemId))] } }, select: { id: true, name: true, unit: true } })).map((i) => [i.id, i]));
    const elementOf = new Map(elements.map((e) => [e.id, e]));
    const where = (id: string) => {
      const e = elementOf.get(id);
      return e ? `${e.code} ${labelOf(e)}` : '';
    };

    const rows: ReconExceptionDto[] = events.map((e, i) => {
      const item = items.get(e.itemId)!;
      const qty = `${dec(e.quantity)} ${item.unit}`;
      return {
        key: `${e.kind}-${i}`,
        kind: e.kind,
        date: e.date,
        elementId: e.elementId,
        elementLabel: where(e.elementId),
        itemId: e.itemId,
        itemName: item.name,
        unit: item.unit,
        qty: dec(e.quantity),
        text:
          e.kind === 'USE_WITHOUT_ISSUE'
            ? `The DPR used ${qty} of ${item.name} at ${where(e.elementId)}; nothing of it was issued there in the ${USE_ISSUE_DAYS} days before`
            : `${e.entryNo} issued ${qty} of ${item.name} to ${where(e.elementId)}; no approved work there in the 3 days after`,
        dprId: e.dprId,
        entryId: e.entryId,
        entryNo: e.entryNo,
      };
    });

    // Pipe in the ground beyond what was issued to the zone, as it stands at the end of the period
    const pipe = await this.pipeFigures(projectId, to);
    for (const z of pipe.zones)
      for (const r of z.rows)
        if (r.flags.includes('LAID_ABOVE_ISSUED'))
          rows.push({
            key: `LAID_ABOVE_ISSUED-${z.zoneId}-${r.key}`,
            kind: 'LAID_ABOVE_ISSUED',
            date: to,
            elementId: z.zoneId,
            elementLabel: `${z.code} ${z.label}`,
            itemId: null,
            itemName: r.label,
            unit: 'm',
            qty: dec(new Prisma.Decimal(m3(r.laidM - r.issuedM))),
            text: `${r.label} in ${z.label}: ${round1(r.laidM)} m laid against ${round1(r.issuedM)} m issued to the zone`,
            dprId: null,
            entryId: null,
            entryNo: null,
          });
    rows.sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
    return { projectId, projectCode: project.code, from, to, rows, tiesIssues };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  coveredLength,
  isPipeItem,
  pipelineStageOf,
  type ChainageLayer,
  type SectorCell,
  type SectorMatrix,
  type SectorProgressDto,
  type VillagePipeline,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import type { RequestUser } from '../common/current-user';
import { dateOnly, dec } from '../common/serialize';

type Entry = {
  id: string;
  activityId: string;
  date: Date;
  quantity: Prisma.Decimal;
  status: 'APPROVED' | 'SUBMITTED';
  chainageFrom: number | null;
  chainageTo: number | null;
  floor: string | null;
  village: string | null;
};

const ZERO = new Prisma.Decimal(0);
const sum = (xs: Prisma.Decimal[]) => xs.reduce((a, b) => a.add(b), ZERO);
/** Most segments one strip row carries; older ones are dropped first. */
const MAX_SEGMENTS = 2000;

/**
 * Sector progress views (v4 item 41), built from approved and submitted progress entries: a chainage strip per
 * activity for roads (and pipelines with a chainage range), a floor × activity matrix for buildings, and for water
 * supply a village × activity matrix with pipe ordered, supplied, laid and tested.
 */
@Injectable()
export class SectorService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
  ) {}

  async get(user: RequestUser, projectId: string): Promise<SectorProgressDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, type: true, chainageStart: true, chainageEnd: true, floors: true, villages: true } });
    if (!project) throw new NotFoundException('Project not found');
    const [activities, rows] = await Promise.all([
      this.prisma.activity.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, unit: true, plannedQty: true } }),
      this.prisma.progressEntry.findMany({
        where: { projectId, status: { in: ['APPROVED', 'SUBMITTED'] } },
        orderBy: { date: 'desc' },
        select: { id: true, activityId: true, date: true, quantity: true, status: true, chainageFrom: true, chainageTo: true, floor: true, village: true },
      }),
    ]);
    const entries = rows as Entry[];
    const byActivity = new Map<string, Entry[]>();
    for (const e of entries) byActivity.set(e.activityId, [...(byActivity.get(e.activityId) ?? []), e]);
    const approvedSum = (es: Entry[]) => sum(es.filter((e) => e.status === 'APPROVED').map((e) => e.quantity));
    const executed = new Map(activities.map((a) => [a.id, approvedSum(byActivity.get(a.id) ?? [])]));

    const water = project.type === 'WATER_SUPPLY';
    const hasRange = project.chainageStart !== null && project.chainageEnd !== null;
    let strip: ChainageLayer[] | null = null;
    if (project.type === 'ROAD' || ((water || project.type === 'SEWERAGE') && hasRange)) {
      strip = activities
        .filter((a) => {
          const placed = (byActivity.get(a.id) ?? []).some((e) => e.chainageFrom !== null);
          // A water network is drawn by village, so only work placed along the chainage (mains) makes a strip row.
          return placed || (!water && a.unit.trim().toUpperCase() !== 'LS');
        })
        .map((a) => {
          const es = byActivity.get(a.id) ?? [];
          const placed = es.filter((e) => e.chainageFrom !== null);
          const seg = (e: Entry) => ({ from: e.chainageFrom!, to: e.chainageTo ?? e.chainageFrom! });
          const approved = placed.filter((e) => e.status === 'APPROVED').map(seg);
          const covered = coveredLength(approved, project.chainageStart, project.chainageEnd);
          const all = coveredLength(placed.map(seg), project.chainageStart, project.chainageEnd);
          return {
            activityId: a.id,
            name: a.name,
            unit: a.unit,
            plannedQty: dec(a.plannedQty)!,
            executedQty: dec(executed.get(a.id)!)!,
            coveredM: covered,
            pendingM: all - covered,
            unplacedQty: dec(approvedSum(es.filter((e) => e.chainageFrom === null)))!,
            segments: placed.slice(0, MAX_SEGMENTS).map((e) => ({ ...seg(e), quantity: dec(e.quantity)!, status: e.status, date: dateOnly(e.date)!, entryId: e.id })),
          };
        });
    }

    let matrix: SectorMatrix | null = null;
    if (project.type === 'BUILDING' || water) {
      const key = (e: Entry) => (water ? e.village : e.floor);
      const listed = water ? project.villages : project.floors;
      const extra = [...new Set(entries.map(key).filter((k): k is string => !!k && !listed.includes(k)))].sort();
      const used = activities.filter((a) => a.unit.trim().toUpperCase() !== 'LS' || (byActivity.get(a.id) ?? []).some((e) => key(e)));
      const cells: SectorCell[] = [];
      for (const a of used) {
        const groups = new Map<string, Entry[]>();
        for (const e of byActivity.get(a.id) ?? []) {
          const k = key(e);
          if (k) groups.set(k, [...(groups.get(k) ?? []), e]);
        }
        for (const [row, es] of groups)
          cells.push({
            row,
            activityId: a.id,
            approvedQty: dec(approvedSum(es))!,
            pendingQty: dec(sum(es.filter((e) => e.status === 'SUBMITTED').map((e) => e.quantity)))!,
            lastDate: dateOnly(es[0].date),
          });
      }
      matrix = {
        rowLabel: water ? 'Village' : 'Floor',
        rows: [...listed, ...extra],
        activities: used.map((a) => ({ id: a.id, name: a.name, unit: a.unit, plannedQty: dec(a.plannedQty)!, executedQty: dec(executed.get(a.id)!)! })),
        cells,
        unassigned: used.map((a) => ({ activityId: a.id, approvedQty: dec(approvedSum((byActivity.get(a.id) ?? []).filter((e) => !key(e))))! })).filter((u) => Number(u.approvedQty) !== 0),
      };
    }

    let pipeline: SectorProgressDto['pipeline'] = null;
    if (water) {
      const stage = new Map(activities.map((a) => [a.id, pipelineStageOf(a)]));
      const laidActs = activities.filter((a) => stage.get(a.id) === 'LAID');
      const approvedOf = (s: 'LAID' | 'TESTED') => entries.filter((e) => e.status === 'APPROVED' && stage.get(e.activityId) === s);
      const [poLines, receipts] = await Promise.all([
        this.prisma.purchaseOrderLine.findMany({ where: { purchaseOrder: { projectId, status: 'APPROVED' } }, select: { itemName: true, unit: true, quantity: true } }),
        this.prisma.stockTxn.findMany({ where: { projectId, type: { in: ['RECEIPT', 'RETURN_TO_VENDOR'] } }, select: { quantity: true, item: { select: { name: true, unit: true } } } }),
      ]);
      const villageNames = [...new Set([...project.villages, ...entries.map((e) => e.village).filter((v): v is string => !!v)])];
      const villages: VillagePipeline[] = villageNames.map((v) => ({
        village: v,
        laidM: dec(sum(approvedOf('LAID').filter((e) => e.village === v).map((e) => e.quantity)))!,
        testedM: dec(sum(approvedOf('TESTED').filter((e) => e.village === v).map((e) => e.quantity)))!,
      }));
      pipeline = {
        stages: {
          orderedM: dec(sum(poLines.filter((l) => isPipeItem(l.itemName, l.unit)).map((l) => l.quantity)))!,
          // Returns to the supplier are stored negative.
          suppliedM: dec(sum(receipts.filter((t) => isPipeItem(t.item.name, t.item.unit)).map((t) => t.quantity)))!,
          laidM: dec(sum(approvedOf('LAID').map((e) => e.quantity)))!,
          testedM: dec(sum(approvedOf('TESTED').map((e) => e.quantity)))!,
          plannedM: dec(sum(laidActs.map((a) => a.plannedQty)))!,
        },
        villages,
      };
    }

    return { projectId, type: project.type, chainageStart: project.chainageStart, chainageEnd: project.chainageEnd, floors: project.floors, villages: project.villages, strip, matrix, pipeline };
  }
}

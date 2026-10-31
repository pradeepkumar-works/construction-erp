import { ForbiddenException, Injectable } from '@nestjs/common';
import type { DprChecksDto, ManpowerLine } from '@erp/shared';
import { DPR_CREW_COPY_DAYS, DPR_ISSUE_DAYS, DPR_PHOTO_DAYS, canSeeDprChecks } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { dateOnly, parseDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { DprService } from './dpr.service';
import { type CheckReport, type EarlierPhoto, type EarlierReport, crewKeyOf, dprChecks } from './dpr-check-rules';

const daysBefore = (d: string, n: number) => dateOnly(new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000));
const crewOf = (v: unknown): ManpowerLine[] => (Array.isArray(v) ? (v as ManpowerLine[]) : []);

/**
 * DPR credibility checks for those who approve daily reports. The report comes through
 * `DprService.get` with the caller, so a report they cannot open gives nothing; its project's earlier reports, norms,
 * issues and photos are then read for the comparison. The rules are pure in `dpr-check-rules.ts`.
 */
@Injectable()
export class DprChecksService {
  constructor(
    private prisma: PrismaService,
    private dpr: DprService,
  ) {}

  async forReport(user: RequestUser, id: string): Promise<DprChecksDto> {
    if (!canSeeDprChecks(user.roleKey)) throw new ForbiddenException('The checks are for those who approve daily reports');
    const d = await this.dpr.get(user, id);
    const lines = d.lines ?? [];
    const report: CheckReport = {
      id: d.id,
      date: d.date,
      crew: d.totalManpower,
      machines: d.machinery.length,
      crewKey: crewKeyOf(d.manpower),
      lines: lines.map((l) => ({
        id: l.id,
        activityId: l.activityId,
        activityName: l.activityName,
        unit: l.unit,
        quantity: Number(l.quantity),
        crew: l.labour.reduce((s, c) => s + (Number(c.count) || 0), 0),
        machines: l.machines.length,
        usedItemIds: l.materials.filter((m) => Number(m.quantity) > 0).map((m) => m.itemId),
      })),
    };
    const activityIds = [...new Set(lines.map((l) => l.activityId))];
    const where = { organizationId: user.organizationId, projectId: d.projectId };

    const [earlierRows, activities, actNorms, photos] = await Promise.all([
      // Sent or approved reports before this one; drafts are not yet anyone's word.
      this.prisma.dailyReport.findMany({
        where: { ...where, date: { lt: parseDate(d.date) }, status: { in: ['SUBMITTED', 'APPROVED'] } },
        orderBy: { date: 'desc' },
        take: DPR_CREW_COPY_DAYS,
        select: { id: true, date: true, manpower: true, lines: { select: { activityId: true, quantity: true } } },
      }),
      activityIds.length ? this.prisma.activity.findMany({ where: { id: { in: activityIds } }, select: { id: true, boqItemId: true } }) : [],
      activityIds.length ? this.prisma.activityMaterialNorm.findMany({ where: { ...where, activityId: { in: activityIds } }, select: { activityId: true, itemId: true, item: { select: { name: true } } } }) : [],
      this.prisma.attachment.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { dailyReport: { projectId: d.projectId, date: { gte: parseDate(daysBefore(d.date, DPR_PHOTO_DAYS)), lt: parseDate(d.date) } } },
            { progressEntry: { dailyReport: { projectId: d.projectId, date: { gte: parseDate(daysBefore(d.date, DPR_PHOTO_DAYS)), lt: parseDate(d.date) } } } },
          ],
        },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          size: true,
          dailyReport: { select: { id: true, date: true } },
          progressEntry: { select: { dailyReport: { select: { id: true, date: true } } } },
        },
      }),
    ]);

    // What each activity's material needs: its own norms, else its BOQ item's (`normSource`).
    const own = new Set(actNorms.map((n) => n.activityId));
    const boqIds = [...new Set(activities.filter((a) => !own.has(a.id) && a.boqItemId).map((a) => a.boqItemId!))];
    const boqNorms = boqIds.length ? await this.prisma.materialNorm.findMany({ where: { ...where, boqItemId: { in: boqIds } }, select: { boqItemId: true, itemId: true, item: { select: { name: true } } } }) : [];
    const needs = new Map<string, { itemId: string; name: string }[]>();
    for (const n of actNorms) needs.set(n.activityId, [...(needs.get(n.activityId) ?? []), { itemId: n.itemId, name: n.item.name }]);
    for (const a of activities)
      if (!own.has(a.id) && a.boqItemId) {
        const items = boqNorms.filter((n) => n.boqItemId === a.boqItemId).map((n) => ({ itemId: n.itemId, name: n.item.name }));
        if (items.length) needs.set(a.id, items);
      }
    const itemIds = [...new Set([...needs.values()].flat().map((i) => i.itemId))];
    const issuedRows = itemIds.length
      ? await this.prisma.stockTxn.findMany({
          where: { ...where, type: 'ISSUE', itemId: { in: itemIds }, date: { gte: parseDate(daysBefore(d.date, DPR_ISSUE_DAYS)), lte: parseDate(d.date) } },
          select: { itemId: true },
          distinct: ['itemId'],
        })
      : [];

    const earlier: EarlierReport[] = earlierRows.map((e) => ({
      id: e.id,
      date: dateOnly(e.date),
      crewKey: crewKeyOf(crewOf(e.manpower)),
      lines: e.lines.map((l) => ({ activityId: l.activityId, quantity: Number(l.quantity) })),
    }));
    const earlierPhotos: EarlierPhoto[] = photos
      .map((p) => {
        const r = p.dailyReport ?? p.progressEntry?.dailyReport;
        return r ? { id: p.id, fileName: p.fileName, mimeType: p.mimeType, size: p.size, dprId: r.id, date: dateOnly(r.date) } : null;
      })
      .filter((p) => !!p)
      .sort((a, b) => b.date.localeCompare(a.date));
    const mine = [...d.attachments, ...lines.flatMap((l) => l.attachments)];

    return { dprId: d.id, checks: dprChecks(report, earlier, needs, new Set(issuedRows.map((r) => r.itemId)), mine, earlierPhotos) };
  }
}

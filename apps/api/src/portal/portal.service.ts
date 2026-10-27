import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, PortalActivityDto, PortalDprDto, PortalProjectDetailDto, PortalProjectDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { DprService } from '../dpr/dpr.service';
import { physicalProgress } from '../common/progress';
import { dateOnly, dec, money, parseDate, pct } from '../common/serialize';
import { pageArgs, paginated } from '../common/paging';
import { todayIn } from '../notifications/time';
import { PortalDprQuery } from './portal.dto';
import { ATTACHMENT_FIELDS } from '../common/attachments.service';

const DAY = 86_400_000;
const projectInclude = {
  projectManager: { select: { fullName: true } },
  activities: {
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { boqItem: { select: { rate: true } }, progressEntries: { where: { status: 'APPROVED' }, select: { quantity: true } } },
  },
  workElements: { select: { id: true, parentId: true, weightPct: true } },
  dailyReports: { where: { status: 'APPROVED' }, orderBy: { date: 'desc' }, take: 1, select: { date: true } },
  _count: { select: { raBills: { where: { status: 'APPROVED', stage: 'SENT' } }, inspections: { where: { status: 'SUBMITTED' } } } },
} satisfies Prisma.ProjectInclude;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

/**
 * The client portal (v3 item 32): projects, approved progress, approved DPRs and the progress report for the client's
 * engineer or consultant. Who sees what is ProjectAccessService (guests see the projects they are members of); bills and
 * inspections live in their own services (listForClient, certifyAsClient, witness). Staff can open the same views to
 * see what the client sees.
 */
@Injectable()
export class PortalService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private dpr: DprService) {}

  /**
   * Activities with the agreed programme's dates (e2e review, fix 1): the client sees the baseline the PM froze, never
   * the contractor's working re-plan, which may run past the contract date while recovery is worked out.
   */
  private activities(p: ProjectRow): PortalActivityDto[] {
    const baselined = !!p.baselineAt;
    return p.activities.map((a) => {
      const done = a.progressEntries.reduce((s, e) => s.add(e.quantity), new Prisma.Decimal(0));
      return {
        id: a.id,
        name: a.name,
        unit: a.unit,
        plannedQty: dec(a.plannedQty)!,
        doneQty: dec(done)!,
        pct: pct(done, a.plannedQty),
        plannedStart: baselined ? dateOnly(a.baselineStart) : null,
        plannedEnd: baselined ? dateOnly(a.baselineEnd) : null,
      };
    });
  }

  private toDto(p: ProjectRow): PortalProjectDto {
    const today = parseDate(todayIn());
    const start = p.startDate;
    const end = p.endDate;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      status: p.status,
      clientName: p.clientName,
      consultantName: p.consultantName,
      workOrderNo: p.workOrderNo,
      location: p.location,
      startDate: dateOnly(start),
      endDate: dateOnly(end),
      contractValue: money(p.contractValue),
      projectManagerName: p.projectManager?.fullName ?? null,
      physicalProgressPct: physicalProgress(
        p.activities.map((a) => ({ ...a, rate: a.boqItem?.rate ?? null, executed: a.progressEntries.reduce((s, e) => s.add(e.quantity), new Prisma.Decimal(0)) })),
        p.workElements,
      ),
      timeElapsedPct: start && end && end > start ? Math.round(Math.min(100, Math.max(0, ((today.getTime() - start.getTime() + DAY) / (end.getTime() - start.getTime() + DAY)) * 100)) * 10) / 10 : null,
      lastDprDate: dateOnly(p.dailyReports[0]?.date ?? null),
      billsToCertify: p._count.raBills,
      openInspections: p._count.inspections,
    };
  }

  async projects(user: RequestUser): Promise<PortalProjectDto[]> {
    const rows = await this.prisma.project.findMany({ where: this.access.projectWhere(user), include: projectInclude, orderBy: [{ status: 'asc' }, { code: 'asc' }] });
    return rows.map((p) => this.toDto(p));
  }

  async project(user: RequestUser, id: string): Promise<PortalProjectDetailDto> {
    const p = await this.prisma.project.findFirst({ where: { id, ...this.access.projectWhere(user) }, include: projectInclude });
    if (!p) throw new NotFoundException('Project not found or not accessible');
    return { ...this.toDto(p), programme: p.baselineAt ? 'BASELINE' : 'NONE', activities: this.activities(p) };
  }

  /** Approved DPRs, newest first. */
  async dprs(user: RequestUser, projectId: string, q: PortalDprQuery): Promise<Paginated<PortalDprDto>> {
    await this.access.assertCanAccessProject(user, projectId);
    const where: Prisma.DailyReportWhereInput = { projectId, organizationId: user.organizationId, status: 'APPROVED' };
    if (q.from || q.to) where.date = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.dailyReport.findMany({ where, include: { project: { select: { name: true } }, submittedBy: { select: { fullName: true } }, reviewedBy: { select: { fullName: true } }, attachments: { select: ATTACHMENT_FIELDS }, _count: { select: { lines: true } } }, orderBy: [{ date: 'desc' }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return paginated(
      rows.map((r) => {
        const d = this.dpr.toDto(r);
        return {
          id: d.id,
          projectId: d.projectId,
          date: d.date,
          weather: d.weather,
          siteCondition: d.siteCondition,
          manpower: d.manpower,
          machinery: d.machinery,
          materialReceived: d.materialReceived,
          workExecuted: d.workExecuted,
          testsConducted: d.testsConducted,
          safetyObservations: d.safetyObservations,
          issues: d.issues,
          nextDayPlan: d.nextDayPlan,
          totalManpower: d.totalManpower,
          attachments: d.attachments,
          submittedByName: d.submittedByName,
          reviewedByName: d.reviewedByName,
          reviewedAt: d.reviewedAt,
        };
      }),
      total,
      args,
    );
  }
}

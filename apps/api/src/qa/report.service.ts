import { ForbiddenException, Injectable } from '@nestjs/common';
import { isGuest, countBy, monthBounds, ncrAgeBand, passRate, reportRowHasWork, reportTotals, NCR_AGE_BAND_LABELS, type NcrAgeBand, type QaReportDto, type QaReportRowDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { MastersService } from '../masters/masters.service';
import { todayIn } from '../notifications/time';
import { dateOnly, parseDate } from '../common/serialize';
import { QaService } from './qa.service';
import { QaRegistersService } from './registers.service';
import { QaReportQuery } from './report.dto';

/**
 * The monthly quality report (item 137 part 3): per project, the month's tests and pass rate, the tests the plan is short
 * of today, NCRs raised and closed with the open ones by age, rework cost, audits and open findings, and the grades whose
 * cubes fail; and for the company, NCRs by category and root cause, calibration, late reports and missing certificates.
 * The plan, cubes and registers are read through their own services; the totals are `reportTotals`.
 */
@Injectable()
export class QaReportService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private masters: MastersService,
    private qa: QaService,
    private registers: QaRegistersService,
  ) {}

  async monthly(user: RequestUser, q: QaReportQuery): Promise<QaReportDto> {
    if (isGuest(user.roleKey)) throw new ForbiddenException('The quality report is for the company’s own staff');
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const today = todayIn();
    const month = q.month ?? today.slice(0, 7);
    const { from, to } = monthBounds(month);
    const inMonth = { gte: parseDate(from), lte: parseDate(to) };
    const scope = { ...this.access.submissionWhere(user), ...(q.projectId ? { projectId: q.projectId } : {}) };

    const projects = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}), type: { notIn: ['STORE', 'PLANT'] }, status: { not: 'CLOSED' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const [tests, raised, closed, open, audits, findings, due, cubes, register, late, missing, labs, categories, causes] = await Promise.all([
      this.prisma.qualityTest.groupBy({ by: ['projectId', 'result'], where: { ...scope, sampledOn: inMonth }, _count: true }),
      this.prisma.ncr.findMany({ where: { ...scope, raisedOn: inMonth }, select: { projectId: true, category: true, rootCause: true, reworkCost: true } }),
      this.prisma.ncr.groupBy({ by: ['projectId'], where: { ...scope, status: 'CLOSED', closedAt: { gte: parseDate(from), lt: new Date(parseDate(to).getTime() + 86_400_000) } }, _count: true }),
      this.prisma.ncr.findMany({ where: { ...scope, status: { not: 'CLOSED' } }, select: { projectId: true, raisedOn: true } }),
      this.prisma.qaAudit.groupBy({ by: ['projectId'], where: { ...scope, date: inMonth }, _count: true }),
      this.prisma.qaAuditFinding.findMany({
        where: { organizationId: user.organizationId, audit: scope, closedOn: null, OR: [{ ncrId: null }, { ncr: { status: { not: 'CLOSED' } } }] },
        select: { audit: { select: { projectId: true } } },
      }),
      this.qa.testsDue(user, { projectId: q.projectId }),
      this.qa.cubes(user, q.projectId),
      this.registers.instruments(user, { projectId: q.projectId }),
      this.registers.samples(user, { projectId: q.projectId, state: 'AT_LAB', late: true, page: 1, pageSize: 1 }),
      this.registers.certificatesMissing(user, q.projectId),
      this.registers.labs(user),
      this.masters.entriesFor(user.organizationId, 'ncrCategory'),
      this.masters.entriesFor(user.organizationId, 'ncrRootCause'),
    ]);

    const count = <T extends { projectId: string }>(xs: T[], id: string) => xs.filter((x) => x.projectId === id).length;
    const grouped = (xs: { projectId: string; _count: number }[], id: string) => xs.filter((x) => x.projectId === id).reduce((s, x) => s + x._count, 0);
    const all: QaReportRowDto[] = projects.map((p) => {
      const t = tests.filter((x) => x.projectId === p.id);
      const of = (r: string) => t.filter((x) => x.result === r).reduce((s, x) => s + x._count, 0);
      const passed = of('PASS');
      const failed = of('FAIL');
      const openHere = open.filter((x) => x.projectId === p.id);
      return {
        projectId: p.id,
        projectName: p.name,
        tests: t.reduce((s, x) => s + x._count, 0),
        passed,
        failed,
        passRate: passRate(passed, failed),
        short: due.rows.filter((r) => r.line.projectId === p.id).reduce((s, r) => s + r.short, 0),
        ncrsRaised: count(raised, p.id),
        ncrsClosed: grouped(closed, p.id),
        ncrsOpen: openHere.length,
        ncrsOver30: openHere.filter((x) => ncrAgeBand(dateOnly(x.raisedOn)!, today) === 'OVER_30').length,
        reworkCost: raised
          .filter((x) => x.projectId === p.id)
          .reduce((s, x) => s + Number(x.reworkCost ?? 0), 0)
          .toFixed(2),
        audits: grouped(audits, p.id),
        findingsOpen: findings.filter((f) => f.audit.projectId === p.id).length,
        cubesFailing: cubes.filter((c) => c.projectId === p.id && c.acceptance.verdict === 'FAIL').map((c) => c.grade),
      };
    });
    const rows = all.filter(reportRowHasWork);
    const bands = Object.keys(NCR_AGE_BAND_LABELS) as NcrAgeBand[];
    const ages = open.map((x) => ncrAgeBand(dateOnly(x.raisedOn)!, today));
    const nameIn = (list: { code: string; name: string }[]) => (code: string) => list.find((e) => e.code === code)?.name ?? code;
    return {
      month,
      from,
      to,
      rows,
      totals: reportTotals(rows),
      ncrAges: bands.map((band) => ({ band, count: ages.filter((a) => a === band).length })),
      byCategory: countBy(
        raised.map((x) => x.category),
        nameIn(categories),
      ),
      byRootCause: countBy(
        raised.map((x) => x.rootCause),
        nameIn(causes),
      ),
      instrumentsOverdue: register.overdue,
      instrumentsDueSoon: register.dueSoon,
      samplesLate: late.late,
      certificatesMissing: missing.length,
      labsExpiring: labs.filter((l) => l.active && (l.accreditation === 'EXPIRING' || l.accreditation === 'EXPIRED')).map((l) => l.name),
    };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BILL_STAGE_LABELS,
  CALIBRATION_STATE_LABELS,
  DELAY_PARTY_LABELS,
  DESIGN_SUBMISSION_STATUS_LABELS,
  DOCUMENT_DISCIPLINE_LABELS,
  EQUIPMENT_OWNERSHIP_LABELS,
  LETTER_DIRECTION_LABELS,
  MEETING_ACTION_STATUS_LABELS,
  MEETING_KIND_LABELS,
  NCR_SEVERITY_LABELS,
  NCR_STATUS_LABELS,
  OFFICIAL_REPORTS,
  REVISION_STATUS_LABELS,
  RISK_STATUS_LABELS,
  SAFETY_INCIDENT_STATUS_LABELS,
  SAFETY_INCIDENT_TYPE_LABELS,
  TEST_KIND_LABELS,
  VARIATION_CAUSE_LABELS,
  VARIATION_STATUS_LABELS,
  WEATHER_LABELS,
  calibrationState,
  canIssueOfficialReport,
  canViewContract,
  canViewLetters,
  componentDelayDays,
  componentStatusText,
  daysFrom,
  officialDate,
  officialDocNo,
  officialPeriod,
  officialPeriodWords,
  officialReportNo,
  officialSummary,
  sectorLocation,
  type BillStage,
  type CalibrationResult,
  type DesignSubmissionStatus,
  type OfficialBlockDto,
  type OfficialChapterDto,
  type OfficialFactDto,
  type OfficialIssueDto,
  type OfficialReportDto,
  type OfficialReportKind,
  type ProgressReportDto,
  type ProjectContractDto,
  type ReportColumnDto,
  type ReportRowDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AttachmentsService } from '../common/attachments.service';
import { progressRollup } from '../common/progress';
import { dateOnly, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ReportsService } from '../reports/reports.service';
import { plannedProgress } from '../dashboard/dashboard.service';
import { ContractsService } from '../contracts/contracts.service';
import { StageBillingService } from '../stage-billing/stage-billing.service';
import { CorrespondenceService } from '../correspondence/correspondence.service';
import { IssueOfficialReportDto, OfficialReportQuery } from './official-reports.dto';

const Dec = Prisma.Decimal;
const DAY_PHOTOS = 12;
/** Rows in the next period's plan, the earliest due first */
const NEXT_ROWS = 40;

type Col = ReportColumnDto;
const col = (key: string, label: string, kind: Col['kind'] = 'text'): Col => ({ key, label, kind });
const num = (v: Prisma.Decimal | string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
const table = (columns: Col[], rows: ReportRowDto[], empty: string, extra: { title?: string; note?: string; total?: ReportRowDto } = {}): OfficialBlockDto => ({
  type: 'table',
  columns,
  rows,
  empty,
  ...extra,
});
const text = (paragraphs: string[], title?: string): OfficialBlockDto => ({ type: 'text', paragraphs, ...(title ? { title } : {}) });
const lines = (rows: { date: string; text: string }[]) => rows.map((r) => `${officialDate(r.date)}: ${r.text}`);
const join = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(' · ');

interface ActivityRow {
  id: string;
  name: string;
  unit: string;
  plannedQty: number;
  periodQty: number;
  cumulativeQty: number;
  pct: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  workElementId: string | null;
  leaf: boolean;
  lastWorkOn: string | null;
}

/**
 * Official progress reports (item 167, ARCHITECTURE "Official progress reports"): the daily, weekly and monthly reports a
 * contractor submits, as one `OfficialReportDto` the web draws and writes to PDF, Word and Excel. It reads the weekly /
 * monthly progress report (`ReportsService.progress`) for progress, crew, machines, material, hold-ups and photos, the
 * contract through `ContractsService`, the milestone grid through `StageBillingService` and letters through
 * `CorrespondenceService`, so each reader sees only what their role may; money is left out for those who may not see
 * the contract. Issuing keeps the report as it went (`OfficialReportIssue`), numbered and revised.
 */
@Injectable()
export class OfficialReportsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private attachments: AttachmentsService,
    private reports: ReportsService,
    private contracts: ContractsService,
    private stageBilling: StageBillingService,
    private correspondence: CorrespondenceService,
  ) {}

  /* ---------- register ---------- */

  private issueDto(r: { id: string; projectId: string; kind: OfficialReportKind; periodFrom: Date; periodTo: Date; reportNo: number | null; docNo: string; revision: number; issuedAt: Date; note: string | null; issuedBy: { fullName: string } }): OfficialIssueDto {
    return {
      id: r.id,
      projectId: r.projectId,
      kind: r.kind,
      from: dateOnly(r.periodFrom)!,
      to: dateOnly(r.periodTo)!,
      reportNo: r.reportNo,
      docNo: r.docNo,
      revision: r.revision,
      issuedAt: r.issuedAt.toISOString(),
      issuedByName: r.issuedBy.fullName,
      note: r.note,
    };
  }

  private issueSelect = { id: true, projectId: true, kind: true, periodFrom: true, periodTo: true, reportNo: true, docNo: true, revision: true, issuedAt: true, note: true, issuedBy: { select: { fullName: true } } } as const;

  /** Every issue of a project, the newest first. */
  async issues(user: RequestUser, projectId: string): Promise<OfficialIssueDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.officialReportIssue.findMany({ where: { organizationId: user.organizationId, projectId }, orderBy: [{ periodFrom: 'desc' }, { revision: 'desc' }], select: this.issueSelect, take: 500 });
    return rows.map((r) => this.issueDto(r));
  }

  /** An issued copy, exactly as it went. */
  async issued(user: RequestUser, id: string): Promise<OfficialReportDto> {
    const row = await this.prisma.officialReportIssue.findFirst({ where: { id, organizationId: user.organizationId }, select: { ...this.issueSelect, snapshot: true } });
    if (!row) throw new NotFoundException('That issued report was not found');
    await this.access.assertCanAccessProject(user, row.projectId);
    const snap = row.snapshot as unknown as OfficialReportDto;
    // A copy issued with money in it stays with those who see the contract.
    if (!canViewContract(user.roleKey) && snap.withMoney !== false) {
      throw new ForbiddenException('This issued copy has the contract’s figures in it; ask your project manager for it');
    }
    return { ...snap, issue: this.issueDto(row) };
  }

  /** Issue the period's report: it is kept as it is now, with the next revision of the period. */
  async issue(user: RequestUser, dto: IssueOfficialReportDto): Promise<OfficialReportDto> {
    if (!canIssueOfficialReport(user.roleKey)) throw new ForbiddenException('Only a project manager or management can issue a report to the client');
    const report = await this.build(user, dto);
    const last = await this.prisma.officialReportIssue.findFirst({ where: { projectId: dto.projectId, kind: dto.kind, periodFrom: parseDate(report.from) }, orderBy: { revision: 'desc' }, select: { revision: true } });
    const revision = last ? last.revision + 1 : 0;
    const row = await this.prisma.officialReportIssue.create({
      data: {
        organizationId: user.organizationId,
        projectId: dto.projectId,
        kind: dto.kind,
        periodFrom: parseDate(report.from),
        periodTo: parseDate(report.to),
        reportNo: report.reportNo,
        docNo: report.docNo,
        revision,
        note: dto.note?.trim() || null,
        snapshot: { ...report, issue: null } as unknown as Prisma.InputJsonValue,
        issuedById: user.id,
      },
      select: this.issueSelect,
    });
    return { ...report, issue: this.issueDto(row) };
  }

  /* ---------- the report ---------- */

  /** The report for the period holding `date`, from live data (with the period's latest issue, if any, for reference). */
  async build(user: RequestUser, q: OfficialReportQuery): Promise<OfficialReportDto> {
    await this.access.assertCanAccessProject(user, q.projectId);
    const today = todayIn();
    if (q.date > today) throw new BadRequestException('Choose a day up to today');
    const { from, to } = officialPeriod(q.kind, q.date);
    const asOf = to < today ? to : today;
    const seesMoney = canViewContract(user.roleKey);

    const [base, project, org, acts, lastWork, elements, contract, latest] = await Promise.all([
      this.reports.progress(user, { projectId: q.projectId, from, to }),
      this.prisma.project.findUniqueOrThrow({ where: { id: q.projectId }, select: { code: true, name: true, agreementNo: true, agreementDate: true, villages: true, floors: true, startDate: true, consultantName: true } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { name: true } }),
      this.prisma.activity.findMany({ where: { projectId: q.projectId }, select: { id: true, workElementId: true, parentActivityId: true, weightPct: true, plannedQty: true, boqItem: { select: { rate: true } }, _count: { select: { subActivities: true } } } }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId: q.projectId, status: 'APPROVED', date: { lte: parseDate(to) } }, _max: { date: true } }),
      this.prisma.workElement.findMany({ where: { projectId: q.projectId }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], select: { id: true, parentId: true, level: true, code: true, name: true, weightPct: true } }),
      seesMoney ? this.contracts.get(user, q.projectId) : Promise.resolve(null),
      this.prisma.officialReportIssue.findFirst({ where: { projectId: q.projectId, kind: q.kind, periodFrom: parseDate(from) }, orderBy: { revision: 'desc' }, select: this.issueSelect }),
    ]);

    // Activities with where they sit and their last day of work, and the breakdown's progress at both ends of the period.
    const actInfo = new Map(acts.map((a) => [a.id, a]));
    const lastOf = new Map(lastWork.map((l) => [l.activityId, dateOnly(l._max.date)]));
    const rows: ActivityRow[] = base.activities.map((a) => {
      const i = actInfo.get(a.id);
      return {
        id: a.id,
        name: a.name,
        unit: a.unit,
        plannedQty: Number(a.plannedQty),
        periodQty: Number(a.periodQty),
        cumulativeQty: Number(a.cumulativeQty),
        pct: a.pct,
        plannedStart: a.plannedStart,
        plannedEnd: a.plannedEnd,
        workElementId: i?.workElementId ?? null,
        leaf: !i || i._count.subActivities === 0,
        lastWorkOn: lastOf.get(a.id) ?? null,
      };
    });
    const rollAt = (exec: (r: ActivityRow) => number) =>
      progressRollup(
        acts.map((a) => {
          const r = rows.find((x) => x.id === a.id);
          return { id: a.id, plannedQty: a.plannedQty, rate: a.boqItem?.rate ?? null, executed: new Dec(r ? exec(r) : 0), workElementId: a.workElementId, parentActivityId: a.parentActivityId, weightPct: a.weightPct };
        }),
        elements,
      );
    const atEnd = rollAt((r) => r.cumulativeQty);
    const atStart = rollAt((r) => r.cumulativeQty - r.periodQty);
    const components = elements.filter((e) => e.parentId === null);
    const underComponent = (id: string) => {
      const ids = new Set([id, ...elements.filter((e) => e.parentId === id).map((e) => e.id)]);
      return rows.filter((r) => r.leaf && r.workElementId && ids.has(r.workElementId));
    };

    // Planned by the report date as the Projects screen reads it: the leaves, BOQ-weighted where linked (`plannedProgress`).
    const leafActs = acts.filter((a) => a._count.subActivities === 0);
    const plannedPct = plannedProgress(
      leafActs.map((a) => {
        const r = rows.find((x) => x.id === a.id);
        return { plannedQty: a.plannedQty.toString(), boqItemId: a.boqItem ? a.id : null, plannedStart: r?.plannedStart ?? null, plannedEnd: r?.plannedEnd ?? null };
      }),
      new Map(leafActs.filter((a) => a.boqItem).map((a) => [a.id, new Dec(a.boqItem!.rate)])),
      asOf,
    );
    const financialPct = contract?.revisedContractValue && Number(contract.revisedContractValue) > 0 ? await this.billedPct(q.projectId, to, Number(contract.revisedContractValue)) : null;

    // Header, numbers and signatures.
    const reportNo = officialReportNo(q.kind, project.startDate ? dateOnly(project.startDate) : null, from);
    const p = base.project;
    const header: OfficialFactDto[] = [
      { label: 'Name of work', value: p.name },
      { label: 'Client', value: p.clientName ?? '–' },
      { label: 'Consultant', value: p.consultantName ?? '–' },
      { label: 'Contractor', value: org.name },
      { label: 'LOA / work order no.', value: p.workOrderNo ?? '–' },
      { label: 'Agreement no.', value: project.agreementNo ? join(project.agreementNo, project.agreementDate ? `dated ${officialDate(dateOnly(project.agreementDate)!)}` : null) : '–' },
      { label: 'Location', value: p.location ?? '–' },
      { label: q.kind === 'DAILY' ? 'Date' : q.kind === 'WEEKLY' ? 'Week' : 'Month', value: officialPeriodWords(q.kind, from, to) },
      { label: 'Work started', value: p.startDate, kind: 'date' },
      { label: 'Report no.', value: reportNo === null ? '–' : String(reportNo) },
    ];

    const ctx: Ctx = { user, q, from, to, asOf, today, base, rows, atEnd, atStart, components, underComponent, plannedPct, financialPct, contract, seesMoney, project };
    const chapters = q.kind === 'DAILY' ? await this.daily(ctx, header) : q.kind === 'WEEKLY' ? await this.weekly(ctx) : await this.monthly(ctx);

    return {
      kind: q.kind,
      title: OFFICIAL_REPORTS[q.kind].title,
      reportNo,
      docNo: officialDocNo(p.code, q.kind, reportNo),
      issue: latest ? this.issueDto(latest) : null,
      period: officialPeriodWords(q.kind, from, to),
      from,
      to,
      generatedAt: new Date().toISOString(),
      organizationName: org.name,
      project: { id: p.id, code: p.code, name: p.name },
      header,
      chapters: chapters.map((c, i) => ({ ...c, title: `${i + 1}. ${c.title}` })),
      signatures: [
        { role: q.kind === 'DAILY' ? 'Prepared by (site engineer)' : 'Prepared by', name: ctx.preparedBy ?? null },
        { role: 'Checked by (project manager)', name: p.projectManagerName },
        { role: 'Received by (client / consultant)', name: p.consultantName ?? p.clientName },
      ],
      sources:
        q.kind === 'DAILY'
          ? 'From the day’s DPR and its work lines, quality records and the delay register.'
          : 'From approved progress, DPRs, machinery logs and measurements, attendance, the store register, quality, safety and the delay register' + (seesMoney ? ', with approved RA bills and the contract.' : '.'),
      withMoney: seesMoney,
    };
  }

  /** Approved RA bills up to the period's end against the revised contract, %. */
  private async billedPct(projectId: string, to: string, revised: number): Promise<number> {
    const s = await this.prisma.raBill.aggregate({ where: { projectId, status: 'APPROVED', billDate: { lte: parseDate(to) } }, _sum: { grossAmount: true } });
    return Math.round((Number(s._sum.grossAmount ?? 0) / revised) * 1000) / 10;
  }

  /* ---------- shared chapters ---------- */

  private headline(c: Ctx): OfficialBlockDto {
    return {
      type: 'figures',
      figures: [
        { label: 'Physical progress', value: c.base.physical.atEndPct, kind: 'pct', note: `from ${c.base.physical.atStartPct}% at the start` },
        { label: 'Planned by now', value: c.plannedPct, kind: 'pct', note: 'from the programme' },
        { label: 'Time elapsed', value: c.base.timeElapsedPct, kind: 'pct', note: 'of the contract period' },
        ...(c.seesMoney ? [{ label: 'Financial progress', value: c.financialPct, kind: 'pct' as const, note: 'approved bills against the revised contract' }] : []),
      ],
    };
  }

  private summary(c: Ctx, openNcrs: number): string {
    const late = c.components
      .map((e) => {
        const acts = c.underComponent(e.id);
        const plannedEnd = acts.map((a) => a.plannedEnd).filter((d): d is string => !!d).sort().pop() ?? null;
        const lastWorkOn = acts.map((a) => a.lastWorkOn).filter((d): d is string => !!d).sort().pop() ?? null;
        return { name: e.name, days: componentDelayDays({ plannedEnd, pct: c.atEnd.pct.get(e.id) ?? 0, lastWorkOn }, c.asOf) ?? 0, pct: c.atEnd.pct.get(e.id) ?? 0 };
      })
      .filter((x) => x.days > 0 && x.pct < 100)
      .sort((a, b) => b.days - a.days);
    const completed = c.components.filter((e) => (c.atEnd.pct.get(e.id) ?? 0) >= 100 && (c.atStart.pct.get(e.id) ?? 0) < 100).map((e) => e.name);
    return officialSummary({
      kind: c.q.kind,
      physicalPct: c.base.physical.atEndPct,
      physicalAtStartPct: c.base.physical.atStartPct,
      plannedPct: c.plannedPct,
      timeElapsedPct: c.base.timeElapsedPct,
      financialPct: c.financialPct,
      completed,
      late,
      delayDays: c.base.delays.reduce((m, d) => Math.max(m, d.daysInPeriod), 0),
      openNcrs,
      dprDays: c.base.dpr.approved,
      days: Math.min(c.base.dpr.days, daysFrom(c.from, c.asOf) + 1),
    });
  }

  /** Progress by component: its weight, where it stood at the start and the end, and its status in words. */
  private componentTable(c: Ctx): OfficialBlockDto | null {
    if (!c.components.length) return null;
    return table(
      [col('code', 'No.'), col('name', 'Component'), col('weight', 'Weight', 'pct'), col('start', 'At start', 'pct'), col('end', 'Progress', 'pct'), col('status', 'Current status')],
      c.components.map((e) => ({
        code: e.code,
        name: e.name,
        weight: num(e.weightPct),
        start: c.atStart.pct.get(e.id) ?? 0,
        end: c.atEnd.pct.get(e.id) ?? 0,
        status: componentStatusText(c.underComponent(e.id).map((a) => ({ name: a.name, pct: a.pct }))),
      })),
      'No components in the work breakdown',
      { title: 'Progress by component', note: 'Each component as weighted in the work breakdown; status from its activities as approved.' },
    );
  }

  /** The programme's activities: scope, this period, to date and %, under their component. */
  private componentOf(c: Ctx): Map<string, string> {
    const compOf = new Map<string, string>();
    for (const e of c.components) for (const a of c.underComponent(e.id)) compOf.set(a.id, e.name);
    return compOf;
  }

  private activityTable(c: Ctx, periodLabel: string): OfficialBlockDto {
    const compOf = this.componentOf(c);
    // Those worked, under way or due in the period; the rest stand in the component table (or are all shown without one).
    const all = c.rows.filter((r) => r.leaf);
    const active = all.filter((r) => r.periodQty > 0 || (r.pct > 0 && r.pct < 100) || (r.pct < 100 && !!r.plannedStart && !!r.plannedEnd && r.plannedStart <= c.to && r.plannedEnd >= c.from));
    const leaves = c.components.length || all.length > 60 ? active : all;
    return table(
      [col('n', 'No.', 'count'), ...(c.components.length ? [col('component', 'Component')] : []), col('name', 'Activity'), col('unit', 'Unit'), col('scope', 'Scope', 'qty'), col('period', periodLabel, 'qty'), col('done', 'To date', 'qty'), col('pct', '%', 'pct'), col('end', 'Planned finish', 'date')],
      leaves.map((a, i) => ({ n: i + 1, component: compOf.get(a.id) ?? '–', name: a.name, unit: a.unit, scope: a.plannedQty, period: a.periodQty || null, done: a.cumulativeQty, pct: a.pct, end: a.plannedEnd })),
      leaves === all ? 'No activities in the programme' : 'No activity worked, under way or due in this period',
      { title: 'Activities as per the approved programme', note: leaves === all ? undefined : `The ${leaves.length} of ${all.length} activities worked, under way or due in the period.` },
    );
  }

  /** Approved work in the period (or the day's DPR lines), entry by entry: where, what, how much, crew and machines. */
  private async siteLog(c: Ctx, statuses: ('APPROVED' | 'SUBMITTED')[]): Promise<{ block: OfficialBlockDto; photos: number }> {
    const entries = await this.prisma.progressEntry.findMany({
      where: { projectId: c.q.projectId, status: { in: statuses }, date: { gte: parseDate(c.from), lte: parseDate(c.to) } },
      orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 400,
      select: {
        date: true,
        quantity: true,
        remarks: true,
        location: true,
        chainageFrom: true,
        chainageTo: true,
        floor: true,
        village: true,
        manpowerCount: true,
        machineryUsed: true,
        activity: { select: { name: true, unit: true, plannedQty: true, workElement: { select: { name: true, parent: { select: { name: true } } } } } },
        pipeSegment: { select: { code: true } },
        _count: { select: { attachments: true } },
      },
    });
    const daily = c.q.kind === 'DAILY';
    return {
      photos: entries.reduce((s, e) => s + e._count.attachments, 0),
      block: table(
        [
          col('n', 'No.', 'count'),
          ...(daily ? [] : [col('date', 'Date', 'date')]),
          col('where', 'Component / location / chainage'),
          col('work', 'Work done'),
          col('unit', 'Unit'),
          ...(daily ? [] : [col('scope', 'Scope', 'qty')]),
          col('qty', 'Executed', 'qty'),
          col('crew', 'Manpower', 'count'),
          col('machines', 'Machinery'),
        ],
        entries.map((e, i) => {
          const comp = e.activity.workElement ? (e.activity.workElement.parent ? `${e.activity.workElement.parent.name} › ${e.activity.workElement.name}` : e.activity.workElement.name) : null;
          return {
            n: i + 1,
            date: dateOnly(e.date),
            where: join(comp, e.location || sectorLocation(e), e.pipeSegment ? `Segment ${e.pipeSegment.code}` : null) || '–',
            work: join(e.activity.name, e.remarks),
            unit: e.activity.unit,
            scope: num(e.activity.plannedQty),
            qty: num(e.quantity),
            crew: e.manpowerCount,
            machines: e.machineryUsed,
          };
        }),
        daily ? 'No work lines in the day’s report' : 'No approved work in this period',
        { title: daily ? 'Work done today' : 'Work done in the period' },
      ),
    };
  }

  /** Non-conformances raised in the period or still open at its end: the deviation, the remedy, who and when it closed. */
  private async observations(c: Ctx): Promise<{ block: OfficialBlockDto; open: number }> {
    const from = parseDate(c.from);
    const to = parseDate(c.to);
    const ncrs = await this.prisma.ncr.findMany({
      where: { projectId: c.q.projectId, raisedOn: { lte: to }, OR: [{ raisedOn: { gte: from } }, { closedAt: null }, { closedAt: { gte: from } }] },
      orderBy: [{ raisedOn: 'asc' }, { ncrNo: 'asc' }],
      take: 200,
      select: { ncrNo: true, raisedOn: true, title: true, description: true, location: true, severity: true, status: true, correctiveAction: true, dueDate: true, closedAt: true, raisedByClient: true, actionBy: { select: { fullName: true } }, activity: { select: { name: true } } },
    });
    const open = ncrs.filter((n) => !n.closedAt || n.closedAt > to).length;
    return {
      open,
      block: table(
        [col('no', 'NCR no.'), col('date', 'Raised on', 'date'), col('where', 'Location'), col('what', 'Observation / deviation'), col('action', 'Remedial measure / action'), col('who', 'Person responsible'), col('due', 'Target date', 'date'), col('closed', 'Closure date', 'date'), col('status', 'Status')],
        ncrs.map((n) => ({
          no: n.ncrNo,
          date: dateOnly(n.raisedOn),
          where: join(n.location, n.activity?.name) || '–',
          what: `${NCR_SEVERITY_LABELS[n.severity]}: ${join(n.title, n.raisedByClient ? 'raised by the client' : null)}`,
          action: n.correctiveAction,
          who: n.actionBy?.fullName ?? null,
          due: dateOnly(n.dueDate),
          closed: n.closedAt && n.closedAt <= new Date(to.getTime() + 86_399_999) ? dateOnly(n.closedAt) : null,
          status: NCR_STATUS_LABELS[n.status],
        })),
        'No observations or deviations open or raised in this period',
        { title: 'Observations and deviations' },
      ),
    };
  }

  private crewAndMachines(c: Ctx, title: string): OfficialBlockDto[] {
    const b = c.base;
    return [
      table([col('trade', 'Trade'), col('days', 'Man-days', 'count'), col('avg', 'Average a day', 'qty')], b.manpower.map((m) => ({ trade: m.category, days: m.manDays, avg: m.avgPerDay })), 'No attendance recorded', {
        title: `Manpower${title}`,
        note: `${b.attendanceDays} day${b.attendanceDays === 1 ? '' : 's'} with an attendance sheet`,
        total: b.manpower.length ? { trade: 'Total', days: b.manpower.reduce((s, m) => s + m.manDays, 0), avg: b.attendanceDays ? Math.round((b.manpower.reduce((s, m) => s + m.manDays, 0) / b.attendanceDays) * 10) / 10 : null } : undefined,
      }),
      table(
        [col('machine', 'Machine'), col('days', 'Days worked', 'count'), col('hours', 'Hours worked', 'qty'), col('idle', 'Idle hours', 'qty'), col('down', 'Breakdown hours', 'qty')],
        b.machinery.map((m) => ({ machine: `${m.code} ${m.name}`, days: m.days, hours: num(m.hours), idle: num(m.idleHours), down: num(m.breakdownHours) })),
        'No approved machinery logs',
        { title: `Machinery${title}` },
      ),
    ];
  }

  private materials(c: Ctx): OfficialBlockDto {
    return table([col('item', 'Material'), col('unit', 'Unit'), col('in', 'Received', 'qty'), col('out', 'Issued', 'qty')], c.base.materials.map((m) => ({ item: m.name, unit: m.unit, in: num(m.received), out: num(m.issued) })), 'No receipts or issues in the store register', {
      title: 'Material received and issued',
    });
  }

  private hindrances(c: Ctx): OfficialBlockDto[] {
    const b = c.base;
    return [
      table(
        [col('no', 'No.'), col('what', 'Hindrance / delay'), col('from', 'From', 'date'), col('to', 'To', 'date'), col('days', 'Days in period', 'days'), col('by', 'Attributable to'), col('eot', 'Extension claimed')],
        b.delays.map((d) => ({ no: d.riskNo, what: join(d.title, d.activityName), from: d.from, to: d.to, days: d.daysInPeriod, by: d.responsibleParty ? DELAY_PARTY_LABELS[d.responsibleParty] : null, eot: d.eotClaimed ? 'Yes' : 'No' })),
        'No delays recorded in this period',
        { title: 'Hindrances and delays' },
      ),
      ...(b.issues.length ? [text(lines(b.issues), 'Issues reported in the daily reports')] : []),
    ];
  }

  private safety(c: Ctx, extra: OfficialBlockDto[] = []): OfficialChapterDto {
    return { key: 'safety', title: 'Health, safety and environment', blocks: [...extra, c.base.safety.length ? text(lines(c.base.safety), 'Safety observations in the daily reports') : text(['No safety observations in approved daily reports.'])] };
  }

  private nextPlan(c: Ctx, title: string): OfficialChapterDto {
    const compOf = this.componentOf(c);
    // An activity with sub-activities takes no progress of its own, so its sub-activities stand for it.
    const leaf = new Set(c.rows.filter((r) => r.leaf).map((r) => r.id));
    const due = c.base.nextPeriod.filter((a) => leaf.has(a.activityId));
    return {
      key: 'next',
      title,
      blocks: [
        table(
          [...(c.components.length ? [col('component', 'Component')] : []), col('name', 'Activity'), col('unit', 'Unit'), col('balance', 'Balance', 'qty'), col('end', 'Planned finish', 'date')],
          [...due]
            .sort((a, b) => (a.plannedEnd ?? '9999').localeCompare(b.plannedEnd ?? '9999'))
            .slice(0, NEXT_ROWS)
            .map((a) => ({ component: compOf.get(a.activityId) ?? '–', name: a.name, unit: a.unit, balance: num(a.balanceQty), end: a.plannedEnd })),
          'No activities planned',
          due.length > NEXT_ROWS ? { note: `The ${NEXT_ROWS} due first of ${due.length} activities planned and not complete.` } : {},
        ),
      ],
    };
  }

  private photos(c: Ctx, photos: ProgressReportDto['photos'], empty = 'No photographs with approved progress in this period'): OfficialChapterDto {
    return { key: 'photos', title: 'Site photographs', blocks: [{ type: 'photos', photos, empty }] };
  }

  /* ---------- daily ---------- */

  private async daily(c: Ctx, header: OfficialFactDto[]): Promise<OfficialChapterDto[]> {
    const day = parseDate(c.from);
    const dpr = await this.prisma.dailyReport.findFirst({
      where: { projectId: c.q.projectId, date: day, status: { in: ['SUBMITTED', 'APPROVED'] } },
      select: {
        id: true,
        status: true,
        weather: true,
        siteCondition: true,
        manpower: true,
        machinery: true,
        materialReceived: true,
        workExecuted: true,
        testsConducted: true,
        safetyObservations: true,
        issues: true,
        nextDayPlan: true,
        submittedBy: { select: { fullName: true } },
        reviewedBy: { select: { fullName: true } },
      },
    });
    c.preparedBy = dpr?.submittedBy.fullName;
    header.push({ label: 'Weather', value: dpr?.weather ? join(WEATHER_LABELS[dpr.weather], dpr.siteCondition) : '–' });
    header.push({ label: 'Daily report', value: !dpr ? 'Not submitted' : dpr.status === 'APPROVED' ? `Approved${dpr.reviewedBy ? ` by ${dpr.reviewedBy.fullName}` : ''}` : 'Submitted, waiting for approval' });

    const [log, obs, tests, photoRows] = await Promise.all([
      this.siteLog(c, ['APPROVED', 'SUBMITTED']),
      this.observations(c),
      this.prisma.qualityTest.findMany({ where: { projectId: c.q.projectId, sampledOn: day }, orderBy: { testNo: 'asc' }, select: { testNo: true, title: true, kind: true, location: true, result: true } }),
      this.prisma.attachment.findMany({
        where: { mimeType: { startsWith: 'image/' }, OR: [...(dpr ? [{ dailyReportId: dpr.id }] : []), { progressEntry: { projectId: c.q.projectId, date: day, status: { in: ['APPROVED', 'SUBMITTED'] } } }] },
        orderBy: { createdAt: 'asc' },
        take: DAY_PHOTOS,
        omit: { data: true },
        include: { progressEntry: { select: { activity: { select: { name: true } }, location: true } } },
      }),
    ]);
    const crew = ((dpr?.manpower ?? []) as { category: string; count: number }[]).filter((m) => m && m.count > 0);
    const machines = ((dpr?.machinery ?? []) as { name: string; hours: number }[]).filter((m) => m && m.name);
    const chapters: OfficialChapterDto[] = [
      { key: 'work', title: 'Work done today', blocks: [log.block, ...(dpr?.workExecuted?.trim() ? [text([dpr.workExecuted.trim()], 'In the site engineer’s words')] : [])] },
      { key: 'observations', title: 'Observations and deviations', blocks: [obs.block, ...(dpr?.issues?.trim() ? [text([dpr.issues.trim()], 'Issues and hindrances')] : [])] },
      {
        key: 'resources',
        title: 'Manpower and machinery',
        blocks: [
          table([col('trade', 'Trade'), col('count', 'Head count', 'count')], crew.map((m) => ({ trade: m.category, count: m.count })), 'No manpower in the day’s report', {
            title: 'Manpower',
            total: crew.length ? { trade: 'Total', count: crew.reduce((s, m) => s + m.count, 0) } : undefined,
          }),
          table([col('name', 'Machine'), col('hours', 'Hours', 'qty')], machines.map((m) => ({ name: m.name, hours: m.hours })), 'No machinery in the day’s report', { title: 'Machinery' }),
        ],
      },
      {
        key: 'quality',
        title: 'Material and quality',
        blocks: [
          text([dpr?.materialReceived?.trim() || 'No material receipts noted.'], 'Material received'),
          table([col('no', 'Test no.'), col('test', 'Test'), col('kind', 'Kind'), col('where', 'Location'), col('result', 'Result')], tests.map((t) => ({ no: t.testNo, test: t.title, kind: TEST_KIND_LABELS[t.kind], where: t.location, result: t.result })), 'No samples taken today', {
            title: 'Tests sampled today',
          }),
          ...(dpr?.testsConducted?.trim() ? [text([dpr.testsConducted.trim()], 'Tests noted in the daily report')] : []),
        ],
      },
      { key: 'safety', title: 'Safety', blocks: [text([dpr?.safetyObservations?.trim() || 'No safety observations noted.'])] },
      { key: 'next', title: 'Plan for tomorrow', blocks: [text([dpr?.nextDayPlan?.trim() || 'Not noted.'])] },
      this.photos(
        c,
        photoRows.map((a) => ({ url: this.attachments.toDto(a).url, caption: join(a.progressEntry?.activity.name, a.progressEntry?.location) || 'Daily report' })),
        'No photographs with the day’s report',
      ),
    ];
    return chapters;
  }

  /* ---------- weekly ---------- */

  private async weekly(c: Ctx): Promise<OfficialChapterDto[]> {
    const [log, obs] = await Promise.all([this.siteLog(c, ['APPROVED']), this.observations(c)]);
    const comp = this.componentTable(c);
    return [
      { key: 'summary', title: 'Summary', blocks: [this.headline(c), text([c.base.narrative?.text ?? this.summary(c, obs.open)])] },
      { key: 'progress', title: 'Physical progress', blocks: [...(comp ? [comp] : []), this.activityTable(c, 'This week')] },
      { key: 'work', title: 'Work done this week', blocks: [log.block] },
      { key: 'observations', title: 'Observations and deviations', blocks: [obs.block] },
      { key: 'resources', title: 'Manpower, machinery and material', blocks: [...this.crewAndMachines(c, ''), this.materials(c)] },
      { key: 'hindrances', title: 'Hindrances and delays', blocks: this.hindrances(c) },
      this.safety(c),
      this.nextPlan(c, 'Plan for next week'),
      this.photos(c, c.base.photos),
    ];
  }

  /* ---------- monthly ---------- */

  private async monthly(c: Ctx): Promise<OfficialChapterDto[]> {
    const pid = c.q.projectId;
    const from = parseDate(c.from);
    const to = parseDate(c.to);
    const inMonth = { gte: from, lte: to };
    const [obs, bills, variations, meetings, actions, letters, staff, equipment, tests, instruments, incidents, talks, permits, submissions, documents, previous, places] = await Promise.all([
      this.observations(c),
      c.seesMoney ? this.prisma.raBill.findMany({ where: { projectId: pid, status: 'APPROVED', billDate: { lte: to } }, orderBy: { billNo: 'asc' }, select: { billNo: true, isFinal: true, billDate: true, measuredUpTo: true, grossAmount: true, grossUpto: true, netPayable: true, stage: true, certifiedDate: true, paidDate: true } }) : [],
      this.prisma.variation.findMany({ where: { projectId: pid, status: { not: 'DRAFT' }, createdAt: { lte: new Date(to.getTime() + 86_400_000) } }, orderBy: { varNo: 'asc' }, select: { varNo: true, title: true, cause: true, status: true, claimedAmount: true, approvedAmount: true, submittedDate: true, decidedDate: true, clientRef: true } }),
      this.prisma.meeting.findMany({ where: { projectId: pid, heldOn: inMonth }, orderBy: { heldOn: 'asc' }, select: { meetingNo: true, title: true, kind: true, heldOn: true, venue: true, chairedBy: true, status: true, _count: { select: { actions: true } } } }),
      this.prisma.meetingAction.findMany({
        where: { projectId: pid, meeting: { heldOn: { lte: to } }, OR: [{ status: 'OPEN' }, { doneOn: inMonth }] },
        orderBy: [{ dueOn: 'asc' }],
        take: 100,
        select: { text: true, ownerName: true, dueOn: true, status: true, doneOn: true, meeting: { select: { meetingNo: true, heldOn: true } } },
      }),
      canViewLetters(c.user.roleKey) ? this.correspondence.list(c.user, { projectId: pid, from: c.from, to: c.to, sortBy: 'letterDate', sortOrder: 'asc', page: 1, pageSize: 200 }) : null,
      this.prisma.employee.findMany({
        where: { projectId: pid, OR: [{ joinedOn: null }, { joinedOn: { lte: to } }], AND: [{ OR: [{ leftOn: null }, { leftOn: { gte: from } }] }], isActive: true },
        orderBy: [{ designation: 'asc' }, { fullName: 'asc' }],
        select: { fullName: true, designation: true, department: true, joinedOn: true, phone: true },
      }),
      this.prisma.equipment.findMany({ where: { projectId: pid, isActive: true }, orderBy: { code: 'asc' }, select: { code: true, name: true, category: true, ownership: true, registrationNo: true } }),
      this.prisma.qualityTest.findMany({ where: { projectId: pid, sampledOn: inMonth }, select: { kind: true, result: true } }),
      this.prisma.qaInstrument.findMany({ where: { OR: [{ projectId: pid }, { lab: { projectId: pid } }] }, orderBy: { name: 'asc' }, select: { name: true, serialNo: true, range: true, certificateNo: true, lastCalibratedOn: true, nextDueOn: true, intervalDays: true, lastResult: true, active: true } }),
      this.prisma.safetyIncident.findMany({ where: { projectId: pid, date: inMonth }, orderBy: { date: 'asc' }, select: { incidentNo: true, date: true, type: true, location: true, description: true, injuredCount: true, daysLost: true, status: true } }),
      this.prisma.toolboxTalk.aggregate({ where: { projectId: pid, date: inMonth }, _count: { _all: true }, _sum: { attendeeCount: true } }),
      this.prisma.workPermit.count({ where: { projectId: pid, createdAt: { gte: from, lt: new Date(to.getTime() + 86_400_000) } } }),
      this.prisma.designSubmission.findMany({ where: { projectId: pid, status: { not: 'DRAFT' } }, orderBy: { submissionNo: 'asc' }, take: 200, select: { submissionNo: true, title: true, toParty: true, status: true, revision: true, replyBy: true } }),
      this.prisma.document.findMany({ where: { projectId: pid, kind: 'DRAWING' }, select: { discipline: true, currentRevision: { select: { status: true } } } }),
      this.prisma.officialReportIssue.findMany({ where: { projectId: pid, kind: 'MONTHLY', periodFrom: { lt: from } }, orderBy: [{ periodFrom: 'asc' }, { revision: 'asc' }], select: this.issueSelect }),
      this.places(c),
    ]);
    const comp = this.componentTable(c);
    const k = c.contract;

    const chapters: OfficialChapterDto[] = [];
    chapters.push({ key: 'details', title: 'Project details', blocks: [{ type: 'facts', facts: this.projectFacts(c) }] });
    chapters.push({ key: 'summary', title: 'Executive summary', blocks: [this.headline(c), text([this.summary(c, obs.open)])] });
    if (previous.length) {
      chapters.push({
        key: 'previous',
        title: 'Previous monthly reports',
        blocks: [table([col('no', 'MPR no.', 'count'), col('month', 'Month'), col('rev', 'Revision', 'count'), col('date', 'Submitted on', 'date'), col('by', 'Issued by')], previous.map((r) => ({ no: r.reportNo, month: officialPeriodWords('MONTHLY', dateOnly(r.periodFrom)!, dateOnly(r.periodTo)!), rev: r.revision, date: dateOnly(r.issuedAt), by: r.issuedBy.fullName })), '')],
      });
    }
    chapters.push({ key: 'schedule', title: 'Progress against the programme', blocks: [this.delayTable(c)] });
    chapters.push({ key: 'progress', title: 'Physical progress', blocks: [...(comp ? [comp] : []), this.activityTable(c, 'This month'), ...places] });
    if (c.seesMoney) {
      const milestones = await this.milestones(c);
      if (milestones) chapters.push(milestones);
      const billedUpto = bills.length ? Number(bills[bills.length - 1].grossUpto) : 0;
      chapters.push({
        key: 'financial',
        title: 'Financial progress',
        blocks: [
          {
            type: 'facts',
            facts: [
              { label: 'Contract value', value: k?.contractValue ?? null, kind: 'money' },
              { label: 'Approved variations', value: k?.approvedVariations ?? null, kind: 'money' },
              { label: 'Revised contract value', value: k?.revisedContractValue ?? null, kind: 'money' },
              { label: 'Billed to date (approved)', value: Math.round(billedUpto * 100) / 100, kind: 'money' },
              { label: 'Financial progress', value: c.financialPct, kind: 'pct' },
            ],
          },
          table(
            [col('no', 'RA bill'), col('date', 'Bill date', 'date'), col('upto', 'Measured up to', 'date'), col('gross', 'This bill', 'money'), col('cum', 'Up to this bill', 'money'), col('net', 'Net payable', 'money'), col('stage', 'Stage'), col('cert', 'Certified on', 'date'), col('paid', 'Paid on', 'date')],
            bills.map((b) => ({ no: `${b.isFinal ? 'Final ' : 'RA-'}${b.billNo}`, date: dateOnly(b.billDate), upto: dateOnly(b.measuredUpTo), gross: num(b.grossAmount), cum: num(b.grossUpto), net: num(b.netPayable), stage: BILL_STAGE_LABELS[b.stage as BillStage], cert: dateOnly(b.certifiedDate), paid: dateOnly(b.paidDate) })),
            'No approved RA bills yet',
            { title: 'RA bills', total: bills.length ? { no: 'Total', gross: bills.reduce((s, b) => s + Number(b.grossAmount), 0), net: bills.reduce((s, b) => s + Number(b.netPayable), 0) } : undefined },
          ),
        ],
      });
    }
    chapters.push({
      key: 'variations',
      title: 'Extensions and variations',
      blocks: [
        table(
          [col('no', 'No.'), col('title', 'Variation'), col('cause', 'Cause'), ...(c.seesMoney ? [col('claimed', 'Claimed', 'money'), col('approved', 'Approved', 'money')] : []), col('status', 'Status'), col('ref', 'Client’s reference'), col('date', 'Decided on', 'date')],
          variations.map((v) => ({ no: `V-${v.varNo}`, title: v.title, cause: VARIATION_CAUSE_LABELS[v.cause], claimed: num(v.claimedAmount), approved: num(v.approvedAmount), status: VARIATION_STATUS_LABELS[v.status], ref: v.clientRef, date: dateOnly(v.decidedDate) })),
          'No variations sent to the client',
          { title: 'Variations' },
        ),
        ...(k
          ? [
              table(
                [col('no', 'No.'), col('what', 'Delay'), col('from', 'From', 'date'), col('to', 'To', 'date'), col('lost', 'Days lost', 'days'), col('by', 'Attributable to'), col('claimed', 'Extension claimed'), col('granted', 'Days granted', 'days')],
                k.extensions.map((x) => ({ no: x.riskNo, what: x.title, from: x.delayStart, to: x.delayEnd, lost: x.daysLost, by: x.responsibleParty ? DELAY_PARTY_LABELS[x.responsibleParty] : null, claimed: x.eotClaimed ? 'Yes' : 'No', granted: x.eotGrantedDays })),
                'No extensions of time claimed',
                { title: 'Extensions of time', note: k.extensionDays && k.revisedEndDate ? `${k.extensionDays} days granted; revised completion ${officialDate(k.revisedEndDate)}.` : undefined },
              ),
            ]
          : []),
      ],
    });
    chapters.push({
      key: 'drawings',
      title: 'Status of drawings and designs',
      blocks: [this.drawingTable(documents), table([col('no', 'Submission'), col('title', 'Title'), col('to', 'Sent to'), col('rev', 'Revision', 'count'), col('status', 'Status'), col('reply', 'Reply due', 'date')], submissions.map((s) => ({ no: s.submissionNo, title: s.title, to: s.toParty, rev: s.revision, status: DESIGN_SUBMISSION_STATUS_LABELS[s.status as DesignSubmissionStatus] ?? s.status, reply: s.replyBy ? dateOnly(s.replyBy) : null })), 'No design submissions', { title: 'Design submissions' })],
    });
    chapters.push({
      key: 'meetings',
      title: 'Meetings and their actions',
      blocks: [
        table([col('no', 'No.'), col('date', 'Date', 'date'), col('venue', 'Venue'), col('subject', 'Subject'), col('kind', 'Kind'), col('chair', 'Chaired by'), col('actions', 'Actions', 'count')], meetings.map((m) => ({ no: m.meetingNo, date: dateOnly(m.heldOn), venue: m.venue, subject: m.title, kind: MEETING_KIND_LABELS[m.kind], chair: m.chairedBy, actions: m._count.actions })), 'No meetings this month', { title: 'Meetings held this month' }),
        table([col('mom', 'Minutes'), col('action', 'Action'), col('owner', 'By'), col('due', 'Due', 'date'), col('status', 'Status'), col('done', 'Done on', 'date')], actions.map((a) => ({ mom: `${a.meeting.meetingNo} (${officialDate(dateOnly(a.meeting.heldOn)!)})`, action: a.text, owner: a.ownerName, due: dateOnly(a.dueOn), status: MEETING_ACTION_STATUS_LABELS[a.status], done: dateOnly(a.doneOn) })), 'No actions open', {
          title: 'Compliance of the minutes',
          note: 'Actions still open, and those closed this month.',
        }),
      ],
    });
    if (letters) {
      chapters.push({
        key: 'letters',
        title: 'Correspondence this month',
        blocks: [table([col('date', 'Date', 'date'), col('no', 'Letter no.'), col('dir', 'In / out'), col('party', 'From / to'), col('subject', 'Subject')], letters.items.map((l) => ({ date: l.letterDate, no: l.letterNo ?? l.theirRef, dir: LETTER_DIRECTION_LABELS[l.direction], party: l.party, subject: l.subject })), 'No letters this month')],
      });
    }
    chapters.push({
      key: 'staff',
      title: 'Staff, manpower and machinery',
      blocks: [
        table([col('n', 'No.', 'count'), col('name', 'Name'), col('designation', 'Position'), col('dept', 'Department'), col('joined', 'At site since', 'date')], staff.map((s, i) => ({ n: i + 1, name: s.fullName, designation: s.designation, dept: s.department, joined: dateOnly(s.joinedOn) })), 'No staff posted to the project', {
          title: 'Contractor’s staff at site',
        }),
        ...this.crewAndMachines(c, ' this month'),
        table([col('code', 'Code'), col('name', 'Machine'), col('category', 'Kind'), col('own', 'Owned or hired'), col('reg', 'Registration')], equipment.map((e) => ({ code: e.code, name: e.name, category: e.category, own: EQUIPMENT_OWNERSHIP_LABELS[e.ownership], reg: e.registrationNo })), 'No machines posted to the project', {
          title: 'Machinery at site',
        }),
        this.materials(c),
      ],
    });
    const byKind = new Map<string, { n: number; pass: number; fail: number }>();
    for (const t of tests) {
      const r = byKind.get(t.kind) ?? { n: 0, pass: 0, fail: 0 };
      r.n += 1;
      if (t.result === 'PASS') r.pass += 1;
      if (t.result === 'FAIL') r.fail += 1;
      byKind.set(t.kind, r);
    }
    chapters.push({
      key: 'quality',
      title: 'Quality control',
      blocks: [
        table([col('kind', 'Material / test'), col('n', 'Tests', 'count'), col('pass', 'Passed', 'count'), col('fail', 'Failed', 'count')], [...byKind.entries()].map(([kind, r]) => ({ kind: TEST_KIND_LABELS[kind as keyof typeof TEST_KIND_LABELS] ?? kind, n: r.n, pass: r.pass, fail: r.fail })), 'No samples taken this month', {
          title: 'Tests this month',
          total: tests.length ? { kind: 'Total', n: tests.length, pass: [...byKind.values()].reduce((s, r) => s + r.pass, 0), fail: [...byKind.values()].reduce((s, r) => s + r.fail, 0) } : undefined,
        }),
        table(
          [col('name', 'Instrument'), col('serial', 'ID / serial no.'), col('range', 'Range / least count'), col('cert', 'Certificate no.'), col('on', 'Calibrated on', 'date'), col('next', 'Next calibration', 'date'), col('state', 'Condition')],
          instruments.map((i) => {
            const s = calibrationState({ lastCalibratedOn: dateOnly(i.lastCalibratedOn), nextDueOn: dateOnly(i.nextDueOn), intervalDays: i.intervalDays, lastResult: (i.lastResult as CalibrationResult | null) ?? null, active: i.active }, c.asOf);
            return { name: i.name, serial: i.serialNo, range: i.range, cert: i.certificateNo, on: dateOnly(i.lastCalibratedOn), next: s.dueOn, state: CALIBRATION_STATE_LABELS[s.state] };
          }),
          'No instruments in the calibration register',
          { title: 'Calibration of instruments' },
        ),
        obs.block,
      ],
    });
    chapters.push(
      this.safety(c, [
        {
          type: 'facts',
          facts: [
            { label: 'Incidents', value: String(incidents.length) },
            { label: 'Man-days lost', value: String(incidents.reduce((s, i) => s + (i.daysLost ?? 0), 0)) },
            { label: 'Toolbox talks', value: `${talks._count._all}${talks._sum.attendeeCount ? ` (${talks._sum.attendeeCount} attended)` : ''}` },
            { label: 'Work permits issued', value: String(permits) },
          ],
        },
        table([col('no', 'No.'), col('date', 'Date', 'date'), col('type', 'Type'), col('where', 'Location'), col('what', 'What happened'), col('injured', 'Injured', 'count'), col('status', 'Status')], incidents.map((i) => ({ no: i.incidentNo, date: dateOnly(i.date), type: SAFETY_INCIDENT_TYPE_LABELS[i.type], where: i.location, what: i.description, injured: i.injuredCount, status: SAFETY_INCIDENT_STATUS_LABELS[i.status] })), 'No incidents this month', {
          title: 'Incidents',
        }),
      ]),
    );
    chapters.push({ key: 'hindrances', title: 'Hindrances and delays', blocks: this.hindrances(c) });
    chapters.push({
      key: 'risks',
      title: 'Risks foreseen',
      blocks: [
        table([col('no', 'No.'), col('risk', 'Risk'), col('score', 'Score', 'count'), col('mitigation', 'Mitigation'), col('owner', 'Owner'), col('due', 'Due', 'date')], c.base.risks.map((r) => ({ no: r.riskNo, risk: r.title, score: r.score, mitigation: r.mitigation, owner: r.ownerName, due: r.dueDate })), 'No open risks of note', {
          note: `Open risks scored 8 or more; status as in the register (${RISK_STATUS_LABELS.OPEN.toLowerCase()} or monitoring).`,
        }),
      ],
    });
    chapters.push(this.nextPlan(c, 'Plan for next month'));
    chapters.push(this.photos(c, c.base.photos));
    return chapters;
  }

  private projectFacts(c: Ctx): OfficialFactDto[] {
    const p = c.base.project;
    const k = c.contract;
    const months = p.startDate && p.endDate ? Math.round(daysFrom(p.startDate, p.endDate) / 30.4) : null;
    return [
      { label: 'Name of work', value: p.name },
      { label: 'Project code', value: p.code },
      { label: 'Client', value: p.clientName ?? '–' },
      { label: 'Consultant', value: p.consultantName ?? '–' },
      { label: 'Contractor', value: c.base.organizationName },
      { label: 'LOA / work order no.', value: p.workOrderNo ?? '–' },
      { label: 'Agreement no.', value: c.project.agreementNo ? join(c.project.agreementNo, c.project.agreementDate ? `dated ${officialDate(dateOnly(c.project.agreementDate)!)}` : null) : '–' },
      ...(k ? [{ label: 'Cost of work', value: k.contractValue, kind: 'money' as const }, { label: 'Revised cost (with approved variations)', value: k.revisedContractValue, kind: 'money' as const }] : []),
      { label: 'Start date', value: p.startDate, kind: 'date' },
      { label: 'Completion as per agreement', value: p.endDate, kind: 'date' },
      ...(k ? [{ label: 'Extension granted', value: k.extensionDays && k.revisedEndDate ? `${k.extensionDays} days, to ${officialDate(k.revisedEndDate)}` : 'None' }] : []),
      { label: 'Contract period', value: months === null ? '–' : `${months} months` },
      { label: 'Location', value: p.location ?? '–' },
      { label: 'Project manager', value: p.projectManagerName ?? '–' },
    ];
  }

  /** Each component (or activity without a breakdown) against the programme: planned dates, progress and delay. */
  private delayTable(c: Ctx): OfficialBlockDto {
    const items = c.components.length
      ? c.components.map((e) => {
          const acts = c.underComponent(e.id);
          const starts = acts.map((a) => a.plannedStart).filter((d): d is string => !!d).sort();
          const ends = acts.map((a) => a.plannedEnd).filter((d): d is string => !!d).sort();
          const last = acts.map((a) => a.lastWorkOn).filter((d): d is string => !!d).sort();
          return { name: e.name, start: starts[0] ?? null, end: ends[ends.length - 1] ?? null, pct: c.atEnd.pct.get(e.id) ?? 0, last: last[last.length - 1] ?? null };
        })
      : c.rows.filter((r) => r.leaf).map((r) => ({ name: r.name, start: r.plannedStart, end: r.plannedEnd, pct: r.pct, last: r.lastWorkOn }));
    return table(
      [col('name', c.components.length ? 'Component' : 'Activity'), col('start', 'Planned start', 'date'), col('end', 'Planned completion', 'date'), col('pct', 'Progress', 'pct'), col('actual', 'Actual completion', 'date'), col('delay', `Delay as on ${officialDate(c.asOf)}`, 'days'), col('state', 'Status')],
      items.map((i) => {
        const days = componentDelayDays({ plannedEnd: i.end, pct: i.pct, lastWorkOn: i.last }, c.asOf);
        const state = i.pct >= 100 ? (days ? 'Completed late' : 'Completed') : !i.end ? 'Not programmed' : days ? 'Behind' : i.pct > 0 ? 'In progress' : 'Not started';
        return { name: i.name, start: i.start, end: i.end, pct: i.pct, actual: i.pct >= 100 ? i.last : null, delay: days, state };
      }),
      'Nothing in the programme',
      { note: 'Planned dates from the programme; a finished component’s delay is to its last day of work, an unfinished one’s to the report date.' },
    );
  }

  /** The tender's milestone grid (stage billing) for the report's month: the target and what is billed, by component. */
  private async milestones(c: Ctx): Promise<OfficialChapterDto | null> {
    const b = await this.stageBilling.breakup(c.user, c.q.projectId);
    const i = b.months.indexOf(c.from);
    if (i < 0 || !b.grid.some((r) => r.targets[i] !== null)) return null;
    const rows = b.grid.map((r) => {
      const target = r.targets[i];
      const actual = r.actual[i];
      return { code: r.code, name: r.name, month: i + 1, target, actual, slip: target !== null && actual !== null ? Math.round((target - actual) * 10) / 10 : null };
    });
    return {
      key: 'milestones',
      title: 'Progress against milestones',
      blocks: [
        table([col('code', 'No.'), col('name', 'Component'), col('target', `Target by month ${i + 1}`, 'pct'), col('actual', 'Achieved', 'pct'), col('slip', 'Slippage (points)', 'pct')], rows, 'No milestone targets', {
          note: 'Cumulative financial targets from the contract’s milestone grid, against what approved bills cover by the month’s end.',
        }),
      ],
    };
  }

  private drawingTable(docs: { discipline: keyof typeof DOCUMENT_DISCIPLINE_LABELS; currentRevision: { status: keyof typeof REVISION_STATUS_LABELS } | null }[]): OfficialBlockDto {
    const by = new Map<string, { total: number; approved: number; review: number; construction: number }>();
    for (const d of docs) {
      const r = by.get(d.discipline) ?? { total: 0, approved: 0, review: 0, construction: 0 };
      r.total += 1;
      const s = d.currentRevision?.status;
      if (s === 'APPROVED' || s === 'APPROVED_WITH_COMMENTS') r.approved += 1;
      if (s === 'FOR_APPROVAL') r.review += 1;
      if (s === 'FOR_CONSTRUCTION' || s === 'AS_BUILT') r.construction += 1;
      by.set(d.discipline, r);
    }
    const rows = [...by.entries()].map(([k, r]) => ({ discipline: DOCUMENT_DISCIPLINE_LABELS[k as keyof typeof DOCUMENT_DISCIPLINE_LABELS], total: r.total, review: r.review, approved: r.approved, construction: r.construction }));
    return table([col('discipline', 'Discipline'), col('total', 'Drawings', 'count'), col('review', 'Sent for approval', 'count'), col('approved', 'Approved', 'count'), col('construction', 'Good for construction', 'count')], rows, 'No drawings in the register', {
      title: 'Drawing register',
      total: rows.length ? { discipline: 'Total', total: docs.length, review: rows.reduce((s, r) => s + r.review, 0), approved: rows.reduce((s, r) => s + r.approved, 0), construction: rows.reduce((s, r) => s + r.construction, 0) } : undefined,
    });
  }

  /** Work by village or floor (water supply and buildings): this month and to date, activity by activity. */
  private async places(c: Ctx): Promise<OfficialBlockDto[]> {
    const field = c.project.villages.length ? 'village' : c.project.floors.length ? 'floor' : null;
    if (!field) return [];
    const rows = await this.prisma.progressEntry.groupBy({
      by: [field, 'activityId'],
      where: { projectId: c.q.projectId, status: 'APPROVED', date: { lte: parseDate(c.to) }, [field]: { not: null } },
      _sum: { quantity: true },
    });
    const month = await this.prisma.progressEntry.groupBy({
      by: [field, 'activityId'],
      where: { projectId: c.q.projectId, status: 'APPROVED', date: { gte: parseDate(c.from), lte: parseDate(c.to) }, [field]: { not: null } },
      _sum: { quantity: true },
    });
    const key = (r: { activityId: string } & Record<string, unknown>) => `${String(r[field])}|${r.activityId}`;
    const monthOf = new Map(month.map((r) => [key(r as never), Number(r._sum.quantity ?? 0)]));
    const act = new Map(c.rows.map((r) => [r.id, r]));
    const order = field === 'village' ? c.project.villages : c.project.floors;
    const out = rows
      .map((r) => ({ place: String((r as Record<string, unknown>)[field]), a: act.get(r.activityId), done: Number(r._sum.quantity ?? 0), month: monthOf.get(key(r as never)) ?? 0 }))
      .filter((r) => r.a)
      .sort((x, y) => order.indexOf(x.place) - order.indexOf(y.place) || x.a!.name.localeCompare(y.a!.name));
    if (!out.length) return [];
    return [
      table([col('place', field === 'village' ? 'Village' : 'Floor'), col('activity', 'Activity'), col('unit', 'Unit'), col('prev', 'Up to last month', 'qty'), col('month', 'This month', 'qty'), col('done', 'Cumulative', 'qty')], out.map((r) => ({ place: r.place, activity: r.a!.name, unit: r.a!.unit, prev: r.done - r.month, month: r.month || null, done: r.done })), 'No work recorded by place', {
        title: field === 'village' ? 'Village-wise progress' : 'Floor-wise progress',
      }),
    ];
  }
}

interface Ctx {
  user: RequestUser;
  q: OfficialReportQuery;
  from: string;
  to: string;
  asOf: string;
  today: string;
  base: ProgressReportDto;
  rows: ActivityRow[];
  atEnd: ReturnType<typeof progressRollup>;
  atStart: ReturnType<typeof progressRollup>;
  components: { id: string; parentId: string | null; code: string; name: string; weightPct: Prisma.Decimal | null }[];
  underComponent: (id: string) => ActivityRow[];
  plannedPct: number | null;
  financialPct: number | null;
  contract: ProjectContractDto | null;
  seesMoney: boolean;
  project: { agreementNo: string | null; agreementDate: Date | null; villages: string[]; floors: string[] };
  preparedBy?: string;
}


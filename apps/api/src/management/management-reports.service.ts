import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  APPROVAL_OLD_DAYS,
  BILL_STAGE_LABELS,
  COST_HEADS,
  COST_HEAD_LABELS,
  HEALTH_LABELS,
  MANAGEMENT_REPORTS,
  MAX_PAGE_SIZE,
  MSME_CATEGORY_LABELS,
  PORTFOLIO_SCHEDULE_LABELS,
  STOCK_AGEING_BUCKETS,
  SUBMISSION_TYPE_LABELS,
  submissionHref,
  byVertical,
  NO_VERTICAL,
  type AgeingDto,
  type BillStage,
  type ManagementReportDto,
  type ManagementReportKey,
  type ProjectSummary,
  type ReportColumnDto,
  type ReportColumnKind,
  type ReportFigureDto,
  type ReportRowDto,
  type ReportSectionDto,
  type SubmissionType,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, formatDay, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { StockService } from '../stock/stock.service';
import { CostService, total, type Acc } from '../cost/cost.service';
import { ManagementService } from './management.service';
import { MastersService } from '../masters/masters.service';
import { ManagementReportQuery } from './management.dto';
import { approvalAgeing, billedMarginPct, byUrgency, daysBetween, financialYearStart, misCommentary, monthName, monthSpan, monthsBetween, pctOf, type MisFlow } from './management-rules';

const N = (v: Prisma.Decimal | number | string | null | undefined) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const col = (key: string, label: string, kind: ReportColumnKind = 'money'): ReportColumnDto => ({ key, label, kind });
const projectCol = col('project', 'Project', 'text');
const projectHref = (id: string) => `/management/projects/${id}`;
const projectCell = (p: { code: string; name: string }) => `${p.code} · ${p.name}`;
const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const key = (s: string) => s.trim().toLowerCase();

/** A total row: the sum of each money, quantity or count column, the label in the first. */
function totalRow(columns: ReportColumnDto[], rows: ReportRowDto[], label = 'Total'): ReportRowDto {
  const out: ReportRowDto = {};
  columns.forEach((c, i) => {
    if (i === 0) out[c.key] = label;
    else if (c.kind === 'money' || c.kind === 'qty' || c.kind === 'count') out[c.key] = r2(rows.reduce((s, r) => s + (typeof r[c.key] === 'number' ? (r[c.key] as number) : 0), 0));
    else out[c.key] = null;
  });
  return out;
}

const section = (s: Omit<ReportSectionDto, 'total'> & { totals?: boolean | string }): ReportSectionDto => {
  const { totals, ...rest } = s;
  return totals && s.rows.length > 1 ? { ...rest, total: totalRow(s.columns, s.rows, typeof totals === 'string' ? totals : 'Total') } : rest;
};

/** Reports read by project from their own services, which a vertical does not narrow. */
const OWN_SCOPE = new Set<ManagementReportKey>(['receivables', 'payables', 'stock']);

/**
 * The MIS's "where each project stands" added up by vertical (`byVertical`), put after it; left out when every project
 * is in one vertical.
 */
function withVerticals(sections: ReportSectionDto[], projects: ProjectSummary[], verticals: { code: string; name: string }[]): ReportSectionDto[] {
  const standing = sections.find((s) => s.key === 'standing');
  if (!standing) return sections;
  const verticalOf = new Map(projects.map((p) => [projectHref(p.id), p.verticalCode]));
  const groups = byVertical(standing.rows, (r) => verticalOf.get(r._href ?? '') ?? null, verticals);
  if (groups.length < 2) return sections;
  const keys = ['contract', 'workDone', 'billed', 'unbilled', 'outstanding', 'cost', 'committed'];
  const columns = [col('vertical', 'Vertical', 'text'), col('projects', 'Projects', 'count'), ...standing.columns.filter((c) => keys.includes(c.key))];
  const rows = groups.map((g) => ({
    vertical: g.name,
    projects: g.rows.length,
    ...Object.fromEntries(keys.map((k) => [k, r2(g.rows.reduce((s, r) => s + N(r[k] as number), 0))])),
  }));
  const at = sections.indexOf(standing) + 1;
  return [...sections.slice(0, at), section({ key: 'verticals', title: 'By vertical', note: 'The projects’ figures today, added up by the vertical each belongs to.', columns, rows, totals: true }), ...sections.slice(at)];
}

interface Period {
  from: string | null;
  to: string;
  label: string;
}

/**
 * Management reports (ARCHITECTURE "Management dashboard and reports"): each one a set of figures and tables built from
 * the modules' own services and records, for the screen, print and Excel alike. The period comes from the query: a
 * month, a range (the financial year so far by default) or today.
 */
@Injectable()
export class ManagementReportsService {
  constructor(
    private prisma: PrismaService,
    private management: ManagementService,
    private cost: CostService,
    private receivables: ReceivablesService,
    private payables: PayablesService,
    private stock: StockService,
    private lifecycle: SubmissionLifecycleService,
    private masters: MastersService,
  ) {}

  async report(user: RequestUser, key: ManagementReportKey, q: ManagementReportQuery): Promise<ManagementReportDto> {
    this.management.assertSee(user);
    const info = MANAGEMENT_REPORTS[key];
    const today = todayIn();
    const period = this.period(info.period, q, today);
    const projects = await this.management.contractProjects(user, q.projectId, q.vertical);
    if (q.projectId && !projects.length && key !== 'stock') throw new BadRequestException('Choose one of your contract projects, or every project');
    const projectName = q.projectId ? (projects[0] ? projectCell(projects[0]) : null) : null;
    const verticals = await this.masters.entriesFor(user.organizationId, 'vertical');
    const verticalName = q.vertical ? (q.vertical === NO_VERTICAL ? 'No vertical' : (verticals.find((v) => v.code === q.vertical)?.name ?? q.vertical)) : null;
    const body = await this.build(key, user, projects, period, today, q.projectId);
    // Receivables, payables and stock read their own services by project, so a vertical does not narrow them.
    const notes = q.vertical && !q.projectId && OWN_SCOPE.has(key) ? [...body.notes, 'This report covers every vertical: it is read by project, not by vertical.'] : body.notes;
    // The monthly MIS over every vertical adds up where each vertical stands (item 167).
    const sections = key === 'mis' && !q.vertical && !q.projectId ? withVerticals(body.sections, projects, verticals) : body.sections;
    return { key, title: info.title, period: period.label, from: period.from, to: period.to, projectName, verticalName: OWN_SCOPE.has(key) ? null : verticalName, generatedAt: new Date().toISOString(), ...body, notes, sections };
  }

  private period(kind: 'month' | 'range' | 'asOf', q: ManagementReportQuery, today: string): Period {
    if (kind === 'asOf') return { from: null, to: today, label: `As of ${formatDay(today)}` };
    if (kind === 'month') {
      const month = q.month ?? today.slice(0, 7);
      const { from, to } = monthSpan(month);
      return { from, to: to > today ? today : to, label: monthName(month) };
    }
    const from = q.from ?? financialYearStart(today);
    const to = q.to ?? today;
    if (from > to) throw new BadRequestException('The period starts after it ends');
    return { from, to, label: `${formatDay(from)} to ${formatDay(to)}` };
  }

  private build(key: ManagementReportKey, user: RequestUser, projects: ProjectSummary[], period: Period, today: string, projectId?: string) {
    switch (key) {
      case 'mis':
        return this.mis(user, projects, period, today);
      case 'profit-loss':
        return this.profitLoss(user, projects, period, today);
      case 'wip':
        return this.wip(user, projects, today);
      case 'receivables':
        return this.receivablesReport(user, projectId);
      case 'payables':
        return this.payablesReport(user, projectId);
      case 'procurement':
        return this.procurement(user, projects, period);
      case 'labour':
        return this.labour(user, projects, period);
      case 'stock':
        return this.stockReport(user, projectId);
      case 'approvals':
        return this.approvals(user, projects, today);
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Monthly MIS

  private async mis(user: RequestUser, projects: ProjectSummary[], period: Period, today: string) {
    const ids = projects.map((p) => p.id);
    const fy = financialYearStart(period.to);
    const range = (from: string) => ({ gte: parseDate(from), lte: parseDate(period.to) });
    // The month before, to its same days while this month is still running, for the commentary.
    const prev = new Date(`${period.from!}T00:00:00Z`);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    const prevSpan = monthSpan(prev.toISOString().slice(0, 7));
    const running = period.to < monthSpan(period.from!.slice(0, 7)).to;
    const prevTo = running ? `${prevSpan.from.slice(0, 8)}${period.to.slice(8)}` : prevSpan.to;
    const [month, year, before, { rows }] = await Promise.all([
      this.cost.compute(user.organizationId, ids, range(period.from!)),
      this.cost.compute(user.organizationId, ids, range(fy)),
      this.cost.compute(user.organizationId, ids, { gte: parseDate(prevSpan.from), lte: parseDate(prevTo < prevSpan.to ? prevTo : prevSpan.to) }),
      this.management.build(user, projects, today),
    ]);
    const flow = (acc: Map<string, Acc>) => {
      const columns = [projectCol, col('workDone', 'Work done'), col('measured', 'Measured'), col('billed', 'Billed'), col('received', 'Received'), col('cost', 'Cost'), col('margin', 'Billed less cost')];
      const out = projects.map((p) => {
        const a = acc.get(p.id)!;
        const cost = N(total(a.heads));
        // A lump-sum or EPC contract is valued by its stages, not its BOQ rates, so its work done in a period is left blank.
        return { _href: projectHref(p.id), project: projectCell(p), workDone: p.contractModel === 'ITEM_RATE' ? r2(N(a.executed)) : null, measured: r2(N(a.measured)), billed: r2(N(a.billed)), received: r2(N(a.cashIn)), cost: r2(cost), margin: r2(N(a.billed) - cost) };
      });
      return { columns, rows: out };
    };
    const inMonth = flow(month);
    const inYear = flow(year);
    const standing = {
      columns: [
        projectCol,
        col('health', 'Health', 'text'),
        col('done', 'Done', 'pct'),
        col('schedule', 'Schedule', 'text'),
        col('contract', 'Contract value'),
        col('workDone', 'Work done'),
        col('billed', 'Billed'),
        col('unbilled', 'Not billed'),
        col('outstanding', 'Client owes'),
        col('cost', 'Cost'),
        col('committed', 'Committed'),
        col('marginPct', 'Margin', 'pct'),
      ],
      rows: rows.map((r) => ({
        _href: projectHref(r.projectId),
        project: projectCell(r),
        health: HEALTH_LABELS[r.health],
        done: r.schedule.done,
        schedule: r.schedule.daysLate ? `${PORTFOLIO_SCHEDULE_LABELS[r.schedule.state]}, ${r.schedule.daysLate} days` : PORTFOLIO_SCHEDULE_LABELS[r.schedule.state],
        contract: r.money.contractValue === null ? null : N(r.money.contractValue),
        workDone: N(r.money.workDone),
        billed: N(r.money.billed),
        unbilled: N(r.money.unbilled),
        outstanding: N(r.money.outstanding),
        cost: N(r.money.cost),
        committed: N(r.money.committed),
        marginPct: r.money.marginPct,
      })),
    };
    const attention = rows.flatMap((r) => r.reasons.map((x) => ({ _href: projectHref(r.projectId), project: projectCell(r), level: x.level === 'act' ? 'Act now' : 'Watch', what: x.text })));
    attention.sort((a, b) => (a.level === b.level ? 0 : a.level === 'Act now' ? -1 : 1));
    const sum = (rs: ReportRowDto[], k: string) => r2(rs.reduce((s, r) => s + N(r[k] as number), 0));
    const figures: ReportFigureDto[] = [
      { label: 'Work done in the month', value: sum(inMonth.rows, 'workDone'), kind: 'money', note: 'Item-rate contracts, at BOQ rates' },
      { label: 'Billed in the month', value: sum(inMonth.rows, 'billed'), kind: 'money' },
      { label: 'Received in the month', value: sum(inMonth.rows, 'received'), kind: 'money' },
      { label: 'Cost in the month', value: sum(inMonth.rows, 'cost'), kind: 'money' },
      { label: 'Work done not billed', value: sum(standing.rows, 'unbilled'), kind: 'money', note: 'Today, all projects' },
      { label: 'Clients owe', value: sum(standing.rows, 'outstanding'), kind: 'money', note: 'Today, with GST' },
    ];
    const flowOf = (acc: Map<string, Acc>): MisFlow =>
      projects.reduce(
        (f, p) => {
          const x = acc.get(p.id)!;
          return { workDone: f.workDone + (p.contractModel === 'ITEM_RATE' ? N(x.executed) : 0), billed: f.billed + N(x.billed), received: f.received + N(x.cashIn), cost: f.cost + N(total(x.heads)) };
        },
        { workDone: 0, billed: 0, received: 0, cost: 0 },
      );
    const most = (key: 'unbilled' | 'outstanding') => {
      const top = [...rows].sort((a, b) => N(b.money[key]) - N(a.money[key]))[0];
      return top ? { name: top.name, amount: N(top.money[key]) } : null;
    };
    const acting = rows.filter((r) => r.reasons.some((x) => x.level === 'act'));
    const prevName = new Date(`${prevSpan.from}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
    const commentary = misCommentary({
      month: period.label,
      previous: running ? `the same days of ${prevName}` : prevName,
      projects: projects.length,
      inMonth: flowOf(month),
      before: flowOf(before),
      year: { billed: N(sum(inYear.rows, 'billed')), cost: N(sum(inYear.rows, 'cost')) },
      unbilled: N(sum(standing.rows, 'unbilled')),
      outstanding: N(sum(standing.rows, 'outstanding')),
      mostUnbilled: most('unbilled'),
      mostOwed: most('outstanding'),
      actNow: acting.map((r) => ({ name: r.name, text: [...r.reasons].filter((x) => x.level === 'act').sort(byUrgency)[0].text })),
      watch: rows.filter((r) => !acting.includes(r) && r.reasons.length).length,
    });
    return {
      commentary,
      figures,
      sections: [
        section({ key: 'month', title: `In ${period.label}`, note: 'Work done is approved progress at BOQ rates (blank for a lump-sum or EPC contract, which is valued by its stages); measured is approved measurement sheets; billed is RA bills dated in the month before GST.', ...inMonth, totals: true }),
        section({ key: 'year', title: `Financial year to ${formatDay(period.to)}`, note: `From ${formatDay(fy)}.`, ...inYear, totals: true }),
        section({ key: 'standing', title: 'Where each project stands today', ...standing, totals: true }),
        section({ key: 'attention', title: 'Needs action', columns: [projectCol, col('level', 'Level', 'text'), col('what', 'What', 'text')], rows: attention, empty: 'Nothing needs action.' }),
      ],
      notes: [
        'Cost is approved site expenses, material issued at the item rate, machinery at its hire rate or hire bill, labour man-days at the trade rate and approved subcontractor bills.',
        'Where each project stands is as of the day the report is made. Work done there counts each BOQ item at the larger of its approved progress and its approved measurement, so supply items count once measured.',
        'Margin is work done less cost to date. Committed is approved purchase and work orders still open, less what is billed against them.',
      ],
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Profit and loss

  private async profitLoss(user: RequestUser, projects: ProjectSummary[], period: Period, today: string) {
    const ids = projects.map((p) => p.id);
    const date = { gte: parseDate(period.from!), lte: parseDate(period.to) };
    const [acc, { rows: standing }, bills] = await Promise.all([
      this.cost.compute(user.organizationId, ids, date),
      this.management.build(user, projects, today),
      this.prisma.raBill.findMany({ where: { organizationId: user.organizationId, projectId: { in: ids }, status: 'APPROVED', billDate: date }, select: { billDate: true, grossAmount: true, pvAmount: true } }),
    ]);
    const headCols = COST_HEADS.map((h) => col(h, COST_HEAD_LABELS[h]));
    const columns = [projectCol, col('billed', 'Billed'), ...headCols, col('cost', 'Total cost'), col('margin', 'Gross margin'), col('marginPct', 'Margin', 'pct')];
    const rows = projects.map((p) => {
      const a = acc.get(p.id)!;
      const cost = N(total(a.heads));
      const billed = N(a.billed);
      return {
        _href: projectHref(p.id),
        project: projectCell(p),
        billed: r2(billed),
        ...Object.fromEntries(COST_HEADS.map((h) => [h, r2(N(a.heads[h]))])),
        cost: r2(cost),
        margin: r2(billed - cost),
        marginPct: billedMarginPct(billed, cost),
      } as ReportRowDto;
    });
    const t = totalRow(columns, rows);
    t.marginPct = billedMarginPct(N(t.billed as number), N(t.cost as number));

    const months = monthsBetween(period.from!, period.to);
    const monthRows = months.map((month) => {
      const billed = bills.filter((b) => dateOnly(b.billDate)!.startsWith(month)).reduce((s, b) => s + N(b.grossAmount) + N(b.pvAmount), 0);
      const heads = Object.fromEntries(COST_HEADS.map((h) => [h, r2([...acc.values()].reduce((s, a) => s + N(a.months.get(month)?.heads[h]), 0))]));
      const cost = COST_HEADS.reduce((s, h) => s + N(heads[h]), 0);
      return { month: monthName(month), billed: r2(billed), ...heads, cost: r2(cost), margin: r2(billed - cost), marginPct: billedMarginPct(billed, cost) } as ReportRowDto;
    });
    const monthCols = [col('month', 'Month', 'text'), ...columns.slice(1)];

    const forecast = {
      columns: [projectCol, col('contract', 'Contract value'), col('workDone', 'Work done'), col('cost', 'Cost to date'), col('committed', 'Committed'), col('budget', 'Cost budget'), col('forecastCost', 'Forecast cost'), col('forecastMargin', 'Forecast margin')],
      rows: standing.map((r) => ({
        _href: projectHref(r.projectId),
        project: projectCell(r),
        contract: r.money.contractValue === null ? null : N(r.money.contractValue),
        workDone: N(r.money.workDone),
        cost: N(r.money.cost),
        committed: N(r.money.committed),
        budget: r.money.budget === null ? null : N(r.money.budget),
        forecastCost: r.money.forecastCost === null ? null : N(r.money.forecastCost),
        forecastMargin: r.money.forecastMargin === null ? null : N(r.money.forecastMargin),
      })),
    };
    return {
      figures: [
        { label: 'Billed', value: t.billed, kind: 'money' as const },
        { label: 'Cost', value: t.cost, kind: 'money' as const },
        { label: 'Gross margin', value: t.margin, kind: 'money' as const },
        { label: 'Margin', value: t.marginPct, kind: 'pct' as const, note: 'Of billed' },
      ],
      sections: [
        { key: 'projects', title: 'By project', columns, rows, ...(rows.length > 1 ? { total: t } : {}) },
        section({ key: 'months', title: 'By month', columns: monthCols, rows: monthRows, totals: true }),
        section({ key: 'forecast', title: 'To date and at completion', note: 'Forecast cost is cost to date plus the budget for the work still to do; left out without a cost budget or below 5% done.', ...forecast, totals: true }),
      ],
      notes: [
        'Billed is approved RA bills dated in the period: work value plus price variation, before GST.',
        'Cost by head is as the Project cost page counts it, dated in the period. Material bought and not yet issued is not cost until it is issued.',
      ],
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Work in progress

  private async wip(user: RequestUser, projects: ProjectSummary[], today: string) {
    const ids = projects.map((p) => p.id);
    const [{ rows }, bills, sheets] = await Promise.all([
      this.management.build(user, projects, today),
      this.prisma.raBill.findMany({ where: { organizationId: user.organizationId, projectId: { in: ids }, status: 'APPROVED', stage: { not: 'PAID' } }, select: { projectId: true, stage: true, grossAmount: true, pvAmount: true } }),
      this.prisma.measurementSheet.findMany({ where: { organizationId: user.organizationId, projectId: { in: ids }, status: 'APPROVED', raBillId: null }, select: { projectId: true, date: true, totalQty: true, boqItem: { select: { rate: true } } } }),
    ]);
    const byStage = (projectId: string, stage: BillStage) => r2(bills.filter((b) => b.projectId === projectId && b.stage === stage).reduce((s, b) => s + N(b.grossAmount) + N(b.pvAmount), 0));
    const columns = [
      projectCol,
      col('workDone', 'Work done'),
      col('billed', 'Billed'),
      col('unbilled', 'Not billed'),
      col('billedUpTo', 'Last bill up to', 'date'),
      col('days', 'Days since', 'days'),
      col('measuredOpen', 'Measured, in no bill'),
      col('notSent', 'Bill not sent'),
      col('sent', 'Awaiting certificate'),
      col('certified', 'Certified, not paid'),
    ];
    const out = rows.map((r) => {
      const open = sheets.filter((s) => s.projectId === r.projectId);
      return {
        _href: projectHref(r.projectId),
        project: projectCell(r),
        workDone: N(r.money.workDone),
        billed: N(r.money.billed),
        unbilled: N(r.money.unbilled),
        billedUpTo: r.money.billedUpTo,
        days: r.money.unbilledDays,
        measuredOpen: r2(open.reduce((s, x) => s + N(x.totalQty) * N(x.boqItem.rate), 0)),
        notSent: byStage(r.projectId, 'NOT_SENT'),
        sent: byStage(r.projectId, 'SENT'),
        certified: byStage(r.projectId, 'CERTIFIED'),
      };
    });
    const t = totalRow(columns, out);
    return {
      figures: [
        { label: 'Work done not billed', value: t.unbilled, kind: 'money' as const },
        { label: 'Measured, in no bill', value: t.measuredOpen, kind: 'money' as const },
        { label: 'Bills not sent', value: t.notSent, kind: 'money' as const },
        { label: 'Awaiting certificate', value: t.sent, kind: 'money' as const },
        { label: 'Certified, not paid', value: t.certified, kind: 'money' as const },
      ],
      sections: [{ key: 'projects', title: 'By project', note: 'Work value before GST. Not billed is work done less billed; days are since the last bill’s “measured up to” date, or the start.', columns, rows: out, ...(out.length > 1 ? { total: t } : {}) }],
      notes: [
        'Work done counts each BOQ item at the larger of its approved progress and its approved measurement, at the BOQ rate.',
        'Measured, in no bill is approved measurement sheets not yet taken into an RA bill: the next bill’s ready money.',
        'A bill moves from not sent to awaiting certificate when it is marked sent, and to certified when the client certifies it.',
      ],
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Receivables and payables

  private async receivablesReport(user: RequestUser, projectId?: string) {
    const r = await this.receivables.summary(user, projectId ? { projectId } : {});
    const ageCols = [col('d0', '0–30 days'), col('d31', '31–60 days'), col('d61', '61–90 days'), col('d90', 'Over 90 days')];
    const ageing = (a: AgeingDto) => ({ d0: N(a.current), d31: N(a.days31to60), d61: N(a.days61to90), d90: N(a.over90) });
    const clientCols = [col('client', 'Client', 'text'), col('billed', 'Billed'), col('received', 'Received'), col('deducted', 'Deducted'), col('outstanding', 'Outstanding'), ...ageCols, col('retention', 'Retention held')];
    const clients = r.clients.filter((c) => N(c.billed) > 0 || N(c.notSent) > 0).map((c) => ({ client: c.clientName, billed: N(c.billed), received: N(c.received), deducted: N(c.deducted), outstanding: N(c.outstanding), ...ageing(c.ageing), retention: N(c.retentionHeld) }));
    const projectCols = [projectCol, col('client', 'Client', 'text'), col('outstanding', 'Outstanding'), ...ageCols, col('notSent', 'Not yet sent'), col('retention', 'Retention held'), col('release', 'Retention due', 'date')];
    const projects = r.projects
      .filter((p) => N(p.billed) > 0 || N(p.notSent) > 0)
      .map((p) => ({ _href: projectHref(p.projectId), project: projectCell({ code: p.projectCode, name: p.projectName }), client: p.clientName, outstanding: N(p.outstanding), ...ageing(p.ageing), notSent: N(p.notSent), retention: N(p.retentionHeld), release: p.retentionReleaseDate }));
    const billCols = [col('bill', 'Bill', 'text'), projectCol, col('stage', 'Stage', 'text'), col('sent', 'Sent', 'date'), col('invoice', 'Invoice'), col('settled', 'Settled'), col('outstanding', 'Outstanding'), col('days', 'Days', 'days')];
    const bills = r.openBills.map((b) => ({ _href: `/bills/${b.billId}`, bill: b.billLabel, project: projectCell({ code: b.projectCode, name: b.projectName }), stage: BILL_STAGE_LABELS[b.stage], sent: b.sentDate, invoice: N(b.invoiceAmount), settled: N(b.settledAmount), outstanding: N(b.outstanding), days: b.daysOutstanding }));
    return {
      figures: [
        { label: 'Outstanding', value: N(r.totals.outstanding), kind: 'money' as const, note: 'Sent bills with GST, less what is settled' },
        { label: 'Over 90 days', value: N(r.totals.ageing.over90), kind: 'money' as const },
        { label: 'Not yet sent', value: N(r.totals.notSent), kind: 'money' as const },
        { label: 'Retention held', value: N(r.totals.retentionHeld), kind: 'money' as const },
      ],
      sections: [
        section({ key: 'clients', title: 'By client', columns: clientCols, rows: clients, totals: true, empty: 'No bills sent yet.' }),
        section({ key: 'projects', title: 'By project', columns: projectCols, rows: projects, totals: true, empty: 'No bills sent yet.' }),
        section({ key: 'bills', title: 'Open bills, the oldest first', columns: billCols, rows: bills, totals: true, empty: 'Every sent bill is settled.' }),
      ],
      notes: ['Age is counted from the day a bill was sent. Settled is received plus what the client deducted (TDS, retention, security deposit and the rest).'],
    };
  }

  private async payablesReport(user: RequestUser, projectId?: string) {
    const p = await this.payables.summary(user, projectId ? { projectId } : {});
    const ageCols = [col('notDue', 'Not due'), col('d1', '1–30 days'), col('d31', '31–60 days'), col('d61', '61–90 days'), col('d90', 'Over 90 days')];
    const ageing = (a: { notDue: string; days1to30: string; days31to60: string; days61to90: string; over90: string }) => ({ notDue: N(a.notDue), d1: N(a.days1to30), d31: N(a.days31to60), d61: N(a.days61to90), d90: N(a.over90) });
    const vendorCols = [col('vendor', 'Vendor', 'text'), col('msme', 'MSME', 'text'), col('bills', 'Open bills', 'count'), col('outstanding', 'Outstanding'), ...ageCols];
    const vendors = p.vendors
      .filter((v) => N(v.outstanding) > 0)
      .sort((a, b) => N(b.outstanding) - N(a.outstanding))
      .map((v) => ({ vendor: v.vendorName, msme: v.vendorMsme ? MSME_CATEGORY_LABELS[v.vendorMsme] : null, bills: v.openBills, outstanding: N(v.outstanding), ...ageing(v.ageing) }));
    const projectCols = [projectCol, col('outstanding', 'Outstanding'), col('overdue', 'Overdue'), ...ageCols, col('retention', 'Retention held')];
    const projects = p.projects
      .filter((x) => N(x.outstanding) > 0)
      .map((x) => ({ _href: projectHref(x.projectId), project: projectCell({ code: x.projectCode, name: x.projectName }), outstanding: N(x.outstanding), overdue: N(x.overdue), ...ageing(x.ageing), retention: N(x.retentionHeld) }));
    const overdue = p.openBills.filter((b) => b.daysToDue < 0);
    const billCols = [col('bill', 'Bill', 'text'), col('vendor', 'Vendor', 'text'), projectCol, col('due', 'Due', 'date'), col('outstanding', 'Outstanding'), col('days', 'Days overdue', 'days'), col('msme', 'MSME at risk', 'text')];
    const bills = overdue.map((b) => ({ bill: b.billLabel, vendor: b.vendorName, project: projectCell({ code: b.projectCode, name: b.projectName }), due: b.dueDate, outstanding: N(b.outstanding), days: -b.daysToDue, msme: b.msmeFlag ? 'Yes' : null }));
    return {
      figures: [
        { label: 'Outstanding', value: N(p.totals.outstanding), kind: 'money' as const },
        { label: 'Overdue', value: N(p.totals.overdue), kind: 'money' as const },
        { label: 'Due in 7 days', value: N(p.totals.dueSoon), kind: 'money' as const },
        { label: 'MSME at risk', value: N(p.totals.msmeAtRisk), kind: 'money' as const, note: 'Micro and small enterprises due within 7 days or overdue' },
      ],
      sections: [
        section({ key: 'vendors', title: 'By vendor', columns: vendorCols, rows: vendors, totals: true, empty: 'Nothing is owed.' }),
        section({ key: 'projects', title: 'By project', columns: projectCols, rows: projects, totals: true, empty: 'Nothing is owed.' }),
        section({ key: 'overdue', title: 'Overdue bills, the longest first', columns: billCols, rows: bills, totals: true, empty: 'No bill is overdue.' }),
      ],
      notes: ['Approved vendor and subcontractor bills with GST, less what is paid and deducted. Age is days past the due date.'],
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Procurement

  private async procurement(user: RequestUser, projects: ProjectSummary[], period: Period) {
    const ids = projects.map((p) => p.id);
    const pos = await this.prisma.purchaseOrder.findMany({
      where: { organizationId: user.organizationId, projectId: { in: ids }, status: 'APPROVED', poDate: { gte: parseDate(period.from!), lte: parseDate(period.to) } },
      select: {
        id: true,
        projectId: true,
        poDate: true,
        deliveryBy: true,
        subtotal: true,
        freight: true,
        closedAt: true,
        vendor: { select: { id: true, name: true } },
        lines: { select: { itemName: true, unit: true, quantity: true, rate: true, amount: true } },
        materialRequest: { select: { reviewedAt: true, submittedAt: true } },
        stockEntries: { where: { type: 'RECEIPT' }, select: { date: true }, orderBy: { date: 'asc' }, take: 1 },
        vendorBills: { where: { status: 'APPROVED' }, select: { subtotal: true, freight: true } },
      },
    });
    const value = (o: (typeof pos)[number]) => N(o.subtotal) + N(o.freight);
    const toOrder = (o: (typeof pos)[number]) => {
      const at = o.materialRequest?.reviewedAt ?? o.materialRequest?.submittedAt;
      return at ? Math.max(0, daysBetween(at.toISOString().slice(0, 10), dateOnly(o.poDate)!)) : null;
    };
    const toReceive = (o: (typeof pos)[number]) => (o.stockEntries[0] ? Math.max(0, daysBetween(dateOnly(o.poDate)!, dateOnly(o.stockEntries[0].date)!)) : null);
    const onTime = (os: typeof pos) => {
      const judged = os.filter((o) => o.deliveryBy && o.stockEntries[0]);
      return judged.length ? r1((judged.filter((o) => o.stockEntries[0].date <= o.deliveryBy!).length / judged.length) * 100) : null;
    };

    const vendors = new Map<string, { name: string; orders: typeof pos }>();
    for (const o of pos) {
      const v = vendors.get(o.vendor.id) ?? { name: o.vendor.name, orders: [] };
      v.orders.push(o);
      vendors.set(o.vendor.id, v);
    }
    const vendorCols = [col('vendor', 'Vendor', 'text'), col('orders', 'Orders', 'count'), col('value', 'Ordered'), col('billed', 'Billed'), col('days', 'Days to receive', 'days'), col('onTime', 'On time', 'pct')];
    const vendorRows = [...vendors.values()]
      .map((v) => ({
        vendor: v.name,
        orders: v.orders.length,
        value: r2(v.orders.reduce((s, o) => s + value(o), 0)),
        billed: r2(v.orders.reduce((s, o) => s + o.vendorBills.reduce((t, b) => t + N(b.subtotal) + N(b.freight), 0), 0)),
        days: avg(v.orders.map(toReceive).filter((d): d is number => d !== null)),
        onTime: onTime(v.orders),
      }))
      .sort((a, b) => b.value - a.value);

    const items = new Map<string, { name: string; unit: string; qty: number; amount: number; min: number; max: number; orders: Set<string>; projects: Set<string> }>();
    for (const o of pos)
      for (const l of o.lines) {
        const k = `${key(l.itemName)}|${key(l.unit)}`;
        const it = items.get(k) ?? { name: l.itemName.trim(), unit: l.unit, qty: 0, amount: 0, min: Infinity, max: 0, orders: new Set(), projects: new Set() };
        it.qty += N(l.quantity);
        it.amount += N(l.amount);
        it.min = Math.min(it.min, N(l.rate));
        it.max = Math.max(it.max, N(l.rate));
        it.orders.add(o.id);
        it.projects.add(o.projectId);
        items.set(k, it);
      }
    const itemCols = [col('item', 'Material', 'text'), col('unit', 'Unit', 'text'), col('qty', 'Quantity', 'qty'), col('avgRate', 'Average rate'), col('minRate', 'Lowest rate'), col('maxRate', 'Highest rate'), col('spread', 'Spread', 'pct'), col('value', 'Ordered'), col('projects', 'Projects', 'count')];
    const itemRows = [...items.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 50)
      .map((i) => ({ item: i.name, unit: i.unit, qty: r2(i.qty), avgRate: i.qty > 0 ? r2(i.amount / i.qty) : null, minRate: r2(i.min), maxRate: r2(i.max), spread: i.min > 0 ? r1(((i.max - i.min) / i.min) * 100) : null, value: r2(i.amount), projects: i.projects.size }));

    const projectCols = [projectCol, col('orders', 'Orders', 'count'), col('value', 'Ordered'), col('open', 'Still to bill'), col('toOrder', 'Days to order', 'days'), col('toReceive', 'Days to receive', 'days'), col('onTime', 'On time', 'pct')];
    const projectRows = projects
      .map((p) => {
        const os = pos.filter((o) => o.projectId === p.id);
        return {
          _href: projectHref(p.id),
          project: projectCell(p),
          orders: os.length,
          value: r2(os.reduce((s, o) => s + value(o), 0)),
          open: r2(os.filter((o) => !o.closedAt).reduce((s, o) => s + Math.max(0, value(o) - o.vendorBills.reduce((t, b) => t + N(b.subtotal) + N(b.freight), 0)), 0)),
          toOrder: avg(os.map(toOrder).filter((d): d is number => d !== null)),
          toReceive: avg(os.map(toReceive).filter((d): d is number => d !== null)),
          onTime: onTime(os),
        };
      })
      .filter((r) => r.orders > 0);
    const total$ = r2(pos.reduce((s, o) => s + value(o), 0));
    return {
      figures: [
        { label: 'Ordered', value: total$, kind: 'money' as const, note: 'Approved purchase orders before GST' },
        { label: 'Orders', value: pos.length, kind: 'count' as const },
        { label: 'Vendors', value: vendors.size, kind: 'count' as const },
        { label: 'Days from request to order', value: avg(pos.map(toOrder).filter((d): d is number => d !== null)), kind: 'days' as const, note: 'Average' },
        { label: 'Days from order to receipt', value: avg(pos.map(toReceive).filter((d): d is number => d !== null)), kind: 'days' as const, note: 'Average, to the first GRN' },
        { label: 'Delivered on time', value: onTime(pos), kind: 'pct' as const, note: 'First GRN by the delivery date' },
      ],
      sections: [
        section({ key: 'vendors', title: 'By vendor', columns: vendorCols, rows: vendorRows, totals: true, empty: 'No orders in the period.' }),
        section({ key: 'materials', title: 'By material, the 50 largest', note: 'Spread is the highest rate paid over the lowest. Materials are matched by name and unit as typed on the order.', columns: itemCols, rows: itemRows, empty: 'No orders in the period.' }),
        section({ key: 'projects', title: 'By project', columns: projectCols, rows: projectRows, totals: true, empty: 'No orders in the period.' }),
      ],
      notes: [
        'Approved purchase orders dated in the period, before GST, freight included. Billed is approved vendor bills against them.',
        'Days to order run from the material request’s approval to the order; days to receive from the order to its first goods received note.',
      ],
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Labour and attendance

  private async labour(user: RequestUser, projects: ProjectSummary[], period: Period) {
    const ids = projects.map((p) => p.id);
    const date = { gte: parseDate(period.from!), lte: parseDate(period.to) };
    const [sheets, rates, acc] = await Promise.all([
      this.prisma.attendanceSheet.findMany({ where: { organizationId: user.organizationId, projectId: { in: ids }, date }, select: { projectId: true, date: true, lines: { select: { category: true, contractor: true, count: true } } } }),
      this.prisma.labourRate.findMany({ where: { organizationId: user.organizationId } }),
      this.cost.compute(user.organizationId, ids, date),
    ]);
    const rateOf = new Map(rates.map((r) => [key(r.category), N(r.dailyRate)]));
    const projectCols = [projectCol, col('days', 'Days recorded', 'count'), col('manDays', 'Man-days', 'count'), col('average', 'Average a day', 'qty'), col('peak', 'Peak day', 'count'), col('cost', 'Labour cost')];
    const projectRows = projects
      .map((p) => {
        const ss = sheets.filter((s) => s.projectId === p.id);
        const perDay = ss.map((s) => s.lines.reduce((t, l) => t + l.count, 0));
        const manDays = perDay.reduce((t, n) => t + n, 0);
        return { _href: projectHref(p.id), project: projectCell(p), days: ss.length, manDays, average: ss.length ? r1(manDays / ss.length) : null, peak: perDay.length ? Math.max(...perDay) : null, cost: r2(N(acc.get(p.id)!.heads.labour)) };
      })
      .filter((r) => r.days > 0 || r.cost > 0);
    const trades = new Map<string, { name: string; manDays: number }>();
    const contractors = new Map<string, { name: string; manDays: number; trades: Set<string> }>();
    for (const s of sheets)
      for (const l of s.lines) {
        const t = trades.get(key(l.category)) ?? { name: l.category.trim(), manDays: 0 };
        t.manDays += l.count;
        trades.set(key(l.category), t);
        const c = contractors.get(key(l.contractor)) ?? { name: l.contractor.trim(), manDays: 0, trades: new Set() };
        c.manDays += l.count;
        c.trades.add(l.category.trim());
        contractors.set(key(l.contractor), c);
      }
    const all = [...trades.values()].reduce((s, t) => s + t.manDays, 0);
    const tradeCols = [col('trade', 'Trade', 'text'), col('manDays', 'Man-days', 'count'), col('share', 'Share', 'pct'), col('rate', 'Daily rate'), col('value', 'At the daily rate')];
    const tradeRows = [...trades.entries()]
      .sort((a, b) => b[1].manDays - a[1].manDays)
      .map(([k, t]) => {
        const rate = rateOf.get(k) ?? null;
        return { trade: t.name, manDays: t.manDays, share: pctOf(t.manDays, all), rate, value: rate === null ? null : r2(rate * t.manDays) };
      });
    const contractorCols = [col('contractor', 'Contractor', 'text'), col('trades', 'Trades', 'text'), col('manDays', 'Man-days', 'count'), col('share', 'Share', 'pct')];
    const contractorRows = [...contractors.values()].sort((a, b) => b.manDays - a.manDays).map((c) => ({ contractor: c.name, trades: [...c.trades].join(', '), manDays: c.manDays, share: pctOf(c.manDays, all) }));
    const days = new Set(sheets.map((s) => dateOnly(s.date))).size;
    return {
      figures: [
        { label: 'Man-days', value: all, kind: 'count' as const },
        { label: 'Average on site a day', value: days ? r1(all / days) : null, kind: 'qty' as const, note: 'All projects, over the days with a muster' },
        { label: 'Labour cost', value: r2(projectRows.reduce((s, r) => s + r.cost, 0)), kind: 'money' as const },
        { label: 'Trades without a rate', value: tradeRows.filter((t) => t.rate === null).length, kind: 'count' as const, note: 'Set them on Project cost' },
      ],
      sections: [
        section({ key: 'projects', title: 'By project', columns: projectCols, rows: projectRows, totals: true, empty: 'No attendance in the period.' }),
        section({ key: 'trades', title: 'By trade', columns: tradeCols, rows: tradeRows, totals: true, empty: 'No attendance in the period.' }),
        section({ key: 'contractors', title: 'By contractor', columns: contractorCols, rows: contractorRows, totals: true, empty: 'No attendance in the period.' }),
      ],
      notes: [
        'Man-days are the daily labour musters (attendance sheets) in the period.',
        'Labour cost is as Project cost counts it: man-days at the trade’s daily rate, leaving out gangs of a subcontractor with a work order on the project, whose cost is in their bills.',
      ],
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Stock

  private async stockReport(user: RequestUser, projectId?: string) {
    const [valuation, low] = await Promise.all([this.stock.valuation(user, projectId ? { projectId } : {}), this.stock.balances(user, { lowOnly: true, pageSize: MAX_PAGE_SIZE, ...(projectId ? { projectId } : {}) })]);
    const byProject = new Map<string, { name: string; items: number; value: number; ages: number[] }>();
    for (const r of valuation.rows) {
      const p = byProject.get(r.projectId) ?? { name: r.projectName, items: 0, value: 0, ages: [0, 0, 0, 0] };
      p.items += 1;
      p.value += N(r.value);
      const bal = N(r.balance);
      r.ageingQty.forEach((q, i) => (p.ages[i] += bal > 0 && r.rate ? (N(q) / bal) * N(r.value) : 0));
      byProject.set(r.projectId, p);
    }
    const ageCols = STOCK_AGEING_BUCKETS.map((b, i) => col(`a${i}`, b));
    const projectCols = [projectCol, col('items', 'Items', 'count'), col('value', 'Value'), ...ageCols];
    const projectRows = [...byProject.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([id, p]) => ({ project: p.name, items: p.items, value: r2(p.value), ...Object.fromEntries(p.ages.map((v, i) => [`a${i}`, r2(v)])), _href: `/stock?projectId=${id}` }));
    const lowCols = [col('item', 'Item', 'text'), projectCol, col('balance', 'In stock', 'qty'), col('min', 'Minimum', 'qty'), col('unit', 'Unit', 'text'), col('last', 'Last movement', 'date')];
    const lowRows = low.items.map((b) => ({ item: b.itemName, project: b.projectName, balance: N(b.balance), min: N(b.minQty), unit: b.unit, last: b.lastMovement }));
    const idleCols = [col('item', 'Item', 'text'), projectCol, col('balance', 'In stock', 'qty'), col('unit', 'Unit', 'text'), col('value', 'Value'), col('days', 'Oldest', 'days')];
    const idleRows = valuation.rows
      .filter((r) => (r.oldestDays ?? 0) > 90 && N(r.value) > 0)
      .sort((a, b) => N(b.value) - N(a.value))
      .slice(0, 50)
      .map((r) => ({ item: r.itemName, project: r.projectName, balance: N(r.balance), unit: r.unit, value: N(r.value), days: r.oldestDays }));
    const old = N(valuation.ageingValue[2]) + N(valuation.ageingValue[3]);
    return {
      figures: [
        { label: 'Stock value', value: N(valuation.totalValue), kind: 'money' as const, note: 'At item master rates' },
        { label: 'Over 90 days old', value: r2(old), kind: 'money' as const },
        { label: 'Items below minimum', value: lowRows.length, kind: 'count' as const },
        { label: 'Items without a rate', value: valuation.unpricedItems, kind: 'count' as const, note: 'Not valued' },
      ],
      sections: [
        section({ key: 'projects', title: 'By project and store', note: 'Value by how long the stock has been held, the oldest assumed used first.', columns: projectCols, rows: projectRows, totals: true, empty: 'No stock on hand.' }),
        section({ key: 'low', title: 'Below their minimum', columns: lowCols, rows: lowRows, empty: 'No item is below its minimum.' }),
        section({ key: 'idle', title: 'Held over 90 days, the 50 largest', columns: idleCols, rows: idleRows, totals: true, empty: 'Nothing has been held over 90 days.' }),
      ],
      notes: ['Stock is valued at the item master rate, aged first in, first out, as on the Stock value page.'],
    };
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Approvals

  private async approvals(user: RequestUser, projects: ProjectSummary[], today: string) {
    const ids = new Set(projects.map((p) => p.id));
    const waiting = (await this.lifecycle.submitted(user)).filter((p) => ids.has(p.projectId));
    const ageing = approvalAgeing(waiting, today);
    const days = (s: string) => Math.max(0, daysBetween(s.slice(0, 10), today));
    const typeCols = [col('type', 'Type', 'text'), col('count', 'Waiting', 'count'), col('oldest', 'Oldest', 'days'), col('average', 'Average', 'days'), col('amount', 'Amount')];
    const typeRows = ageing.byType.map((t) => {
      const of = waiting.filter((w) => w.type === t.type);
      return { type: SUBMISSION_TYPE_LABELS[t.type as SubmissionType], count: t.count, oldest: t.oldestDays, average: avg(of.map((w) => days(w.submittedAt))), amount: r2(of.reduce((s, w) => s + N(w.amount), 0)) };
    });
    const projectCols = [projectCol, col('count', 'Waiting', 'count'), col('old', `Over ${APPROVAL_OLD_DAYS} days`, 'count'), col('oldest', 'Oldest', 'days')];
    const projectRows = projects
      .map((p) => {
        const of = waiting.filter((w) => w.projectId === p.id);
        return { _href: projectHref(p.id), project: projectCell(p), count: of.length, old: of.filter((w) => days(w.submittedAt) > APPROVAL_OLD_DAYS).length, oldest: of.length ? Math.max(...of.map((w) => days(w.submittedAt))) : null };
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => (b.oldest ?? 0) - (a.oldest ?? 0));
    const listCols = [col('what', 'Entry', 'text'), col('type', 'Type', 'text'), projectCol, col('by', 'Sent by', 'text'), col('sent', 'Sent', 'date'), col('days', 'Days', 'days'), col('amount', 'Amount')];
    const list = waiting
      .filter((w) => days(w.submittedAt) > APPROVAL_OLD_DAYS)
      .map((w) => ({ _href: submissionHref(w.type, w.id), what: w.title, type: SUBMISSION_TYPE_LABELS[w.type], project: w.projectName, by: w.submittedByName, sent: w.submittedAt.slice(0, 10), days: days(w.submittedAt), amount: w.amount === null ? null : N(w.amount) }));
    return {
      figures: [
        { label: 'Waiting', value: ageing.waiting, kind: 'count' as const },
        { label: `Over ${APPROVAL_OLD_DAYS} days`, value: ageing.buckets[2] + ageing.buckets[3], kind: 'count' as const },
        { label: 'Over 15 days', value: ageing.buckets[3], kind: 'count' as const },
        { label: 'Oldest', value: ageing.oldestDays, kind: 'days' as const },
      ],
      sections: [
        section({ key: 'types', title: 'By type', columns: typeCols, rows: typeRows, totals: true, empty: 'Nothing is waiting.' }),
        section({ key: 'projects', title: 'By project', columns: projectCols, rows: projectRows, totals: true, empty: 'Nothing is waiting.' }),
        section({ key: 'old', title: `Waiting over ${APPROVAL_OLD_DAYS} days, the oldest first`, columns: listCols, rows: list, empty: `Nothing has waited over ${APPROVAL_OLD_DAYS} days.` }),
      ],
      notes: ['Every entry sent for approval in the projects you see, whoever decides it. Days are counted from when it was sent.'],
    };
  }
}

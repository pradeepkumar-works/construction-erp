import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  APPROVAL_OLD_DAYS,
  PROJECT_AREAS,
  areaExceptions,
  areaSubmissionTypes,
  areaWaiting,
  areaWarningKinds,
  canSeeWatchList,
  canViewContract,
  canViewCost,
  canViewPurchaseOrders,
  canViewStockValue,
  daysWithoutReport,
  figure,
  isProjectArea,
  plural,
  unbilledAttention,
  type AreaWaitingEntry,
  type Figure,
  type FigureId,
  type FigureInput,
  type ProjectArea,
  type ProjectAreaDto,
  type ProjectSummary,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, formatDay, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ProjectsService } from '../projects/projects.service';
import { StockService } from '../stock/stock.service';
import { WarningsService } from '../warnings/warnings.service';
import { ManagementService } from '../management/management.service';
import { DashboardService } from './dashboard.service';
import { ModuleHomeService } from './module-home.service';

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const pick = (figures: Figure[], id: FigureId) => figures.find((f) => f.id === id);

/**
 * One project's area summaries (ARCHITECTURE "Overviews answer first"): for Plan, Site, Materials or Money, the headline
 * figures, what waits on whom and the open warnings. Every figure is read through the module that owns it (the project
 * dashboard, the module screens' figures, stock valuation, the management dashboard's money) behind that list's helper;
 * what waits is the approvals queue's, and the warnings are the watch list's.
 */
@Injectable()
export class ProjectAreasService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private lifecycle: SubmissionLifecycleService,
    private projects: ProjectsService,
    private dashboard: DashboardService,
    private modules: ModuleHomeService,
    private stock: StockService,
    private warnings: WarningsService,
    private management: ManagementService,
  ) {}

  async area(user: RequestUser, projectId: string, area: string): Promise<ProjectAreaDto> {
    if (!isProjectArea(area)) throw new BadRequestException(`No such area: choose one of ${PROJECT_AREAS.join(', ')}`);
    await this.access.assertCanAccessProject(user, projectId);
    const project = (await this.projects.listAll(user)).find((p) => p.id === projectId);
    if (!project) throw new NotFoundException('Project not found');
    const today = todayIn();
    const role = user.roleKey;
    const types = areaSubmissionTypes(area, role);
    const [entries, watch] = await Promise.all([
      this.lifecycle.inProject(user, projectId, types),
      canSeeWatchList(role) ? this.warnings.list(user, areaWarningKinds(area)) : null,
    ]);
    const exceptions = watch ? areaExceptions(watch.open, projectId, area) : null;
    const { figures, finish } = await this.figures(user, area, project, entries, today);
    return {
      area,
      asOf: today,
      figures: figures.filter((f): f is Figure => !!f),
      ...(finish ? { finish } : {}),
      waiting: types.length ? areaWaiting(entries, today, canViewCost(role)) : null,
      exceptions: exceptions?.top ?? null,
      moreExceptions: exceptions?.more ?? 0,
    };
  }

  private async figures(user: RequestUser, area: ProjectArea, project: ProjectSummary, entries: AreaWaitingEntry[], today: string): Promise<{ figures: FigureInput[]; finish?: ProjectAreaDto['finish'] }> {
    switch (area) {
      case 'plan':
        return this.plan(user, project);
      case 'site':
        return { figures: await this.site(user, project, entries, today) };
      case 'materials':
        return { figures: await this.materials(user, project, today) };
      case 'money':
        return { figures: await this.money(user, project, entries, today) };
    }
  }

  /** Waiting for approval in the area, with the part waiting longer than the old mark. */
  private approvals(entries: AreaWaitingEntry[], today: string): Figure {
    const old = entries.filter((e) => daysBetween(e.waitingSince.slice(0, 10), today) > APPROVAL_OLD_DAYS).length;
    return figure('approvalsWaiting', entries.length, { versus: { part: figure('approvalsOld', old) } });
  }

  /** Progress against plan, the plan's finish against the completion date, late activities and the BOQ against the contract. */
  private async plan(user: RequestUser, project: ProjectSummary): Promise<{ figures: FigureInput[]; finish: ProjectAreaDto['finish'] }> {
    const d = await this.dashboard.project(user, project.id);
    const planned = d.plannedFinish ?? null;
    const completion = d.completionDate ?? null;
    const past = planned && completion ? Math.max(0, daysBetween(completion, planned)) : null;
    const contract = canViewContract(user.roleKey) && project.revisedContractValue;
    return {
      finish: { planned, completion },
      figures: [
        d.plannedProgressPct !== null && d.plannedProgressPct !== undefined ? figure('physicalProgress', d.physicalProgressPct, { versus: { plan: d.plannedProgressPct } }) : figure('physicalProgress', d.physicalProgressPct),
        figure('planPastCompletion', past ?? { none: !completion ? 'No completion date set' : 'No planned dates yet' }),
        figure('delayedActivities', d.activitiesDelayed, { versus: { of: d.activitiesTotal } }),
        contract ? figure('boqValue', d.boqTotalAmount, { versus: { of: figure('contractValue', contract) } }) : figure('boqValue', d.boqTotalAmount),
      ],
    };
  }

  /** Daily reports missed this week, what waits for approval, open delays and risks, open NCRs. */
  private async site(user: RequestUser, project: ProjectSummary, entries: AreaWaitingEntry[], today: string): Promise<FigureInput[]> {
    const [site, quality, reports] = await Promise.all([
      this.modules.figures(user, 'site', today, project.id),
      this.modules.figures(user, 'quality', today, project.id),
      project.status === 'ACTIVE'
        ? this.prisma.dailyReport.findMany({
            where: { projectId: project.id, status: { in: ['SUBMITTED', 'APPROVED'] }, date: { gte: parseDate(addDays(today, -7)), lt: parseDate(today) } },
            distinct: ['date'],
            select: { date: true },
          })
        : null,
    ]);
    const gap = reports && daysWithoutReport(new Set(reports.map((r) => dateOnly(r.date))), today, project.startDate);
    return [
      gap && gap.counted > 0 ? figure('daysWithoutDpr', gap.missing, { versus: { of: gap.counted } }) : figure('daysWithoutDpr', { none: project.status === 'ACTIVE' ? 'The project starts after today' : 'The project is not under way' }),
      this.approvals(entries, today),
      pick(site, 'openRisks'),
      pick(quality, 'openNcrs'),
    ];
  }

  /** Indents to approve, orders to receive and late, stock value and its old part, items below their minimum. */
  private async materials(user: RequestUser, project: ProjectSummary, today: string): Promise<FigureInput[]> {
    const role = user.roleKey;
    const [materials, purchases, valuation] = await Promise.all([
      this.modules.figures(user, 'materials', today, project.id),
      canViewPurchaseOrders(role) ? this.modules.figures(user, 'purchases', today, project.id) : [],
      canViewStockValue(role) ? this.stock.valuation(user, { projectId: project.id }) : null,
    ]);
    const old = valuation ? Number(valuation.ageingValue[2] ?? 0) + Number(valuation.ageingValue[3] ?? 0) : 0;
    return [
      pick(materials, 'materialRequestsToApprove'),
      pick(purchases, 'ordersToReceive'),
      pick(purchases, 'lateDeliveries'),
      valuation && figure('stockValue', valuation.totalValue, { versus: { part: figure('stockOver90', old.toFixed(2)) } }),
      pick(materials, 'itemsBelowMinimum'),
    ];
  }

  /**
   * Billed against the contract, received, what the client owes, work done not billed since the last bill, and the margin
   * on the work done: the management dashboard's row for the project, as its own page shows it. Roles that see no bills
   * get what waits for approval in the area.
   */
  private async money(user: RequestUser, project: ProjectSummary, entries: AreaWaitingEntry[], today: string): Promise<FigureInput[]> {
    if (!canViewContract(user.roleKey)) return [this.approvals(entries, today)];
    const { rows } = await this.management.build(user, [project], today);
    const row = rows[0];
    if (!row) return [];
    const m = row.money;
    const billing = unbilledAttention(row.reasons);
    const since = m.billedUpTo ? `the bill up to ${formatDay(m.billedUpTo)}` : 'the start';
    const unbilled = billing && m.unbilledDays !== null ? { level: billing.level, because: `${plural(m.unbilledDays, 'day')} since ${since}` } : billing;
    return [
      m.contractValue ? figure('billed', m.billed, { when: 'toDate', versus: { of: figure('contractValue', m.contractValue) } }) : figure('billed', m.billed, { when: 'toDate' }),
      figure('moneyReceived', m.received, { when: 'toDate' }),
      figure('clientsOwe', m.outstanding, { versus: { part: figure('clientsOweOver90', m.over90) } }),
      figure('workNotBilled', m.unbilled, unbilled ? { attention: unbilled } : undefined),
      canViewCost(user.roleKey) && figure('marginToDate', m.margin, { versus: { of: figure('workDone', m.workDone) } }),
    ];
  }
}

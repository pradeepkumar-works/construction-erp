import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canViewContract, canViewCost, canViewPayables, revisedCompletion, seesGettingStarted, type CompanyDashboard, type GettingStartedDto, type GettingStartedStep, type ProjectDashboard, type ProjectType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ProjectsService } from '../projects/projects.service';
import { PlanningService } from '../planning/planning.service';
import { ProgressService } from '../progress/progress.service';
import { DprService } from '../dpr/dpr.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { CostService } from '../cost/cost.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';

/**
 * Share of the work planned to be done by `today` (UX item 85), each activity weighted as physical progress weighs it
 * (planned quantity × BOQ rate, or the quantity without a rate) and spread evenly over its planned dates, inclusive.
 * Only activities with both dates count; null when none has them.
 */
export function plannedProgress(
  activities: { plannedQty: string; boqItemId: string | null; plannedStart: string | null; plannedEnd: string | null }[],
  rates: Map<string, Prisma.Decimal>,
  today: string,
): number | null {
  const at = Date.parse(`${today}T00:00:00Z`) + 86_400_000;
  let planned = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  for (const a of activities) {
    if (!a.plannedStart || !a.plannedEnd) continue;
    const qty = new Prisma.Decimal(a.plannedQty);
    const rate = a.boqItemId ? rates.get(a.boqItemId) : undefined;
    const weight = rate ? rate.mul(qty) : qty;
    const start = Date.parse(`${a.plannedStart}T00:00:00Z`);
    const end = Date.parse(`${a.plannedEnd}T00:00:00Z`) + 86_400_000;
    const share = end > start ? Math.min(1, Math.max(0, (at - start) / (end - start))) : at >= end ? 1 : 0;
    planned = planned.add(weight.mul(share));
    total = total.add(weight);
  }
  if (total.lte(0)) return null;
  return Math.round(planned.div(total).mul(1000).toNumber()) / 10;
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private projects: ProjectsService,
    private planning: PlanningService,
    private progress: ProgressService,
    private dpr: DprService,
    private lifecycle: SubmissionLifecycleService,
    private receivables: ReceivablesService,
    private payables: PayablesService,
    private cost: CostService,
  ) {}

  /** Which first-week setup steps the organisation has done, from what is in its data. */
  async gettingStarted(user: RequestUser): Promise<GettingStartedDto> {
    if (!seesGettingStarted(user.roleKey)) throw new ForbiddenException('Only admin and management see the setup checklist');
    const organizationId = user.organizationId;
    const org = { organizationId };
    const submitted = { ...org, status: { not: 'DRAFT' as const } };
    const approved = { ...org, status: 'APPROVED' as const };
    const [organization, projects, boq, activities, users, members, rules, progress, dprs, progressOk, dprsOk, mrsOk] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { createdAt: true } }),
      this.prisma.project.count({ where: org }),
      this.prisma.boqItem.count({ where: org }),
      this.prisma.activity.count({ where: org }),
      this.prisma.user.count({ where: org }),
      this.prisma.projectMember.count({ where: { project: org } }),
      this.prisma.approvalRule.count({ where: org }),
      this.prisma.progressEntry.count({ where: submitted }),
      this.prisma.dailyReport.count({ where: submitted }),
      this.prisma.progressEntry.count({ where: approved }),
      this.prisma.dailyReport.count({ where: approved }),
      this.prisma.materialRequest.count({ where: approved }),
    ]);
    const done: Record<GettingStartedStep, boolean> = {
      PROJECT: projects > 0,
      BOQ: boq > 0,
      ACTIVITIES: activities > 0,
      TEAM: users > 1,
      MEMBERS: members > 0,
      APPROVAL_RULES: rules > 0,
      FIRST_ENTRY: progress + dprs > 0,
      FIRST_APPROVAL: progressOk + dprsOk + mrsOk > 0,
    };
    const steps = (Object.keys(done) as GettingStartedStep[]).map((key) => ({ key, done: done[key] }));
    return { steps, done: steps.filter((s) => s.done).length, total: steps.length, organizationCreatedAt: organization.createdAt.toISOString() };
  }

  async company(user: RequestUser): Promise<CompanyDashboard> {
    const projects = await this.projects.listAll(user);
    const today = parseDate(todayIn());
    const projectIds = projects.map((p) => p.id);
    const month = today.toISOString().slice(0, 7);
    const monthStart = parseDate(`${month}-01`);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
    const seesBills = canViewContract(user.roleKey);
    const billsWhere = { organizationId: user.organizationId, projectId: { in: projectIds }, status: 'APPROVED' as const };
    const [pending, dprsToday, activities, receivables, payables, monthCost, monthBills, billedToDate] = await Promise.all([
      this.lifecycle.pending(user),
      this.prisma.dailyReport.count({ where: { projectId: { in: projectIds }, date: today } }),
      this.prisma.activity.findMany({ where: { projectId: { in: projectIds }, plannedEnd: { lt: today } }, include: { progressEntries: { where: { status: 'APPROVED' }, select: { quantity: true } } } }),
      seesBills ? this.receivables.summary(user) : null,
      canViewPayables(user.roleKey) ? this.payables.summary(user) : null,
      canViewCost(user.roleKey) ? this.cost.summary(user, { from: `${month}-01`, to: dateOnly(monthEnd)! }) : null,
      seesBills ? this.prisma.raBill.aggregate({ where: { ...billsWhere, billDate: { gte: monthStart, lte: monthEnd } }, _sum: { grossAmount: true }, _count: true }) : null,
      seesBills ? this.prisma.raBill.groupBy({ by: ['projectId'], where: billsWhere, _sum: { grossAmount: true } }) : null,
    ]);
    const delayedActivities = activities.filter((a) => a.progressEntries.reduce((s, e) => s.add(e.quantity), new Prisma.Decimal(0)).lt(a.plannedQty)).length;
    const byType = new Map<ProjectType, number>();
    for (const p of projects) byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
    const totalContractValue = projects.reduce((s, p) => s.add(p.contractValue ?? 0), new Prisma.Decimal(0));
    const ZERO = new Prisma.Decimal(0);
    let financialProgress: CompanyDashboard['financialProgress'];
    if (billedToDate) {
      // Only projects with a contract value count on either side, so the percentage compares like with like.
      const billedBy = new Map(billedToDate.map((b) => [b.projectId, b._sum.grossAmount ?? ZERO]));
      const withValue = projects.filter((p) => p.revisedContractValue && new Prisma.Decimal(p.revisedContractValue).gt(0));
      const contract = withValue.reduce((s, p) => s.add(p.revisedContractValue!), ZERO);
      const billed = withValue.reduce((s, p) => s.add(billedBy.get(p.id) ?? ZERO), ZERO);
      financialProgress = { contractValue: money(contract)!, billed: money(billed)!, pct: contract.gt(0) ? Math.round(billed.div(contract).mul(1000).toNumber()) / 10 : null };
    }
    return {
      activeProjects: projects.filter((p) => p.status === 'ACTIVE').length,
      totalProjects: projects.length,
      totalContractValue: money(totalContractValue)!,
      projectsByType: [...byType.entries()].map(([type, count]) => ({ type, count })),
      pendingApprovals: pending.length,
      delayedActivities,
      dueActivities: activities.length,
      dprsToday,
      ...(receivables
        ? { receivables: { outstanding: receivables.totals.outstanding, over90: receivables.totals.ageing.over90, openBills: receivables.openBills.length } }
        : {}),
      ...(payables ? { payables: { outstanding: payables.totals.outstanding, overdue: payables.totals.overdue, openBills: payables.openBills.length } } : {}),
      ...(monthCost
        ? {
            monthCost: {
              month,
              total: money(monthCost.reduce((s, p) => s.add(p.cost.total), ZERO))!,
              expenses: money(monthCost.reduce((s, p) => s.add(p.cost.expenses), ZERO))!,
            },
          }
        : {}),
      ...(monthBills ? { monthBilling: { month, gross: money(monthBills._sum.grossAmount ?? ZERO)!, bills: monthBills._count } } : {}),
      ...(financialProgress ? { financialProgress } : {}),
      projects,
    };
  }

  async project(user: RequestUser, projectId: string): Promise<ProjectDashboard> {
    const project = (await this.projects.listAll(user)).find((p) => p.id === projectId);
    if (!project) throw new NotFoundException('Project not found');
    const [boq, activities, recentProgress, recentDprs, openMaterialRequests, lastDpr, eot, lastMilestone] = await Promise.all([
      this.planning.listBoq(user, projectId),
      this.planning.listActivities(user, projectId),
      this.progress.list(user, { projectId, pageSize: 10 }).then((p) => p.items),
      this.dpr.list(user, { projectId, pageSize: 5 }).then((p) => p.items),
      this.prisma.materialRequest.count({ where: { projectId, status: { in: ['SUBMITTED', 'APPROVED'] } } }),
      this.prisma.dailyReport.findFirst({ where: { projectId }, orderBy: { date: 'desc' }, select: { date: true } }),
      this.prisma.risk.aggregate({ where: { projectId, kind: 'DELAY' }, _sum: { eotGrantedDays: true } }),
      this.prisma.milestone.aggregate({ where: { projectId }, _max: { dueDate: true } }),
    ]);
    const scheduled = activities.filter((a) => a.plannedStart && a.plannedEnd);
    // The Gantt's planned finish: the latest of the activities' ends and the milestones' due dates.
    const plannedFinish = [...scheduled.map((a) => a.plannedEnd!), dateOnly(lastMilestone._max.dueDate)].reduce<string | null>((m, d) => (d && (!m || d > m) ? d : m), null);
    const boqTotal = boq.reduce((s, i) => s.add(i.amount), new Prisma.Decimal(0));
    const boqExecuted = boq.reduce((s, i) => s.add(new Prisma.Decimal(i.rate).mul(i.executedQty)), new Prisma.Decimal(0));
    const rates = new Map(boq.map((i) => [i.id, new Prisma.Decimal(i.rate)]));
    return {
      project,
      physicalProgressPct: project.physicalProgressPct,
      plannedProgressPct: plannedProgress(activities, rates, todayIn()),
      activitiesScheduled: scheduled.length,
      plannedFinish,
      completionDate: revisedCompletion(project.endDate, eot._sum.eotGrantedDays ?? 0),
      boqTotalAmount: money(boqTotal)!,
      boqExecutedAmount: money(boqExecuted)!,
      activitiesTotal: activities.length,
      activitiesCompleted: activities.filter((a) => a.progressPct >= 100).length,
      activitiesDelayed: activities.filter((a) => a.isDelayed).length,
      pendingApprovals: project.pendingApprovals,
      openMaterialRequests,
      lastDprDate: dateOnly(lastDpr?.date ?? null),
      recentProgress,
      recentDprs,
      progressByActivity: activities.map((a) => ({ activityId: a.id, name: a.name, plannedQty: a.plannedQty, executedQty: a.executedQty, progressPct: a.progressPct })),
    };
  }
}

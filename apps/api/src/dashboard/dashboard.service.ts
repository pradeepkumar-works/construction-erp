import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CompanyDashboard, ProjectDashboard, ProjectType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ProjectsService } from '../projects/projects.service';
import { PlanningService } from '../planning/planning.service';
import { ProgressService } from '../progress/progress.service';
import { DprService } from '../dpr/dpr.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, money } from '../common/serialize';

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
  ) {}

  async company(user: RequestUser): Promise<CompanyDashboard> {
    const projects = await this.projects.list(user);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const projectIds = projects.map((p) => p.id);
    const [pending, dprsToday, activities] = await Promise.all([
      this.lifecycle.pending(user),
      this.prisma.dailyReport.count({ where: { projectId: { in: projectIds }, date: today } }),
      this.prisma.activity.findMany({ where: { projectId: { in: projectIds }, plannedEnd: { lt: today } }, include: { progressEntries: { where: { status: 'APPROVED' }, select: { quantity: true } } } }),
    ]);
    const delayedActivities = activities.filter((a) => a.progressEntries.reduce((s, e) => s.add(e.quantity), new Prisma.Decimal(0)).lt(a.plannedQty)).length;
    const byType = new Map<ProjectType, number>();
    for (const p of projects) byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
    const totalContractValue = projects.reduce((s, p) => s.add(p.contractValue ?? 0), new Prisma.Decimal(0));
    return {
      activeProjects: projects.filter((p) => p.status === 'ACTIVE').length,
      totalProjects: projects.length,
      totalContractValue: money(totalContractValue)!,
      projectsByType: [...byType.entries()].map(([type, count]) => ({ type, count })),
      pendingApprovals: pending.length,
      delayedActivities,
      dprsToday,
      projects,
    };
  }

  async project(user: RequestUser, projectId: string): Promise<ProjectDashboard> {
    const project = (await this.projects.list(user)).find((p) => p.id === projectId);
    if (!project) throw new NotFoundException('Project not found');
    const [boq, activities, recentProgress, recentDprs, openMaterialRequests, lastDpr] = await Promise.all([
      this.planning.listBoq(user, projectId),
      this.planning.listActivities(user, projectId),
      this.progress.list(user, { projectId, limit: 10 }),
      this.dpr.list(user, { projectId, limit: 5 }),
      this.prisma.materialRequest.count({ where: { projectId, status: { in: ['SUBMITTED', 'APPROVED'] } } }),
      this.prisma.dailyReport.findFirst({ where: { projectId }, orderBy: { date: 'desc' }, select: { date: true } }),
    ]);
    const boqTotal = boq.reduce((s, i) => s.add(i.amount), new Prisma.Decimal(0));
    const boqExecuted = boq.reduce((s, i) => s.add(new Prisma.Decimal(i.rate).mul(i.executedQty)), new Prisma.Decimal(0));
    return {
      project,
      physicalProgressPct: project.physicalProgressPct,
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

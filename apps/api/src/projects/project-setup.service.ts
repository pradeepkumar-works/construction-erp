import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { boqContractGap, canEditProjects, sectorStepOf, setupShown, setupSteps, type ContractModel, type ProjectSetupDto, type ProjectSetupFacts, type ProjectType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly } from '../common/serialize';
import { ProjectsService } from './projects.service';

/**
 * A new project's setup checklist on its Overview (finding 6 of the October review): each step ticked from the project's
 * own records by `setupSteps` in @erp/shared, and the BOQ against the contract value (`boqContractGap`), which the watch
 * list's BOQ_OFF_CONTRACT reads too.
 */
@Injectable()
export class ProjectSetupService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private projects: ProjectsService,
  ) {}

  /** The BOQ total of each project, at the revised quantity where there is one. */
  async boqTotals(projectIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.boqItem.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, rate: true, originalQty: true, revisedQty: true } });
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.projectId, (out.get(r.projectId) ?? 0) + Number(new Prisma.Decimal(r.rate).mul(r.revisedQty ?? r.originalQty)));
    return out;
  }

  async facts(projectId: string): Promise<ProjectSetupFacts & { status: string; setupHiddenAt: Date | null }> {
    const p = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        type: true,
        status: true,
        contractModel: true,
        projectManagerId: true,
        startDate: true,
        endDate: true,
        contractValue: true,
        agreementNo: true,
        baselineAt: true,
        chainageStart: true,
        chainageEnd: true,
        floors: true,
        villages: true,
        setupHiddenAt: true,
      },
    });
    const [team, boqItems, boqTotals, unlinked, activities, budget, norms, activityNorms] = await Promise.all([
      this.prisma.projectMember.count({ where: { projectId, ...(p.projectManagerId ? { userId: { not: p.projectManagerId } } : {}) } }),
      this.prisma.boqItem.count({ where: { projectId } }),
      this.boqTotals([projectId]),
      this.prisma.boqItem.count({ where: { projectId, originalQty: { gt: 0 }, activities: { none: {} } } }),
      this.prisma.activity.findMany({ where: { projectId }, select: { id: true, parentActivityId: true, plannedStart: true, plannedEnd: true } }),
      this.prisma.projectBudget.findUnique({ where: { projectId }, select: { expenses: true, material: true, machinery: true, labour: true, subcontract: true } }),
      this.prisma.materialNorm.count({ where: { projectId } }),
      this.prisma.activityMaterialNorm.count({ where: { projectId } }),
    ]);
    const parents = new Set(activities.map((a) => a.parentActivityId).filter(Boolean));
    const sector = sectorStepOf(p.type as ProjectType);
    return {
      type: p.type as ProjectType,
      status: p.status,
      setupHiddenAt: p.setupHiddenAt,
      contractModel: p.contractModel as ContractModel,
      team,
      startDate: dateOnly(p.startDate),
      endDate: dateOnly(p.endDate),
      contractValue: p.contractValue ? Number(p.contractValue) : null,
      boqItems,
      boqTotal: boqTotals.get(projectId) ?? 0,
      boqItemsWithoutActivity: unlinked,
      activities: activities.length,
      activitiesUndated: activities.filter((a) => !parents.has(a.id) && (!a.plannedStart || !a.plannedEnd)).length,
      baselineAt: p.baselineAt?.toISOString() ?? null,
      agreementNo: p.agreementNo,
      budgetSet: !!budget && [budget.expenses, budget.material, budget.machinery, budget.labour, budget.subcontract].some((v) => Number(v) > 0),
      sectorSet: sector === 'chainage' ? p.chainageStart !== null && p.chainageEnd !== null : sector === 'floors' ? p.floors.length > 0 : sector === 'villages' ? p.villages.length > 0 : true,
      norms: norms + activityNorms,
    };
  }

  async get(user: RequestUser, projectId: string): Promise<ProjectSetupDto> {
    const project = await this.projects.get(user, projectId);
    const f = await this.facts(projectId);
    const steps = setupSteps(f, user.roleKey);
    const done = steps.filter((s) => s.done).length;
    return {
      show: canEditProjects(user.roleKey) && setupShown({ type: f.type, status: f.status, physicalProgressPct: project.physicalProgressPct, hidden: !!f.setupHiddenAt, done, total: steps.length }),
      steps,
      done,
      total: steps.length,
      boqGap: boqContractGap(f),
    };
  }

  /** Hides (or brings back) the checklist for everyone on the project. */
  async setHidden(user: RequestUser, projectId: string, hidden: boolean): Promise<ProjectSetupDto> {
    if (!canEditProjects(user.roleKey)) throw new ForbiddenException('Only those who edit the project can hide its setup checklist');
    await this.access.assertCanAccessProject(user, projectId);
    await this.prisma.project.update({ where: { id: projectId }, data: { setupHiddenAt: hidden ? new Date() : null } });
    await this.audit.log(user, 'PROJECT', projectId, hidden ? 'SETUP_HIDDEN' : 'SETUP_SHOWN');
    return this.get(user, projectId);
  }
}

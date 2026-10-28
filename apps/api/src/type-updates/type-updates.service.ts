import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MAX_UPDATE_PROJECTS,
  PROJECT_TYPES,
  STANDARD_TYPE_FOR,
  canManageTemplates,
  planIsEmpty,
  planSize,
  projectUpdatePlan,
  rollUp,
  withoutItems,
  type ApplyUpdatesResultDto,
  type ComponentKindDef,
  type ElementSpecs,
  type ProjectTypeDef,
  type ProjectUpdatePlan,
  type ProjectUpdateRowDto,
  type ProjectUpdatesDto,
  type RollupActivity,
  type RollupElement,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectTypesService } from '../templates/project-types.service';
import { TemplatesService } from '../templates/templates.service';
import { StructureService } from '../structure/structure.service';
import { ApplyUpdatesDto } from './type-updates.dto';

type Scope = { what: 'type'; type: ProjectTypeDef & { version: number } } | { what: 'kind'; kind: ComponentKindDef & { version: number } };

const D0 = new Prisma.Decimal(0);

/**
 * Update projects (item 134 part 3, ARCHITECTURE "Project types", Updating projects): what running projects of a type
 * would gain from it as it is now, or the components laid out from a kind from its steps now (`projectUpdatePlan`),
 * and adding it when the admin says so. It only adds; nothing a project has is changed.
 */
@Injectable()
export class TypeUpdatesService {
  constructor(private prisma: PrismaService, private audit: AuditService, private types: ProjectTypesService, private templates: TemplatesService, private structure: StructureService) {}

  private assertManage(user: RequestUser) {
    if (!canManageTemplates(user.roleKey)) throw new ForbiddenException('Only admin or management can update projects from their type');
  }

  private async scope(user: RequestUser, what: 'type' | 'kind', code: string): Promise<Scope> {
    if (what === 'type') {
      const type = await this.types.type(user.organizationId, code);
      if (!type) throw new NotFoundException('Project type not found');
      const row = await this.prisma.projectTypeConfig.findFirst({ where: { organizationId: user.organizationId, code }, select: { version: true } });
      return { what, type: { ...type, version: row?.version ?? 1 } };
    }
    const kind = (await this.types.kinds(user.organizationId)).find((k) => k.code === code);
    if (!kind) throw new NotFoundException('Component kind not found');
    return { what, kind: { ...kind, version: kind.row?.version ?? 1 } };
  }

  /** The projects a scope reaches: a type's (a standard type's include those made before item 134), or those with a component of the kind. */
  private projectWhere(organizationId: string, scope: Scope): Prisma.ProjectWhereInput {
    if (scope.what === 'kind') return { organizationId, workElements: { some: { kindCode: scope.kind.code } } };
    const bases = PROJECT_TYPES.filter((b) => STANDARD_TYPE_FOR[b] === scope.type.code);
    return { organizationId, OR: [{ typeCode: scope.type.code }, ...(bases.length ? [{ typeCode: null, type: { in: bases } }] : [])] };
  }

  /** Each project with what it would gain, and its progress now and after. */
  private async plans(user: RequestUser, scope: Scope, ids?: string[]) {
    const projects = await this.prisma.project.findMany({
      where: { ...this.projectWhere(user.organizationId, scope), ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, code: true, name: true, status: true, typeVersion: true },
      orderBy: { code: 'asc' },
      take: MAX_UPDATE_PROJECTS,
    });
    const projectIds = projects.map((p) => p.id);
    const [kinds, elements, activities, approved] = await Promise.all([
      this.types.kinds(user.organizationId),
      this.prisma.workElement.findMany({ where: { projectId: { in: projectIds } }, select: { id: true, projectId: true, parentId: true, name: true, kindCode: true, elementType: true, specs: true, weightPct: true } }),
      this.prisma.activity.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, projectId: true, workElementId: true, parentActivityId: true, name: true, plannedQty: true, weightPct: true, boqItem: { select: { rate: true } } },
      }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId: { in: projectIds }, status: 'APPROVED' }, _sum: { quantity: true } }),
    ]);
    const done = new Map(approved.map((a) => [a.activityId, a._sum.quantity ?? D0]));
    const type = scope.what === 'type' ? scope.type : null;
    const only = scope.what === 'kind' ? { kind: scope.kind.code } : undefined;
    return projects.map((p) => {
      const els = elements.filter((e) => e.projectId === p.id);
      const acts = activities.filter((a) => a.projectId === p.id);
      const plan = projectUpdatePlan(
        type,
        kinds,
        els.map((e) => ({ id: e.id, parentId: e.parentId, name: e.name, kindCode: e.kindCode, elementType: e.elementType, specs: (e.specs as ElementSpecs | null) ?? null })),
        acts,
        only,
      );
      const rollElements: RollupElement[] = els.map((e) => ({ id: e.id, parentId: e.parentId, weightPct: e.weightPct?.toNumber() ?? null }));
      const rollActivities: RollupActivity[] = acts.map((a) => ({
        id: a.id,
        workElementId: a.workElementId,
        parentActivityId: a.parentActivityId,
        weightPct: a.weightPct?.toNumber() ?? null,
        plannedQty: a.plannedQty.toNumber(),
        executedQty: (done.get(a.id) ?? D0).toNumber(),
        value: (a.boqItem?.rate ? a.boqItem.rate.mul(a.plannedQty) : a.plannedQty).toNumber(),
      }));
      return { project: p, plan, rollElements, rollActivities };
    });
  }

  /** Progress once the plan's work is in, every new activity at nothing done. */
  private progressAfter(plan: ProjectUpdatePlan, elements: RollupElement[], activities: RollupActivity[]): number {
    const els = [...elements];
    const acts = [...activities];
    const leaf = (id: string, workElementId: string, parentActivityId: string | null, weightPct: number | null, qty: number | null): RollupActivity => ({
      id,
      workElementId,
      parentActivityId,
      weightPct,
      plannedQty: qty ?? 0,
      executedQty: 0,
      value: qty ?? 0,
    });
    for (const c of plan.components) {
      const id = `new:${c.key}`;
      els.push({ id, parentId: c.parentId ?? (c.parentKey ? `new:${c.parentKey}` : null), weightPct: c.weightPct });
      for (const l of c.activities) acts.push(leaf(`${id}:${l.key}`, id, l.parentKey ? `${id}:${l.parentKey}` : null, l.weightPct, l.qty));
    }
    for (const a of plan.activities) acts.push(leaf(`new:${a.elementId}:${a.key}`, a.elementId, a.parentKey ? `new:${a.elementId}:${a.parentKey}` : a.parentActivityId, a.weightPct, a.qty));
    for (const name of plan.loose) acts.push({ id: `new:loose:${name}`, workElementId: null, parentActivityId: null, weightPct: null, plannedQty: 0, executedQty: 0, value: 0 });
    return rollUp(els, acts).projectPct;
  }

  async preview(user: RequestUser, what: 'type' | 'kind', code: string): Promise<ProjectUpdatesDto> {
    this.assertManage(user);
    const scope = await this.scope(user, what, code);
    const plans = await this.plans(user, scope);
    const rows: ProjectUpdateRowDto[] = plans
      .filter((x) => !planIsEmpty(x.plan))
      .map(({ project: p, plan, rollElements, rollActivities }) => ({
        projectId: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        typeVersion: p.typeVersion,
        plan,
        progressNow: rollUp(rollElements, rollActivities).projectPct,
        progressAfter: this.progressAfter(plan, rollElements, rollActivities),
      }));
    const def = scope.what === 'type' ? scope.type : scope.kind;
    return { code: def.code, name: def.name, version: def.version, rows, upToDate: plans.length - rows.length };
  }

  /**
   * Add each chosen project's plan, less what the admin left out. The plan is worked out again here, so a project that
   * changed since the preview gets only what it still lacks.
   */
  async apply(user: RequestUser, what: 'type' | 'kind', code: string, dto: ApplyUpdatesDto): Promise<ApplyUpdatesResultDto> {
    this.assertManage(user);
    if (!dto.projects.length) throw new BadRequestException('Choose the projects to update');
    const scope = await this.scope(user, what, code);
    const skips = new Map(dto.projects.map((p) => [p.projectId, p.skip ?? []]));
    const plans = await this.plans(user, scope, [...skips.keys()]);
    if (plans.length !== skips.size) throw new BadRequestException(`Some of the projects chosen are not ${scope.what === 'type' ? 'of this type' : 'using this kind'}; open Update projects again`);
    const total = { projects: 0, components: 0, activities: 0 };
    const name = scope.what === 'type' ? scope.type.name : scope.kind.name;
    for (const { project, plan: full } of plans) {
      const plan = withoutItems(full, skips.get(project.id) ?? []);
      if (planIsEmpty(plan)) continue;
      const made = await this.prisma.$transaction(
        async (tx) => {
          const added = await this.structure.addFromPlanUnchecked(user, project.id, plan, tx);
          const loose = plan.loose.length ? (await this.templates.applyUnchecked(user, project.id, plan.loose, tx)).created : 0;
          if (scope.what === 'type') await tx.project.update({ where: { id: project.id }, data: { typeVersion: scope.type.version } });
          return { components: added.components, activities: added.activities + loose };
        },
        { timeout: 60_000 },
      );
      const size = planSize(plan);
      await this.audit.log(user, 'PROJECT', project.id, 'TYPE_UPDATE_APPLIED', `${made.components} components and ${made.activities} activities from ${name}${size.activities !== made.activities ? ' (some were there already)' : ''}`);
      total.projects++;
      total.components += made.components;
      total.activities += made.activities;
    }
    await this.audit.log(user, scope.what === 'type' ? 'PROJECT_TYPE' : 'COMPONENT_KIND', code, 'PROJECTS_UPDATED', `${total.projects} projects: ${total.components} components, ${total.activities} activities added`);
    return total;
  }
}

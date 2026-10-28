import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canEditProjects,
  canManageTemplates,
  scheduleTemplate,
  spreadUndated,
  templateSpan,
  typeCodeOf,
  type ActivityTemplateDto,
  type ActivityTemplateItem,
  type ApplyTemplateResultDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, parseDate } from '../common/serialize';
import { SaveTemplateDto } from './templates.dto';
import { ProjectTypesService } from './project-types.service';

/**
 * Loose activities per project type (item 134: keyed by the type's code, `ProjectTypesService`). A company edits its
 * own; until it does, the standard type's list in packages/shared applies (so nothing needs seeding).
 */
@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private types: ProjectTypesService) {}

  /** A type's loose activities (item 134: by the type's code); the standard type's list until the company saves its own. */
  items(organizationId: string, typeCode: string, db: Prisma.TransactionClient = this.prisma): Promise<{ isDefault: boolean; items: ActivityTemplateItem[] }> {
    return this.types.activities(organizationId, typeCode, db);
  }

  async get(user: RequestUser, typeCode: string): Promise<ActivityTemplateDto> {
    const type = await this.types.type(user.organizationId, typeCode);
    if (!type) throw new NotFoundException('Project type not found');
    const t = await this.items(user.organizationId, typeCode);
    return { projectType: type.baseType, typeCode, typeName: type.name, ...t, spanDays: templateSpan(t.items) };
  }

  async list(user: RequestUser): Promise<ActivityTemplateDto[]> {
    const types = await this.types.typeRows(user.organizationId);
    return Promise.all(types.map((t) => this.get(user, t.code)));
  }

  /** Replace the company's list for a type; an empty list returns to the standard one. */
  async save(user: RequestUser, typeCode: string, dto: SaveTemplateDto): Promise<ActivityTemplateDto> {
    if (!canManageTemplates(user.roleKey)) throw new ForbiddenException('Only admin or management can change activity templates');
    const type = await this.types.type(user.organizationId, typeCode);
    if (!type) throw new NotFoundException('Project type not found');
    const seen = new Set<string>();
    for (const i of dto.items) {
      const key = i.name.toLowerCase();
      if (seen.has(key)) throw new BadRequestException(`"${i.name}" is listed twice`);
      seen.add(key);
    }
    await this.prisma.$transaction([
      this.prisma.activityTemplate.deleteMany({ where: { organizationId: user.organizationId, typeCode } }),
      this.prisma.activityTemplate.createMany({
        data: dto.items.map((i, idx) => ({ organizationId: user.organizationId, projectType: type.baseType, typeCode, name: i.name, unit: i.unit, startDay: i.startDay, durationDays: i.durationDays, sortOrder: idx + 1 })),
      }),
    ]);
    await this.audit.log(user, 'ACTIVITY_TEMPLATE', typeCode, dto.items.length ? 'UPDATED' : 'RESET', `${dto.items.length} activities`);
    return this.get(user, typeCode);
  }

  /**
   * Add the template's activities to a project, scheduled over its dates (see `scheduleTemplate`). Activities the
   * project already has (same name, any case) are skipped, so applying twice adds nothing. Planned quantities start at
   * 0 for the planner to fill in or link to BOQ items.
   */
  async apply(user: RequestUser, projectId: string, names?: string[]): Promise<ApplyTemplateResultDto> {
    if (!canEditProjects(user.roleKey)) throw new ForbiddenException('Your role cannot add activities');
    await this.access.assertCanAccessProject(user, projectId);
    return this.applyUnchecked(user, projectId, names);
  }

  /** `apply` without the role and access checks, for project creation (the creator may not be on the project). */
  async applyUnchecked(user: RequestUser, projectId: string, names?: string[], db: Prisma.TransactionClient = this.prisma): Promise<ApplyTemplateResultDto> {
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { type: true, typeCode: true, startDate: true, endDate: true, activities: { select: { name: true, sortOrder: true } } } });
    const code = typeCodeOf(project);
    const { items } = code ? await this.items(user.organizationId, code, db) : { items: [] };
    const wanted = names ? new Set(names.map((n) => n.trim().toLowerCase())) : null;
    const existing = new Set(project.activities.map((a) => a.name.trim().toLowerCase()));
    const baseOrder = project.activities.reduce((m, a) => Math.max(m, a.sortOrder), 0);
    const scheduled = scheduleTemplate(items, dateOnly(project.startDate), dateOnly(project.endDate)).filter((s) => !wanted || wanted.has(s.name.toLowerCase()));
    const skipped = scheduled.filter((s) => existing.has(s.name.toLowerCase())).map((s) => s.name);
    const toCreate = scheduled.filter((s) => !existing.has(s.name.toLowerCase()));
    if (toCreate.length) {
      await db.activity.createMany({
        data: toCreate.map((s) => ({
          organizationId: user.organizationId,
          projectId,
          name: s.name,
          unit: s.unit,
          plannedQty: new Prisma.Decimal(0),
          plannedStart: s.plannedStart ? parseDate(s.plannedStart) : null,
          plannedEnd: s.plannedEnd ? parseDate(s.plannedEnd) : null,
          sortOrder: baseOrder + s.sortOrder,
        })),
      });
      await db.auditLog.create({
        data: { organizationId: user.organizationId, entityType: 'PROJECT', entityId: projectId, action: 'TEMPLATE_APPLIED', actorId: user.id, note: `${toCreate.length} activities from the ${code ?? project.type} template` },
      });
    }
    return { created: toCreate.length, skipped };
  }

  /**
   * Dates for the activities that have none, once the project's own dates arrive (finding 11 of the October review):
   * a project made before its work order was in hand gets its template activities spread the moment its start and
   * completion dates are set, instead of staying undated. Returns how many were given dates.
   */
  async spreadUndated(user: RequestUser, projectId: string, db: Prisma.TransactionClient = this.prisma): Promise<number> {
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { type: true, typeCode: true, startDate: true, endDate: true, activities: { select: { id: true, name: true, unit: true, plannedQty: true, plannedStart: true, plannedEnd: true, boqItemId: true, sortOrder: true } } },
    });
    const start = dateOnly(project.startDate);
    const code = typeCodeOf(project);
    if (!start || !code) return 0;
    const { items } = await this.items(user.organizationId, code, db);
    const dates = spreadUndated(
      project.activities.map((a) => ({ ...a, plannedQty: a.plannedQty.toString(), plannedStart: dateOnly(a.plannedStart), plannedEnd: dateOnly(a.plannedEnd) })),
      items,
      start,
      dateOnly(project.endDate),
    );
    for (const d of dates) await db.activity.update({ where: { id: d.id }, data: { plannedStart: parseDate(d.plannedStart), plannedEnd: parseDate(d.plannedEnd) } });
    if (dates.length)
      await db.auditLog.create({
        data: { organizationId: user.organizationId, entityType: 'PROJECT', entityId: projectId, action: 'ACTIVITIES_SCHEDULED', actorId: user.id, note: `${dates.length} activities spread over the project's dates` },
      });
    return dates.length;
  }
}

import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_ACTIVITY_TEMPLATES,
  PROJECT_TYPES,
  canEditProjects,
  canManageTemplates,
  scheduleTemplate,
  templateSpan,
  type ActivityTemplateDto,
  type ActivityTemplateItem,
  type ApplyTemplateResultDto,
  type ProjectType,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, parseDate } from '../common/serialize';
import { SaveTemplateDto } from './templates.dto';

/**
 * Standard activity lists per project type. An organisation edits its own; until it does, the built-in list in
 * packages/shared applies (so a new organisation starts with sensible activities and nothing needs seeding).
 */
@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService) {}

  async items(organizationId: string, projectType: ProjectType, db: Prisma.TransactionClient = this.prisma): Promise<{ isDefault: boolean; items: ActivityTemplateItem[] }> {
    const rows = await db.activityTemplate.findMany({ where: { organizationId, projectType }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    if (!rows.length) return { isDefault: true, items: DEFAULT_ACTIVITY_TEMPLATES[projectType] };
    return { isDefault: false, items: rows.map((r) => ({ name: r.name, unit: r.unit, startDay: r.startDay, durationDays: r.durationDays })) };
  }

  async get(user: RequestUser, projectType: ProjectType): Promise<ActivityTemplateDto> {
    const t = await this.items(user.organizationId, projectType);
    return { projectType, ...t, spanDays: templateSpan(t.items) };
  }

  list(user: RequestUser): Promise<ActivityTemplateDto[]> {
    return Promise.all(PROJECT_TYPES.map((t) => this.get(user, t)));
  }

  /** Replace the organisation's list for a type; an empty list returns to the built-in one. */
  async save(user: RequestUser, projectType: ProjectType, dto: SaveTemplateDto): Promise<ActivityTemplateDto> {
    if (!canManageTemplates(user.roleKey)) throw new ForbiddenException('Only admin or management can change activity templates');
    const seen = new Set<string>();
    for (const i of dto.items) {
      const key = i.name.toLowerCase();
      if (seen.has(key)) throw new BadRequestException(`"${i.name}" is listed twice`);
      seen.add(key);
    }
    await this.prisma.$transaction([
      this.prisma.activityTemplate.deleteMany({ where: { organizationId: user.organizationId, projectType } }),
      this.prisma.activityTemplate.createMany({
        data: dto.items.map((i, idx) => ({ organizationId: user.organizationId, projectType, name: i.name, unit: i.unit, startDay: i.startDay, durationDays: i.durationDays, sortOrder: idx + 1 })),
      }),
    ]);
    await this.audit.log(user, 'ACTIVITY_TEMPLATE', projectType, dto.items.length ? 'UPDATED' : 'RESET', `${dto.items.length} activities`);
    return this.get(user, projectType);
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
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { type: true, startDate: true, endDate: true, activities: { select: { name: true, sortOrder: true } } } });
    const { items } = await this.items(user.organizationId, project.type, db);
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
        data: { organizationId: user.organizationId, entityType: 'PROJECT', entityId: projectId, action: 'TEMPLATE_APPLIED', actorId: user.id, note: `${toCreate.length} activities from the ${project.type.toLowerCase().replace('_', ' ')} template` },
      });
    }
    return { created: toCreate.length, skipped };
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActivityDto, BoqItemDto, BoqLinkSuggestion } from '@erp/shared';
import { boqLinkSuggestions, canEditProjects } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, dec, money, parseDate, pct } from '../common/serialize';
import { progressRollup } from '../common/progress';
import { BulkBoqDto, CreateActivityDto, CreateBoqItemDto, LinkBoqDto, UpdateActivityDto, UpdateBoqItemDto } from './planning.dto';

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);

/** A weight, % (0 to 100), or null to share what is left by value. */
export const weightOf = (v: string | null | undefined): Prisma.Decimal | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = D(v);
  if (d.lt(0) || d.gt(100)) throw new BadRequestException('Give a weight from 0 to 100 %');
  return d;
};

const elementName = (e: { code: string; name: string } | null) => (e ? `${e.code} ${e.name}` : null);

const EXTRA_QTY = 'An extra item gets its quantity from a variation the client approves (Billing > Variations), not from the BOQ';

@Injectable()
export class PlanningService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService) {}

  async listBoq(user: RequestUser, projectId: string): Promise<BoqItemDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const items = await this.prisma.boqItem.findMany({
      where: { projectId },
      include: {
        activities: { include: { progressEntries: { where: { status: 'APPROVED' }, select: { quantity: true } } } },
        measurements: { where: { status: { in: ['APPROVED', 'SUBMITTED'] } }, select: { status: true, totalQty: true } },
        workElement: { select: { code: true, name: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }],
    });
    return items.map((i) => {
      const executed = i.activities.flatMap((a) => a.progressEntries).reduce((s, e) => s.add(e.quantity), D(0));
      const effectiveQty = i.revisedQty ?? i.originalQty;
      const measured = i.measurements.filter((m) => m.status === 'APPROVED').reduce((s, m) => s.add(m.totalQty), D(0));
      const pendingMeasured = i.measurements.filter((m) => m.status === 'SUBMITTED').reduce((s, m) => s.add(m.totalQty), D(0));
      return {
        id: i.id,
        projectId: i.projectId,
        itemNo: i.itemNo,
        description: i.description,
        unit: i.unit,
        rate: money(i.rate)!,
        originalQty: dec(i.originalQty)!,
        revisedQty: dec(i.revisedQty),
        executedQty: dec(executed)!,
        balanceQty: dec(effectiveQty.sub(executed))!,
        amount: money(i.rate.mul(effectiveQty))!,
        measuredQty: dec(measured)!,
        measuredAmount: money(i.rate.mul(measured))!,
        pendingMeasuredQty: dec(pendingMeasured)!,
        sortOrder: i.sortOrder,
        section: i.section,
        workElementId: i.workElementId,
        workElementName: elementName(i.workElement),
        sorItemId: i.sorItemId,
        sorRef: i.sorRef,
      };
    });
  }

  async createBoq(user: RequestUser, projectId: string, dto: CreateBoqItemDto) {
    await this.access.assertCanAccessProject(user, projectId);
    const dup = await this.prisma.boqItem.findFirst({ where: { projectId, itemNo: dto.itemNo } });
    if (dup) throw new ConflictException(`BOQ item ${dto.itemNo} already exists`);
    if (D(dto.originalQty).isZero() && dto.revisedQty && !D(dto.revisedQty).isZero()) throw new BadRequestException(EXTRA_QTY);
    await this.assertBoqLinks(user, projectId, dto);
    const row = await this.prisma.boqItem.create({
      data: {
        organizationId: user.organizationId,
        projectId,
        itemNo: dto.itemNo,
        description: dto.description,
        unit: dto.unit,
        rate: D(dto.rate),
        originalQty: D(dto.originalQty),
        revisedQty: dto.revisedQty ? D(dto.revisedQty) : null,
        sortOrder: dto.sortOrder ?? 0,
        section: dto.section?.trim() || null,
        workElementId: dto.workElementId ?? null,
        sorItemId: dto.sorItemId ?? null,
        sorRef: dto.sorRef?.trim() || null,
      },
    });
    await this.audit.log(user, 'BOQ_ITEM', row.id, 'CREATED', dto.itemNo);
    return (await this.listBoq(user, projectId)).find((i) => i.id === row.id);
  }

  /** Bulk create (used by Excel/CSV import on the web). Skips item numbers that already exist. */
  async bulkBoq(user: RequestUser, projectId: string, dto: BulkBoqDto) {
    await this.access.assertCanAccessProject(user, projectId);
    const existing = new Set((await this.prisma.boqItem.findMany({ where: { projectId }, select: { itemNo: true } })).map((i) => i.itemNo));
    const toCreate = dto.items.filter((i) => !existing.has(i.itemNo));
    for (const i of toCreate) await this.assertBoqLinks(user, projectId, i);
    await this.prisma.boqItem.createMany({
      data: toCreate.map((i, idx) => ({
        organizationId: user.organizationId,
        projectId,
        itemNo: i.itemNo,
        description: i.description,
        unit: i.unit,
        rate: D(i.rate),
        originalQty: D(i.originalQty),
        revisedQty: i.revisedQty ? D(i.revisedQty) : null,
        sortOrder: i.sortOrder ?? existing.size + idx,
        section: i.section?.trim() || null,
        workElementId: i.workElementId ?? null,
        sorItemId: i.sorItemId ?? null,
        sorRef: i.sorRef?.trim() || null,
      })),
    });
    await this.audit.log(user, 'PROJECT', projectId, 'BOQ_IMPORTED', `${toCreate.length} items`);
    return { created: toCreate.length, skipped: dto.items.length - toCreate.length };
  }

  async updateBoq(user: RequestUser, projectId: string, id: string, dto: UpdateBoqItemDto) {
    await this.access.assertCanAccessProject(user, projectId);
    const item = await this.prisma.boqItem.findFirst({ where: { id, projectId } });
    if (!item) throw new NotFoundException('BOQ item not found');
    const data: Prisma.BoqItemUpdateInput = {};
    if (dto.itemNo !== undefined) data.itemNo = dto.itemNo;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.rate !== undefined) data.rate = D(dto.rate);
    if (dto.originalQty !== undefined) data.originalQty = D(dto.originalQty);
    if (dto.revisedQty !== undefined) data.revisedQty = dto.revisedQty ? D(dto.revisedQty) : null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    await this.assertBoqLinks(user, projectId, dto);
    if (dto.section !== undefined) data.section = dto.section?.trim() || null;
    if (dto.workElementId !== undefined) data.workElement = dto.workElementId ? { connect: { id: dto.workElementId } } : { disconnect: true };
    if (dto.sorItemId !== undefined) data.sorItem = dto.sorItemId ? { connect: { id: dto.sorItemId } } : { disconnect: true };
    if (dto.sorRef !== undefined) data.sorRef = dto.sorRef?.trim() || null;
    // An extra item (no original quantity) gets its quantity only from an approved variation.
    const original = dto.originalQty !== undefined ? D(dto.originalQty) : item.originalQty;
    const revised = dto.revisedQty !== undefined ? (dto.revisedQty ? D(dto.revisedQty) : null) : item.revisedQty;
    const wasExtra = (item.revisedQty ?? item.originalQty).isZero();
    if (wasExtra && original.isZero() && revised && !revised.isZero()) throw new BadRequestException(EXTRA_QTY);
    await this.prisma.boqItem.update({ where: { id }, data });
    await this.audit.log(user, 'BOQ_ITEM', id, 'UPDATED');
    return (await this.listBoq(user, projectId)).find((i) => i.id === id);
  }

  /** A BOQ item's component is of its project, its rate item of the company's schedules of rates. */
  private async assertBoqLinks(user: RequestUser, projectId: string, dto: { workElementId?: string | null; sorItemId?: string | null }) {
    if (dto.workElementId && !(await this.prisma.workElement.count({ where: { id: dto.workElementId, projectId } }))) throw new NotFoundException('Component not found in this project');
    if (dto.sorItemId && !(await this.prisma.sorItem.count({ where: { id: dto.sorItemId, organizationId: user.organizationId } }))) throw new NotFoundException('Schedule of rates item not found');
  }

  async deleteBoq(user: RequestUser, projectId: string, id: string) {
    await this.access.assertCanAccessProject(user, projectId);
    if (await this.prisma.raBillItem.count({ where: { boqItemId: id, bill: { projectId } } })) {
      throw new ConflictException('This BOQ item has been billed in an RA bill and cannot be deleted');
    }
    await this.prisma.boqItem.deleteMany({ where: { id, projectId } });
    await this.audit.log(user, 'BOQ_ITEM', id, 'DELETED');
    return { ok: true };
  }

  private toActivityDto(a: ActivityRow, rolled: { pct: Map<string, number>; summaries: Set<string> }): ActivityDto {
    const isSummary = rolled.summaries.has(a.id);
    const executed = isSummary ? D(0) : a.progressEntries.reduce((s, e) => s.add(e.quantity), D(0));
    const progressPct = isSummary ? (rolled.pct.get(a.id) ?? 0) : pct(executed, a.plannedQty);
    const today = new Date();
    const isDelayed = !!a.plannedEnd && a.plannedEnd < today && progressPct < 100;
    return {
      id: a.id,
      projectId: a.projectId,
      boqItemId: a.boqItemId,
      boqItemNo: a.boqItem?.itemNo ?? null,
      name: a.name,
      unit: a.unit,
      plannedQty: dec(a.plannedQty)!,
      executedQty: dec(executed)!,
      progressPct,
      plannedStart: dateOnly(a.plannedStart),
      plannedEnd: dateOnly(a.plannedEnd),
      responsibleId: a.responsibleId,
      responsibleName: a.responsible?.fullName ?? null,
      isDelayed,
      sortOrder: a.sortOrder,
      checklistTemplateId: a.checklistTemplateId,
      checklistName: a.checklistTemplate?.name ?? null,
      holdPoint: a.holdPoint,
      baselineStart: dateOnly(a.baselineStart),
      baselineEnd: dateOnly(a.baselineEnd),
      workElementId: a.workElementId,
      workElementName: elementName(a.workElement),
      parentActivityId: a.parentActivityId,
      weightPct: a.weightPct ? a.weightPct.toString() : null,
      isSummary,
    };
  }

  /**
   * A project's activities in order, sub-activities straight after their activity; an activity with sub-activities
   * shows their weighted progress (the work breakdown roll-up), not its own.
   */
  async listActivities(user: RequestUser, projectId: string): Promise<ActivityDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const [rows, elements] = await Promise.all([
      this.prisma.activity.findMany({ where: { projectId }, include: activityInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.workElement.findMany({ where: { projectId }, select: { id: true, parentId: true, weightPct: true } }),
    ]);
    const rolled = progressRollup(
      rows.map((a) => ({ ...a, rate: a.boqItem?.rate ?? null, executed: a.progressEntries.reduce((s, e) => s.add(e.quantity), D(0)) })),
      elements,
    );
    const ids = new Set(rows.map((r) => r.id));
    const subsOf = new Map<string, ActivityRow[]>();
    for (const r of rows) if (r.parentActivityId && ids.has(r.parentActivityId)) subsOf.set(r.parentActivityId, [...(subsOf.get(r.parentActivityId) ?? []), r]);
    const ordered = rows.filter((r) => !r.parentActivityId || !ids.has(r.parentActivityId)).flatMap((r) => [r, ...(subsOf.get(r.id) ?? [])]);
    return ordered.map((r) => this.toActivityDto(r, rolled));
  }

  /**
   * BOQ items to link the project's unlinked activities to, offered by the name of
   * the BOQ's sections and item descriptions. Nothing is changed until the planner confirms with `linkBoq`.
   */
  async boqLinkSuggestions(user: RequestUser, projectId: string): Promise<BoqLinkSuggestion[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const [activities, items] = await Promise.all([
      this.prisma.activity.findMany({ where: { projectId }, select: { id: true, name: true, unit: true, plannedQty: true, boqItemId: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.boqItem.findMany({ where: { projectId }, select: { id: true, itemNo: true, description: true, section: true, unit: true, originalQty: true, revisedQty: true, _count: { select: { activities: true } } }, orderBy: { sortOrder: 'asc' } }),
    ]);
    return boqLinkSuggestions(
      activities.map((a) => ({ id: a.id, name: a.name, unit: a.unit, plannedQty: dec(a.plannedQty)!, boqItemId: a.boqItemId })),
      items.map((i) => ({ id: i.id, itemNo: i.itemNo, description: i.description, section: i.section, unit: i.unit, quantity: dec(i.revisedQty ?? i.originalQty)!, linked: i._count.activities })),
    );
  }

  /**
   * Links the activities the planner confirmed to their BOQ items, and gives an activity with no quantity of its own
   * the item's unit and quantity. An activity or an item already linked is left alone.
   */
  async linkBoq(user: RequestUser, projectId: string, dto: LinkBoqDto): Promise<ActivityDto[]> {
    if (!canEditProjects(user.roleKey)) throw new ForbiddenException('Your role cannot change the activities');
    await this.access.assertCanAccessProject(user, projectId);
    const [activities, items] = await Promise.all([
      this.prisma.activity.findMany({ where: { projectId, id: { in: dto.links.map((l) => l.activityId) } }, select: { id: true, name: true, plannedQty: true, boqItemId: true } }),
      this.prisma.boqItem.findMany({ where: { projectId, id: { in: dto.links.map((l) => l.boqItemId) } }, select: { id: true, itemNo: true, unit: true, originalQty: true, revisedQty: true, _count: { select: { activities: true } } } }),
    ]);
    const byId = new Map(activities.map((a) => [a.id, a]));
    const itemById = new Map(items.map((i) => [i.id, i]));
    let linked = 0;
    for (const l of dto.links) {
      const a = byId.get(l.activityId);
      const i = itemById.get(l.boqItemId);
      if (!a || !i || a.boqItemId || i._count.activities) continue;
      const data: Prisma.ActivityUncheckedUpdateInput = { boqItemId: i.id };
      // An activity straight from a template has no quantity: the item's is the one to plan against.
      if (a.plannedQty.isZero()) {
        data.plannedQty = i.revisedQty ?? i.originalQty;
        data.unit = i.unit;
      }
      await this.prisma.activity.update({ where: { id: a.id }, data });
      await this.audit.log(user, 'ACTIVITY', a.id, 'UPDATED', `Linked to BOQ item ${i.itemNo}`);
      linked += 1;
    }
    if (!linked) throw new ConflictException('Those activities or BOQ items are already linked. Reopen the list to see the links as they are now.');
    return this.listActivities(user, projectId);
  }

  private async getActivity(user: RequestUser, projectId: string, id: string): Promise<ActivityDto> {
    const found = (await this.listActivities(user, projectId)).find((a) => a.id === id);
    if (!found) throw new NotFoundException('Activity not found');
    return found;
  }

  /**
   * The breakdown links of a new or changed activity: its component is of the project; its parent is a top-level
   * activity of the project with no progress of its own, and an activity with sub-activities cannot become one. A
   * sub-activity always sits in its activity's component.
   */
  private async treeLinks(projectId: string, id: string | null, dto: CreateActivityDto | UpdateActivityDto, current?: { workElementId: string | null; parentActivityId: string | null }) {
    const data: { workElementId?: string | null; parentActivityId?: string | null; weightPct?: Prisma.Decimal | null } = {};
    if (dto.weightPct !== undefined) data.weightPct = weightOf(dto.weightPct);
    const parentId = dto.parentActivityId !== undefined ? dto.parentActivityId : (current?.parentActivityId ?? null);
    if (dto.parentActivityId !== undefined) {
      if (parentId) {
        if (parentId === id) throw new BadRequestException('An activity cannot be a sub-activity of itself');
        const parent = await this.prisma.activity.findFirst({ where: { id: parentId, projectId }, select: { name: true, parentActivityId: true, _count: { select: { progressEntries: true } } } });
        if (!parent) throw new NotFoundException('Parent activity not found in this project');
        if (parent.parentActivityId) throw new BadRequestException(`${parent.name} is itself a sub-activity; choose a top-level activity`);
        if (parent._count.progressEntries) throw new BadRequestException(`Progress is already recorded against ${parent.name}; an activity with sub-activities takes none of its own, so choose another`);
        if (id && (await this.prisma.activity.count({ where: { parentActivityId: id } }))) throw new BadRequestException('This activity has sub-activities of its own; move them first');
      }
      data.parentActivityId = parentId;
    }
    if (parentId) {
      const parent = await this.prisma.activity.findUniqueOrThrow({ where: { id: parentId }, select: { workElementId: true } });
      data.workElementId = parent.workElementId;
    } else if (dto.workElementId !== undefined) {
      if (dto.workElementId && !(await this.prisma.workElement.count({ where: { id: dto.workElementId, projectId } }))) throw new NotFoundException('Component not found in this project');
      data.workElementId = dto.workElementId;
    }
    return data;
  }

  async createActivity(user: RequestUser, projectId: string, dto: CreateActivityDto): Promise<ActivityDto> {
    await this.access.assertCanAccessProject(user, projectId);
    await this.assertChecklist(user, dto.checklistTemplateId);
    const links = await this.treeLinks(projectId, null, dto);
    const row = await this.prisma.activity.create({
      data: {
        organizationId: user.organizationId,
        projectId,
        name: dto.name,
        unit: dto.unit,
        plannedQty: D(dto.plannedQty),
        boqItemId: dto.boqItemId ?? null,
        plannedStart: dto.plannedStart ? parseDate(dto.plannedStart) : null,
        plannedEnd: dto.plannedEnd ? parseDate(dto.plannedEnd) : null,
        responsibleId: dto.responsibleId ?? null,
        checklistTemplateId: dto.checklistTemplateId ?? null,
        holdPoint: dto.holdPoint ?? false,
        sortOrder: dto.sortOrder ?? 0,
        ...links,
      },
      select: { id: true },
    });
    await this.audit.log(user, 'ACTIVITY', row.id, 'CREATED', dto.name);
    return this.getActivity(user, projectId, row.id);
  }

  async updateActivity(user: RequestUser, projectId: string, id: string, dto: UpdateActivityDto): Promise<ActivityDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const existing = await this.prisma.activity.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Activity not found');
    await this.assertChecklist(user, dto.checklistTemplateId);
    const data: Prisma.ActivityUncheckedUpdateInput = { ...(await this.treeLinks(projectId, id, dto, existing)) };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.plannedQty !== undefined) data.plannedQty = D(dto.plannedQty);
    if (dto.boqItemId !== undefined) data.boqItemId = dto.boqItemId;
    if (dto.plannedStart !== undefined) data.plannedStart = dto.plannedStart ? parseDate(dto.plannedStart) : null;
    if (dto.plannedEnd !== undefined) data.plannedEnd = dto.plannedEnd ? parseDate(dto.plannedEnd) : null;
    if (dto.responsibleId !== undefined) data.responsibleId = dto.responsibleId;
    if (dto.checklistTemplateId !== undefined) data.checklistTemplateId = dto.checklistTemplateId;
    if (dto.holdPoint !== undefined) data.holdPoint = dto.holdPoint;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    await this.prisma.$transaction(async (tx) => {
      await tx.activity.update({ where: { id }, data });
      // Sub-activities follow their activity into its component.
      if (data.workElementId !== undefined) await tx.activity.updateMany({ where: { parentActivityId: id }, data: { workElementId: data.workElementId as string | null } });
    });
    await this.audit.log(user, 'ACTIVITY', id, 'UPDATED');
    return this.getActivity(user, projectId, id);
  }

  private async assertChecklist(user: RequestUser, id: string | null | undefined) {
    if (id && !(await this.prisma.checklistTemplate.count({ where: { id, organizationId: user.organizationId } }))) throw new NotFoundException('Checklist not found');
  }

  async deleteActivity(user: RequestUser, projectId: string, id: string) {
    await this.access.assertCanAccessProject(user, projectId);
    if (await this.prisma.activity.count({ where: { parentActivityId: id, projectId } })) throw new ConflictException('This activity has sub-activities; delete or move them first');
    await this.prisma.activity.deleteMany({ where: { id, projectId } });
    await this.audit.log(user, 'ACTIVITY', id, 'DELETED');
    return { ok: true };
  }
}

const activityInclude = {
  boqItem: true,
  responsible: true,
  checklistTemplate: { select: { name: true } },
  workElement: { select: { code: true, name: true } },
  progressEntries: { where: { status: 'APPROVED' as const }, select: { quantity: true } },
} satisfies Prisma.ActivityInclude;
type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>;

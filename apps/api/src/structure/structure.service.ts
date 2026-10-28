import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { compareCodes, effectiveWeights, guessPipeStage, isPipeElement, nextCode, parentCodeOf, type LaidOutComponent, type ProjectUpdatePlan, type StructureActivityDto, type StructureDto, type WorkElementDto, type WorkElementType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { progressRollup } from '../common/progress';
import { dateOnly, dec, money } from '../common/serialize';
import { weightOf } from '../planning/planning.service';
import { ProjectTypesService } from '../templates/project-types.service';
import { CreateWorkElementDto, ImportWorkElementsDto, PlanLineDto, ReorderWorkElementsDto, UpdateWorkElementDto } from './structure.dto';

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
const MAX_SPECS = 12;

/** Specs are a few named numbers; anything else is dropped. */
const cleanSpecs = (specs: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull => {
  if (!specs) return Prisma.DbNull;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(specs).slice(0, MAX_SPECS)) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (/^[a-zA-Z]{1,30}$/.test(k) && typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return Object.keys(out).length ? out : Prisma.DbNull;
};

/**
 * A project's work breakdown (item 125, ARCHITECTURE "Work breakdown"): components and sub-components, the activities
 * and BOQ items under them, and progress rolled up through them (`rollUp` in @erp/shared). Activities themselves stay
 * in PlanningService; adding a component here can lay its template's activities out in one go.
 */
@Injectable()
export class StructureService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private types: ProjectTypesService) {}

  /** A component kind the company has (item 134): its kind of work is the kind's, whatever the form sent. */
  private async kindFor(organizationId: string, kindCode: string) {
    const kind = (await this.types.kinds(organizationId)).find((k) => k.code === kindCode);
    if (!kind) throw new BadRequestException(`Component kind ${kindCode} is not in the company's library; choose another kind`);
    return kind;
  }

  async get(user: RequestUser, projectId: string): Promise<StructureDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const [project, elements, activities, boqItems] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { contractModel: true } }),
      this.prisma.workElement.findMany({ where: { projectId } }),
      this.prisma.activity.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { boqItem: { select: { itemNo: true, rate: true } }, progressEntries: { where: { status: 'APPROVED' }, select: { quantity: true } } },
      }),
      this.prisma.boqItem.findMany({ where: { projectId, workElementId: { not: null } }, select: { workElementId: true, rate: true, originalQty: true, revisedQty: true } }),
    ]);
    const executed = new Map(activities.map((a) => [a.id, a.progressEntries.reduce((s, e) => s.add(e.quantity), D(0))]));
    const progressRows = activities.map((a) => ({ ...a, rate: a.boqItem?.rate ?? null, executed: executed.get(a.id)! }));
    const rolled = progressRollup(progressRows, elements);
    const weights = effectiveWeights(
      elements.map((e) => ({ id: e.id, parentId: e.parentId, weightPct: e.weightPct?.toNumber() ?? null })),
      activities.map((a) => ({ id: a.id, workElementId: a.workElementId, parentActivityId: a.parentActivityId, weightPct: a.weightPct?.toNumber() ?? null, plannedQty: 0, executedQty: 0, value: 0 })),
      rolled.value,
    );

    // BOQ amount per element, its sub-components' included.
    const ownAmount = new Map<string, Prisma.Decimal>();
    for (const b of boqItems) ownAmount.set(b.workElementId!, (ownAmount.get(b.workElementId!) ?? D(0)).add(b.rate.mul(b.revisedQty ?? b.originalQty)));
    const boqCount = new Map<string, number>();
    for (const b of boqItems) boqCount.set(b.workElementId!, (boqCount.get(b.workElementId!) ?? 0) + 1);
    const actCount = new Map<string, number>();
    for (const a of activities) if (a.workElementId) actCount.set(a.workElementId, (actCount.get(a.workElementId) ?? 0) + 1);
    const childrenOf = new Map<string | null, typeof elements>();
    const ids = new Set(elements.map((e) => e.id));
    for (const e of elements) {
      const key = e.parentId && ids.has(e.parentId) ? e.parentId : null;
      childrenOf.set(key, [...(childrenOf.get(key) ?? []), e]);
    }
    for (const list of childrenOf.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || compareCodes(a.code, b.code));
    const amountOf = (id: string): Prisma.Decimal => (childrenOf.get(id) ?? []).reduce((s, c) => s.add(amountOf(c.id)), ownAmount.get(id) ?? D(0));
    const ordered: typeof elements = [];
    const visit = (parent: string | null, depth: number) => {
      if (depth > 2) return;
      for (const e of childrenOf.get(parent) ?? []) {
        ordered.push(e);
        visit(e.id, depth + 1);
      }
    };
    visit(null, 0);

    const elementDtos: WorkElementDto[] = ordered.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      parentId: e.parentId,
      level: e.level,
      code: e.code,
      name: e.name,
      elementType: e.elementType,
      kindCode: e.kindCode,
      specs: (e.specs as Record<string, number> | null) ?? null,
      weightPct: e.weightPct?.toString() ?? null,
      effectiveWeightPct: weights.get(e.id) ?? 0,
      sortOrder: e.sortOrder,
      progressPct: rolled.pct.get(e.id) ?? 0,
      boqAmount: money(amountOf(e.id))!,
      activityCount: actCount.get(e.id) ?? 0,
      boqCount: boqCount.get(e.id) ?? 0,
    }));

    const actIds = new Set(activities.map((a) => a.id));
    const subsOf = new Map<string, typeof activities>();
    for (const a of activities) if (a.parentActivityId && actIds.has(a.parentActivityId)) subsOf.set(a.parentActivityId, [...(subsOf.get(a.parentActivityId) ?? []), a]);
    const orderedActs = activities.filter((a) => !a.parentActivityId || !actIds.has(a.parentActivityId)).flatMap((a) => [a, ...(subsOf.get(a.id) ?? [])]);
    const activityDtos: StructureActivityDto[] = orderedActs.map((a) => {
      const isSummary = rolled.summaries.has(a.id);
      return {
        id: a.id,
        name: a.name,
        unit: a.unit,
        workElementId: a.workElementId,
        parentActivityId: a.parentActivityId,
        weightPct: a.weightPct?.toString() ?? null,
        effectiveWeightPct: weights.get(a.id) ?? 0,
        plannedQty: dec(a.plannedQty)!,
        executedQty: dec(isSummary ? D(0) : executed.get(a.id)!)!,
        progressPct: rolled.pct.get(a.id) ?? 0,
        isSummary,
        boqItemNo: a.boqItem?.itemNo ?? null,
        plannedStart: dateOnly(a.plannedStart),
        plannedEnd: dateOnly(a.plannedEnd),
        sortOrder: a.sortOrder,
      };
    });

    const given = (childrenOf.get(null) ?? []).filter((e) => e.weightPct !== null);
    const total = given.reduce((s, e) => s + e.weightPct!.toNumber(), 0);
    return {
      projectId,
      contractModel: project.contractModel,
      progressPct: rolled.projectPct,
      elements: elementDtos,
      activities: activityDtos,
      componentWeightTotal: given.length && Math.abs(total - 100) > 0.01 ? Math.round(total * 1000) / 1000 : null,
    };
  }

  private async findElement(projectId: string, id: string) {
    const e = await this.prisma.workElement.findFirst({ where: { id, projectId } });
    if (!e) throw new NotFoundException('Component not found in this project');
    return e;
  }

  /** A parent is a component of the same project; sub-components hold activities, not further components. */
  private async parentFor(projectId: string, parentId: string | null | undefined, selfId?: string) {
    if (!parentId) return null;
    if (parentId === selfId) throw new BadRequestException('A component cannot sit inside itself');
    const parent = await this.findElement(projectId, parentId);
    if (parent.level !== 'COMPONENT') throw new BadRequestException(`${parent.code} ${parent.name} is a sub-component; choose a component to put it in`);
    return parent;
  }

  async createElement(user: RequestUser, projectId: string, dto: CreateWorkElementDto): Promise<StructureDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const parent = await this.parentFor(projectId, dto.parentId);
    const lines = dto.activities ?? [];
    this.checkPlan(lines);
    const kind = dto.kindCode ? await this.kindFor(user.organizationId, dto.kindCode) : null;
    const made = await this.prisma.$transaction((tx) => this.insertElement(tx, user, projectId, parent, { ...dto, elementType: kind?.elementType ?? dto.elementType, kindCode: kind?.code ?? null }, lines));
    await this.audit.log(user, 'WORK_ELEMENT', made.id, 'CREATED', `${made.code} ${dto.name.trim()}${lines.length ? `, ${lines.length} activities` : ''}`);
    return this.get(user, projectId);
  }

  /**
   * The components a new project lays out from its type's starting breakdown (item 134, `layOutBreakdown`), each with its
   * kind's activities. Runs inside the project's creation, so no access check: the creator may not be on the project.
   */
  async layOutUnchecked(user: RequestUser, projectId: string, components: LaidOutComponent[], db: Prisma.TransactionClient = this.prisma): Promise<number> {
    const made = new Map<string, { id: string; code: string }>();
    let activities = 0;
    for (const c of components) {
      const parent = c.parentKey ? made.get(c.parentKey) ?? null : null;
      if (c.parentKey && !parent) continue;
      const lines = c.activities.map((l) => ({ key: l.key, parentKey: l.parentKey, name: l.name, unit: l.unit, weightPct: String(l.weightPct), plannedQty: l.qty !== null ? String(l.qty) : null }));
      const row = await this.insertElement(db, user, projectId, parent, { name: c.name, elementType: c.elementType, kindCode: c.kind, specs: c.specs, weightPct: c.weightPct !== null ? String(c.weightPct) : null }, lines);
      made.set(c.key, row);
      activities += lines.length;
    }
    if (made.size)
      await db.auditLog.create({
        data: { organizationId: user.organizationId, entityType: 'PROJECT', entityId: projectId, action: 'BREAKDOWN_LAID_OUT', actorId: user.id, note: `${made.size} components, ${activities} activities from the project type` },
      });
    return made.size;
  }

  /**
   * What a project gains from its type or a kind (item 134 part 3, `projectUpdatePlan`): new components, each with its
   * kind's activities, sub-components under the project's own components, and new steps under them. It only adds; an
   * update run's caller checks the admin's rights and writes the audit. Returns how many components and activities it made.
   */
  async addFromPlanUnchecked(user: RequestUser, projectId: string, plan: ProjectUpdatePlan, db: Prisma.TransactionClient): Promise<{ components: number; activities: number }> {
    const made = new Map<string, { id: string; code: string }>();
    let activities = 0;
    for (const c of plan.components) {
      const parent = c.parentId ? await db.workElement.findFirst({ where: { id: c.parentId, projectId, level: 'COMPONENT' }, select: { id: true, code: true } }) : c.parentKey ? made.get(c.parentKey) ?? null : null;
      if ((c.parentId || c.parentKey) && !parent) continue;
      const lines = c.activities.map((l) => ({ key: l.key, parentKey: l.parentKey, name: l.name, unit: l.unit, weightPct: String(l.weightPct), plannedQty: l.qty !== null ? String(l.qty) : null }));
      made.set(c.key, await this.insertElement(db, user, projectId, parent, { name: c.name, elementType: c.elementType, kindCode: c.kind, specs: c.specs, weightPct: c.weightPct !== null ? String(c.weightPct) : null }, lines));
      activities += lines.length;
    }
    const last = await db.activity.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    let sortOrder = (last._max.sortOrder ?? 0) + 1;
    const newIds = new Map<string, string>();
    const elements = new Map((await db.workElement.findMany({ where: { projectId, id: { in: [...new Set(plan.activities.map((a) => a.elementId))] } }, select: { id: true, elementType: true } })).map((e) => [e.id, e]));
    // Activities first, then their sub-activities, so every parent exists when its parts are made.
    for (const a of [...plan.activities.filter((x) => !x.parentKey), ...plan.activities.filter((x) => x.parentKey)]) {
      const element = elements.get(a.elementId);
      const parentActivityId = a.parentKey ? newIds.get(`${a.elementId}:${a.parentKey}`) : a.parentActivityId;
      if (!element || (a.parentKey && !parentActivityId)) continue;
      if (parentActivityId && !a.parentKey && !(await db.activity.findFirst({ where: { id: parentActivityId, projectId, workElementId: a.elementId }, select: { id: true } }))) continue;
      const row = await db.activity.create({
        data: {
          organizationId: user.organizationId,
          projectId,
          workElementId: a.elementId,
          parentActivityId: parentActivityId ?? null,
          name: a.name.trim(),
          unit: a.unit.trim(),
          plannedQty: a.qty !== null ? D(a.qty) : D(0),
          weightPct: weightOf(a.weightPct !== null ? String(a.weightPct) : null),
          pipeStage: isPipeElement(element.elementType) ? guessPipeStage(a.name) : null,
          sortOrder: sortOrder++,
        },
        select: { id: true },
      });
      newIds.set(`${a.elementId}:${a.key}`, row.id);
      activities++;
    }
    return { components: made.size, activities };
  }

  /** One component or sub-component with its plan's activities: numbered after its siblings, activities after the project's last. */
  private async insertElement(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    projectId: string,
    parent: { id: string; code: string } | null,
    dto: { code?: string; name: string; elementType: WorkElementType; kindCode: string | null; specs?: Record<string, unknown> | null; weightPct?: string | null },
    lines: PlanLineDto[],
  ): Promise<{ id: string; code: string }> {
    const siblings = await tx.workElement.findMany({ where: { projectId }, select: { code: true, parentId: true, sortOrder: true } });
    const code = dto.code?.trim() || nextCode(parent?.code ?? null, siblings.map((s) => s.code));
    if (siblings.some((s) => s.code === code)) throw new ConflictException(`Number ${code} is already used in this breakdown`);
    const sortOrder = Math.max(0, ...siblings.filter((s) => s.parentId === (parent?.id ?? null)).map((s) => s.sortOrder + 1));
    const lastActivity = await tx.activity.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const firstSort = (lastActivity._max.sortOrder ?? 0) + 1;
    const element = await tx.workElement.create({
      data: {
        organizationId: user.organizationId,
        projectId,
        parentId: parent?.id ?? null,
        level: parent ? 'SUB_COMPONENT' : 'COMPONENT',
        code,
        name: dto.name.trim(),
        elementType: dto.elementType,
        kindCode: dto.kindCode,
        specs: cleanSpecs(dto.specs),
        weightPct: weightOf(dto.weightPct),
        sortOrder,
      },
    });
    const idOf = new Map<string, string>();
    // Activities first, then their sub-activities, so every parent exists when its parts are made.
    const ordered = [...lines.filter((l) => !l.parentKey), ...lines.filter((l) => l.parentKey)];
    for (const line of ordered) {
      const row = await tx.activity.create({
        data: {
          organizationId: user.organizationId,
          projectId,
          workElementId: element.id,
          parentActivityId: line.parentKey ? idOf.get(line.parentKey)! : null,
          name: line.name.trim(),
          unit: line.unit.trim(),
          plannedQty: line.plannedQty ? D(line.plannedQty) : D(0),
          weightPct: weightOf(line.weightPct),
          // A pipe zone's or main's stages (item 126): its lines name a segment of the zone's network.
          pipeStage: isPipeElement(dto.elementType) ? guessPipeStage(line.name) : null,
          sortOrder: firstSort + lines.indexOf(line),
        },
        select: { id: true },
      });
      idOf.set(line.key, row.id);
    }
    return { id: element.id, code };
  }

  /** Keys are unique, a sub-activity's activity is in the plan and is not itself a sub-activity, quantities are not negative. */
  private checkPlan(lines: PlanLineDto[]) {
    const keys = new Set<string>();
    for (const l of lines) {
      if (keys.has(l.key)) throw new BadRequestException(`Line ${l.key} appears twice`);
      keys.add(l.key);
    }
    const top = new Set(lines.filter((l) => !l.parentKey).map((l) => l.key));
    for (const l of lines) {
      if (l.parentKey && !top.has(l.parentKey)) throw new BadRequestException(`${l.name}: its activity is not in the list`);
      if (l.plannedQty && D(l.plannedQty).lt(0)) throw new BadRequestException(`${l.name}: the planned quantity cannot be negative`);
      weightOf(l.weightPct);
    }
  }

  async updateElement(user: RequestUser, projectId: string, id: string, dto: UpdateWorkElementDto): Promise<StructureDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const current = await this.findElement(projectId, id);
    const data: Prisma.WorkElementUncheckedUpdateInput = {};
    if (dto.parentId !== undefined && dto.parentId !== current.parentId) {
      const parent = await this.parentFor(projectId, dto.parentId, id);
      if (parent && (await this.prisma.workElement.count({ where: { parentId: id } }))) throw new BadRequestException('This component has sub-components of its own; move them out first');
      data.parentId = parent?.id ?? null;
      data.level = parent ? 'SUB_COMPONENT' : 'COMPONENT';
    }
    if (dto.code !== undefined && dto.code.trim() !== current.code) {
      if (await this.prisma.workElement.count({ where: { projectId, code: dto.code.trim(), NOT: { id } } })) throw new ConflictException(`Number ${dto.code.trim()} is already used in this breakdown`);
      data.code = dto.code.trim();
    }
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.elementType !== undefined) data.elementType = dto.elementType;
    if (dto.kindCode !== undefined) {
      const kind = dto.kindCode ? await this.kindFor(user.organizationId, dto.kindCode) : null;
      data.kindCode = kind?.code ?? null;
      if (kind) data.elementType = kind.elementType;
    }
    if (dto.specs !== undefined) data.specs = cleanSpecs(dto.specs);
    if (dto.weightPct !== undefined) data.weightPct = weightOf(dto.weightPct);
    await this.prisma.workElement.update({ where: { id }, data });
    await this.audit.log(user, 'WORK_ELEMENT', id, 'UPDATED');
    return this.get(user, projectId);
  }

  /** Deleting a component deletes its sub-components; their activities and BOQ items stay, outside the breakdown. */
  async deleteElement(user: RequestUser, projectId: string, id: string): Promise<StructureDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const e = await this.findElement(projectId, id);
    await this.prisma.workElement.delete({ where: { id } });
    await this.audit.log(user, 'WORK_ELEMENT', id, 'DELETED', `${e.code} ${e.name}`);
    return this.get(user, projectId);
  }

  async reorder(user: RequestUser, projectId: string, dto: ReorderWorkElementsDto): Promise<StructureDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.workElement.findMany({ where: { projectId, id: { in: dto.ids } }, select: { id: true, parentId: true } });
    if (rows.length !== new Set(dto.ids).size) throw new NotFoundException('Component not found in this project');
    if (new Set(rows.map((r) => r.parentId)).size > 1) throw new BadRequestException('Reorder the components of one level at a time');
    await this.prisma.$transaction(dto.ids.map((id, i) => this.prisma.workElement.update({ where: { id }, data: { sortOrder: i } })));
    await this.audit.log(user, 'PROJECT', projectId, 'BREAKDOWN_REORDERED');
    return this.get(user, projectId);
  }

  /**
   * Excel import: rows of outline number, name, kind and weight. "3.2" goes under "3" (in the file or already in the
   * project); numbers already used are skipped, and so is a row whose parent cannot be found or is a sub-component.
   */
  async importElements(user: RequestUser, projectId: string, dto: ImportWorkElementsDto) {
    await this.access.assertCanAccessProject(user, projectId);
    const existing = await this.prisma.workElement.findMany({ where: { projectId }, select: { id: true, code: true, level: true } });
    const byCode = new Map(existing.map((e) => [e.code, e]));
    const rows = [...dto.rows].map((r) => ({ ...r, code: r.code.trim() })).sort((a, b) => a.code.split('.').length - b.code.split('.').length || compareCodes(a.code, b.code));
    let created = 0;
    const skipped: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const [i, r] of rows.entries()) {
        if (byCode.has(r.code)) {
          skipped.push(`${r.code}: already in the breakdown`);
          continue;
        }
        const parentCode = parentCodeOf(r.code);
        const parent = parentCode ? byCode.get(parentCode) : undefined;
        if (parentCode && (!parent || parent.level !== 'COMPONENT')) {
          skipped.push(`${r.code}: no component ${parentCode} to put it in`);
          continue;
        }
        const row = await tx.workElement.create({
          data: {
            organizationId: user.organizationId,
            projectId,
            parentId: parent?.id ?? null,
            level: parent ? 'SUB_COMPONENT' : 'COMPONENT',
            code: r.code,
            name: r.name.trim(),
            elementType: r.elementType ?? 'GENERAL',
            weightPct: weightOf(r.weightPct),
            sortOrder: i,
          },
          select: { id: true, code: true, level: true },
        });
        byCode.set(row.code, row);
        created++;
      }
    });
    await this.audit.log(user, 'PROJECT', projectId, 'BREAKDOWN_IMPORTED', `${created} components`);
    return { created, skipped };
  }
}

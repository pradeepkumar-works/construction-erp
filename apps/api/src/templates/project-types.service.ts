import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  STANDARD_COMPONENT_KINDS,
  STANDARD_PROJECT_TYPES,
  canManageTemplates,
  componentKindProblems,
  kindFrom,
  overlay,
  projectFeatures,
  projectTypeProblems,
  templateSpan,
  typeCodeOf,
  type ActivityTemplateItem,
  type ComponentKindDef,
  type ComponentKindDto,
  type ComponentStep,
  type ElementSpecField,
  type ProjectType,
  type ProjectTypeDef,
  type ProjectTypeDto,
  type StartComponent,
  type WorkLocation,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { iso } from '../common/serialize';
import { ComponentStepDto, NewComponentKindDto, NewProjectTypeDto, SaveComponentKindDto, SaveProjectTypeDto, StepPartDto } from './project-types.dto';

type Db = Prisma.TransactionClient;

const partOf = (p: StepPartDto) => ({ name: p.name, unit: p.unit, weightPct: p.weightPct, ...(p.qtyFrom ? { qtyFrom: p.qtyFrom } : {}), ...(p.lumpSum ? { lumpSum: true } : {}) });
/** A step as the API took it, with only the fields its kind of step has. */
const stepOf = (s: ComponentStepDto): ComponentStep => {
  const parts = s.parts?.length ? { parts: s.parts.map(({ name, unit, weightPct }) => ({ name, unit, weightPct })) } : {};
  if (s.kind === 'rcc') return { kind: 'rcc', name: s.name, weightPct: s.weightPct, ...parts };
  if (s.kind === 'lifts') return { kind: 'lifts', name: s.name, weightPct: s.weightPct, over: s.over ?? '', ...parts };
  if (s.kind === 'group') return { kind: 'group', name: s.name, unit: s.unit ?? '', weightPct: s.weightPct, subs: (s.subs ?? []).map(partOf) };
  return { kind: 'plain', ...partOf({ name: s.name, unit: s.unit ?? '', weightPct: s.weightPct, qtyFrom: s.qtyFrom, lumpSum: s.lumpSum }) };
};
const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Project types and component kinds (item 134, ARCHITECTURE "Project types"). The standard ones are data in
 * @erp/shared; a company's row of the same code replaces one, and its own codes add to them, so nothing is seeded and
 * a company that never opens Admin › Project types keeps today's behaviour. Loose activities stay `ActivityTemplate`
 * rows, now keyed by the type's code.
 */
@Injectable()
export class ProjectTypesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /* ---------- reading ---------- */

  /** The company's component kinds: the built-in ones (or its copies) and its own. */
  async kinds(organizationId: string, db: Db = this.prisma) {
    const rows = await db.componentKind.findMany({ where: { organizationId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { updatedBy: { select: { fullName: true } } } });
    const own = rows.map((r) => ({ ...this.kindDef(r), row: r }));
    return overlay<ComponentKindDef & { row?: (typeof rows)[number] }>(STANDARD_COMPONENT_KINDS, own);
  }

  private kindDef(r: { code: string; name: string; elementType: ComponentKindDef['elementType']; specFields: Prisma.JsonValue; steps: Prisma.JsonValue; active: boolean }): ComponentKindDef {
    return { code: r.code, name: r.name, elementType: r.elementType, specFields: (r.specFields as unknown as ElementSpecField[]) ?? [], steps: (r.steps as unknown as ComponentStep[]) ?? [], active: r.active };
  }

  /** The company's project types without their activities: the standard ones (or its copies) and its own. */
  async typeRows(organizationId: string, db: Db = this.prisma) {
    const rows = await db.projectTypeConfig.findMany({ where: { organizationId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { updatedBy: { select: { fullName: true } } } });
    const own = rows.map((r) => ({ ...this.typeDef(r), row: r }));
    return overlay<ProjectTypeDef & { row?: (typeof rows)[number] }>(STANDARD_PROJECT_TYPES, own);
  }

  private typeDef(r: { code: string; name: string; baseType: ProjectType; description: string | null; locations: WorkLocation[]; pipeNetwork: boolean; contractModel: ProjectTypeDef['contractModel']; kinds: string[]; breakdown: Prisma.JsonValue; active: boolean }): ProjectTypeDef {
    const std = STANDARD_PROJECT_TYPES.find((s) => s.code === r.code);
    return {
      code: r.code,
      name: r.name,
      baseType: r.baseType,
      description: r.description ?? '',
      locations: r.locations,
      pipeNetwork: r.pipeNetwork,
      contractModel: r.contractModel,
      kinds: r.kinds,
      breakdown: (r.breakdown as unknown as StartComponent[]) ?? [],
      // Filled from the activity rows by `withActivities`; a standard type's own list until then.
      activities: std?.activities ?? [],
      active: r.active,
    };
  }

  /** A type's loose activities: the company's rows for its code, else the standard type's list. */
  async activities(organizationId: string, code: string, db: Db = this.prisma): Promise<{ isDefault: boolean; items: ActivityTemplateItem[] }> {
    const rows = await db.activityTemplate.findMany({ where: { organizationId, typeCode: code }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    if (rows.length) return { isDefault: false, items: rows.map((r) => ({ name: r.name, unit: r.unit, startDay: r.startDay, durationDays: r.durationDays })) };
    return { isDefault: true, items: STANDARD_PROJECT_TYPES.find((s) => s.code === code)?.activities ?? [] };
  }

  /** One type in full, or null when the company has no type of that code. */
  async type(organizationId: string, code: string, db: Db = this.prisma): Promise<ProjectTypeDef | null> {
    const t = (await this.typeRows(organizationId, db)).find((x) => x.code === code);
    if (!t) return null;
    const { row: _row, standard: _s, edited: _e, ...def } = t;
    return { ...def, activities: (await this.activities(organizationId, code, db)).items };
  }

  /** The type a project belongs to (its own code, else its kind's standard type), with its version; null for a store or plant. */
  async typeOfProject(organizationId: string, project: { type: ProjectType; typeCode: string | null }, db: Db = this.prisma) {
    const code = typeCodeOf(project);
    return code ? this.type(organizationId, code, db) : null;
  }

  /**
   * What each project's type turns on, and its name, for a list of projects in one read (project lists and pages).
   * A project whose type was deleted falls back to its built-in kind.
   */
  async featuresOf(organizationId: string, projects: { id: string; type: ProjectType; typeCode: string | null }[]) {
    const types = projects.length ? new Map((await this.typeRows(organizationId)).map((t) => [t.code, t])) : new Map();
    return new Map(
      projects.map((p) => {
        const code = typeCodeOf(p);
        const t = code ? types.get(code) : undefined;
        return [p.id, { typeCode: t ? code : null, typeName: t?.name ?? null, ...projectFeatures(p.type, t) }] as const;
      }),
    );
  }

  /* ---------- project types ---------- */

  async list(user: RequestUser): Promise<ProjectTypeDto[]> {
    const [types, counts, saved] = await Promise.all([
      this.typeRows(user.organizationId),
      this.prisma.project.groupBy({ by: ['type', 'typeCode'], where: { organizationId: user.organizationId }, _count: { _all: true } }),
      this.prisma.activityTemplate.groupBy({ by: ['typeCode'], where: { organizationId: user.organizationId }, _count: { _all: true } }),
    ]);
    const used = new Map<string, number>();
    for (const c of counts) {
      const code = typeCodeOf(c);
      if (code) used.set(code, (used.get(code) ?? 0) + c._count._all);
    }
    const hasRows = new Set(saved.map((s) => s.typeCode));
    return Promise.all(
      types.map(async (t) => {
        const acts = hasRows.has(t.code) ? (await this.activities(user.organizationId, t.code)).items : t.activities;
        return this.dto(t, acts, used.get(t.code) ?? 0, hasRows.has(t.code));
      }),
    );
  }

  private dto(t: Awaited<ReturnType<ProjectTypesService['typeRows']>>[number], activities: ActivityTemplateItem[], projects: number, ownActivities: boolean): ProjectTypeDto {
    const { row, ...def } = t;
    return {
      ...def,
      activities,
      edited: t.edited || ownActivities,
      version: row?.version ?? 1,
      projects,
      updatedAt: iso(row?.updatedAt ?? null),
      updatedByName: row?.updatedBy?.fullName ?? null,
      spanDays: templateSpan(activities),
    };
  }

  async get(user: RequestUser, code: string): Promise<ProjectTypeDto> {
    const found = (await this.list(user)).find((t) => t.code === code);
    if (!found) throw new NotFoundException('Project type not found');
    return found;
  }

  private assertManage(user: RequestUser) {
    if (!canManageTemplates(user.roleKey)) throw new ForbiddenException('Only admin or management can change project types');
  }

  /** A new type of the company's own, built on a kind: a copy of another type, else empty. */
  async create(user: RequestUser, dto: NewProjectTypeDto): Promise<ProjectTypeDto> {
    this.assertManage(user);
    const code = dto.code.trim().toUpperCase();
    const types = await this.typeRows(user.organizationId);
    if (types.some((t) => t.code === code)) throw new ConflictException(`A type with code ${code} already exists`);
    const from = dto.copyFrom ? await this.type(user.organizationId, dto.copyFrom) : null;
    if (dto.copyFrom && !from) throw new NotFoundException('The type to copy was not found');
    const base = projectFeatures(dto.baseType, null);
    const def: ProjectTypeDef = from
      ? { ...from, code, name: dto.name.trim(), description: dto.description?.trim() ?? from.description, active: true }
      : { code, name: dto.name.trim(), baseType: dto.baseType, description: dto.description?.trim() ?? '', ...base, contractModel: 'ITEM_RATE', kinds: [], breakdown: [], activities: [], active: true };
    await this.write(user, def, types.length + 1);
    await this.audit.log(user, 'PROJECT_TYPE', code, 'CREATED', from ? `${def.name}, copied from ${from.name}` : def.name);
    return this.get(user, code);
  }

  /** Save the whole type: details, breakdown and loose activities. A standard type gets the company's own copy. */
  async save(user: RequestUser, code: string, dto: SaveProjectTypeDto): Promise<ProjectTypeDto> {
    this.assertManage(user);
    const types = await this.typeRows(user.organizationId);
    const current = types.find((t) => t.code === code);
    if (!current) throw new NotFoundException('Project type not found');
    const def: ProjectTypeDef = {
      code,
      name: dto.name.trim(),
      baseType: dto.baseType,
      description: dto.description?.trim() ?? '',
      locations: [...new Set(dto.locations)],
      pipeNetwork: dto.pipeNetwork,
      contractModel: dto.contractModel,
      kinds: [...new Set(dto.kinds)],
      breakdown: dto.breakdown.map((b) => ({ key: b.key, parentKey: b.parentKey ?? null, kind: b.kind, name: b.name.trim(), count: b.count, specs: b.specs ?? null, weightPct: b.weightPct ?? null })),
      activities: dto.activities ? dto.activities.map((a) => ({ name: a.name.trim(), unit: a.unit.trim(), startDay: a.startDay, durationDays: a.durationDays })) : (await this.activities(user.organizationId, code)).items,
      active: dto.active,
    };
    if (def.baseType !== current.baseType) {
      const used = await this.prisma.project.count({ where: { organizationId: user.organizationId, OR: [{ typeCode: code }, ...(current.standard ? [{ typeCode: null, type: current.baseType }] : [])] } });
      if (used) throw new BadRequestException(`${used} project${used === 1 ? '' : 's'} use this type, so what it is built on cannot change; make a new type instead`);
    }
    const problems = projectTypeProblems(def, (await this.kinds(user.organizationId)).filter((k) => k.active || def.kinds.includes(k.code) || def.breakdown.some((b) => b.kind === k.code)));
    if (problems.length) throw new BadRequestException(problems.join('. '));
    await this.write(user, def, current.row?.sortOrder ?? types.indexOf(current) + 1, current.row?.version, !!dto.activities);
    await this.audit.log(user, 'PROJECT_TYPE', code, 'UPDATED', `${def.name}: ${def.breakdown.length} components, ${def.activities.length} activities`);
    return this.get(user, code);
  }

  /** `activities` false leaves the type's activity rows alone (a standard type keeps following the standard list). */
  private async write(user: RequestUser, def: ProjectTypeDef, sortOrder: number, version?: number, activities = true) {
    const data = {
      name: def.name,
      baseType: def.baseType,
      description: def.description || null,
      locations: def.locations,
      pipeNetwork: def.pipeNetwork,
      contractModel: def.contractModel,
      kinds: def.kinds,
      breakdown: json(def.breakdown),
      active: def.active,
      updatedById: user.id,
    };
    await this.prisma.$transaction([
      this.prisma.projectTypeConfig.upsert({
        where: { organizationId_code: { organizationId: user.organizationId, code: def.code } },
        create: { organizationId: user.organizationId, code: def.code, sortOrder, ...data },
        update: { ...data, version: (version ?? 1) + 1 },
      }),
      ...(activities
        ? [
            this.prisma.activityTemplate.deleteMany({ where: { organizationId: user.organizationId, typeCode: def.code } }),
            this.prisma.activityTemplate.createMany({
              data: def.activities.map((a, i) => ({ organizationId: user.organizationId, projectType: def.baseType, typeCode: def.code, name: a.name, unit: a.unit, startDay: a.startDay, durationDays: a.durationDays, sortOrder: i + 1 })),
            }),
          ]
        : [this.prisma.activityTemplate.updateMany({ where: { organizationId: user.organizationId, typeCode: def.code }, data: { projectType: def.baseType } })]),
    ]);
  }

  /**
   * A type from a file (item 134 part 3, `TypeBundleService`): a new one, or a new version of the company's own. It goes
   * through the editor's checks against `kinds` (the company's, with the file's being imported); the caller has decided
   * it may (`importAction`).
   */
  async putType(user: RequestUser, def: ProjectTypeDef, kinds: Pick<ComponentKindDef, 'code'>[]) {
    this.assertManage(user);
    const problems = projectTypeProblems(def, kinds);
    if (problems.length) throw new BadRequestException(`${def.name || def.code}: ${problems.join('. ')}`);
    const types = await this.typeRows(user.organizationId);
    const current = types.find((t) => t.code === def.code);
    await this.write(user, def, current?.row?.sortOrder ?? (current ? types.indexOf(current) + 1 : types.length + 1), current?.row?.version);
    await this.audit.log(user, 'PROJECT_TYPE', def.code, current ? 'IMPORTED_OVER' : 'IMPORTED', `${def.name}: ${def.breakdown.length} components, ${def.activities.length} activities`);
  }

  /**
   * A standard type goes back to the standard one (the company's copy and activities removed). A type of the company's
   * own is deleted while no project uses it; once one does, it can only be archived.
   */
  async remove(user: RequestUser, code: string): Promise<{ reset: boolean }> {
    this.assertManage(user);
    const t = (await this.typeRows(user.organizationId)).find((x) => x.code === code);
    if (!t) throw new NotFoundException('Project type not found');
    if (!t.standard) {
      const used = await this.prisma.project.count({ where: { organizationId: user.organizationId, typeCode: code } });
      if (used) throw new BadRequestException(`${used} project${used === 1 ? '' : 's'} use this type; archive it instead, which hides it from New project`);
    }
    await this.prisma.$transaction([
      this.prisma.projectTypeConfig.deleteMany({ where: { organizationId: user.organizationId, code } }),
      this.prisma.activityTemplate.deleteMany({ where: { organizationId: user.organizationId, typeCode: code } }),
    ]);
    await this.audit.log(user, 'PROJECT_TYPE', code, t.standard ? 'RESET' : 'DELETED', t.name);
    return { reset: t.standard };
  }

  /* ---------- component kinds ---------- */

  async listKinds(user: RequestUser): Promise<ComponentKindDto[]> {
    const [kinds, counts] = await Promise.all([
      this.kinds(user.organizationId),
      this.prisma.workElement.groupBy({ by: ['kindCode', 'elementType'], where: { organizationId: user.organizationId }, _count: { _all: true } }),
    ]);
    const used = new Map<string, number>();
    // A component made before item 134 counts towards the built-in kind of its element type.
    for (const c of counts) used.set(c.kindCode ?? c.elementType, (used.get(c.kindCode ?? c.elementType) ?? 0) + c._count._all);
    return kinds.map(({ row, ...k }) => ({ ...k, version: row?.version ?? 1, components: used.get(k.code) ?? 0, updatedAt: iso(row?.updatedAt ?? null) }));
  }

  async createKind(user: RequestUser, dto: NewComponentKindDto): Promise<ComponentKindDto[]> {
    this.assertManage(user);
    const code = dto.code.trim().toUpperCase();
    const kinds = await this.kinds(user.organizationId);
    if (kinds.some((k) => k.code === code)) throw new ConflictException(`A component kind with code ${code} already exists`);
    const from = dto.copyFrom ? kinds.find((k) => k.code === dto.copyFrom) : null;
    if (dto.copyFrom && !from) throw new NotFoundException('The kind to copy was not found');
    const def: ComponentKindDef = from ? { ...from, code, name: dto.name.trim(), active: true } : kindFrom(code, dto.name.trim(), dto.elementType);
    const problems = componentKindProblems(def);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    await this.prisma.componentKind.create({ data: { organizationId: user.organizationId, ...this.kindData(def), sortOrder: kinds.length + 1, updatedById: user.id } });
    await this.audit.log(user, 'COMPONENT_KIND', code, 'CREATED', from ? `${def.name}, copied from ${from.name}` : def.name);
    return this.listKinds(user);
  }

  private kindData(def: ComponentKindDef) {
    return { code: def.code, name: def.name, elementType: def.elementType, specFields: json(def.specFields), steps: json(def.steps), active: def.active };
  }

  async saveKind(user: RequestUser, code: string, dto: SaveComponentKindDto): Promise<ComponentKindDto[]> {
    this.assertManage(user);
    const kinds = await this.kinds(user.organizationId);
    const current = kinds.find((k) => k.code === code);
    if (!current) throw new NotFoundException('Component kind not found');
    const def: ComponentKindDef = { code, name: dto.name.trim(), elementType: dto.elementType, specFields: dto.specFields.map((f) => ({ key: f.key, label: f.label, unit: f.unit, ...(f.default !== undefined ? { default: f.default } : {}) })), steps: dto.steps.map(stepOf), active: dto.active };
    if (def.elementType !== current.elementType) {
      const used = await this.prisma.workElement.count({ where: { organizationId: user.organizationId, OR: [{ kindCode: code }, ...(current.standard ? [{ kindCode: null, elementType: current.elementType }] : [])] } });
      if (used) throw new BadRequestException(`${used} component${used === 1 ? '' : 's'} were laid out from this kind, so what it is built on cannot change; make a new kind instead`);
    }
    const problems = componentKindProblems(def);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    await this.prisma.componentKind.upsert({
      where: { organizationId_code: { organizationId: user.organizationId, code } },
      create: { organizationId: user.organizationId, ...this.kindData(def), sortOrder: kinds.indexOf(current) + 1, updatedById: user.id },
      update: { ...this.kindData(def), version: (current.row?.version ?? 1) + 1, updatedById: user.id },
    });
    await this.audit.log(user, 'COMPONENT_KIND', code, 'UPDATED', `${def.name}: ${def.steps.length} steps`);
    return this.listKinds(user);
  }

  /** A component kind from a file (item 134 part 3): a new one, or a new version of the company's copy or its own. */
  async putKind(user: RequestUser, def: ComponentKindDef) {
    this.assertManage(user);
    const problems = componentKindProblems(def);
    if (problems.length) throw new BadRequestException(`${def.name || def.code}: ${problems.join('. ')}`);
    const kinds = await this.kinds(user.organizationId);
    const current = kinds.find((k) => k.code === def.code);
    await this.prisma.componentKind.upsert({
      where: { organizationId_code: { organizationId: user.organizationId, code: def.code } },
      create: { organizationId: user.organizationId, ...this.kindData(def), sortOrder: current ? kinds.indexOf(current) + 1 : kinds.length + 1, updatedById: user.id },
      update: { ...this.kindData(def), version: (current?.row?.version ?? 1) + 1, updatedById: user.id },
    });
    await this.audit.log(user, 'COMPONENT_KIND', def.code, current ? 'IMPORTED_OVER' : 'IMPORTED', `${def.name}: ${def.steps.length} steps`);
  }

  /** A built-in kind goes back to the built-in steps; a kind of the company's own is deleted while no component or type uses it. */
  async removeKind(user: RequestUser, code: string): Promise<ComponentKindDto[]> {
    this.assertManage(user);
    const k = (await this.kinds(user.organizationId)).find((x) => x.code === code);
    if (!k) throw new NotFoundException('Component kind not found');
    if (!k.standard) {
      const used = await this.prisma.workElement.count({ where: { organizationId: user.organizationId, kindCode: code } });
      if (used) throw new BadRequestException(`${used} component${used === 1 ? '' : 's'} were laid out from this kind; archive it instead`);
      const inTypes = (await this.typeRows(user.organizationId)).filter((t) => t.kinds.includes(code) || t.breakdown.some((b) => b.kind === code));
      if (inTypes.length) throw new BadRequestException(`${inTypes.map((t) => t.name).join(', ')} use${inTypes.length === 1 ? 's' : ''} this kind; take it out of ${inTypes.length === 1 ? 'that type' : 'those types'} first`);
    }
    await this.prisma.componentKind.deleteMany({ where: { organizationId: user.organizationId, code } });
    await this.audit.log(user, 'COMPONENT_KIND', code, k.standard ? 'RESET' : 'DELETED', k.name);
    return this.listKinds(user);
  }
}

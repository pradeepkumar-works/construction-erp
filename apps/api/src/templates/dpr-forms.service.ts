import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canManageTemplates,
  dprFormChangeProblems,
  dprFormProblems,
  normaliseDprForm,
  standardDprForm,
  typeCodeOf,
  type DprFormDef,
  type DprFormDto,
  type DprFormVersionsDto,
  type ProjectType,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { iso } from '../common/serialize';
import { ProjectTypesService } from './project-types.service';

type Db = Prisma.TransactionClient;
const include = { createdBy: { select: { fullName: true } } } satisfies Prisma.DprFormConfigInclude;
type Row = Prisma.DprFormConfigGetPayload<{ include: typeof include }>;

/**
 * The DPR form of each project type (ARCHITECTURE "DPR form per project type"). A save adds a version
 * and never changes one, so a report keeps the form it was made on; a type with no saved version uses its standard form
 * from @erp/shared. A new report is made on its project type's latest version.
 */
@Injectable()
export class DprFormsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private types: ProjectTypesService) {}

  private dto(r: Row): DprFormDto {
    return { id: r.id, typeCode: r.typeCode, version: r.version, standard: false, def: normaliseDprForm(r.definition), createdAt: iso(r.createdAt), createdByName: r.createdBy?.fullName ?? null };
  }

  private standard(typeCode: string, baseType: ProjectType | null): DprFormDto {
    return { id: null, typeCode, version: 0, standard: true, def: normaliseDprForm(standardDprForm(typeCode, baseType)), createdAt: null, createdByName: null };
  }

  /** A type's latest saved version, else its standard form. */
  async latest(organizationId: string, typeCode: string, baseType: ProjectType | null, db: Db = this.prisma): Promise<DprFormDto> {
    const row = await db.dprFormConfig.findFirst({ where: { organizationId, typeCode }, orderBy: { version: 'desc' }, include });
    return row ? this.dto(row) : this.standard(typeCode, baseType);
  }

  /** The form a new report of the project is made on: its type's latest. A plant or store has the plain standard form. */
  async forProject(organizationId: string, project: { type: ProjectType; typeCode: string | null }, db: Db = this.prisma): Promise<DprFormDto> {
    return this.latest(organizationId, typeCodeOf(project) ?? '', project.type, db);
  }

  /** The form a report was made on: its saved version, else its project type's standard form. */
  async ofReport(organizationId: string, formId: string | null, project: { type: ProjectType; typeCode: string | null }): Promise<DprFormDto> {
    if (formId) {
      const row = await this.prisma.dprFormConfig.findFirst({ where: { id: formId, organizationId }, include });
      if (row) return this.dto(row);
    }
    return this.standard(typeCodeOf(project) ?? '', project.type);
  }

  /** Saved versions by id (a DPR export reads the fields of the reports' forms). */
  async byIds(organizationId: string, ids: string[]): Promise<DprFormDto[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.dprFormConfig.findMany({ where: { id: { in: ids.slice(0, 200) }, organizationId }, include });
    return rows.map((r) => this.dto(r));
  }

  /**
   * The version a phone filled offline, when it is one of the project type's: the API takes the fields of that
   * version, so a report typed before the form changed still goes in. Anything else is the type's latest.
   */
  async chosen(organizationId: string, project: { type: ProjectType; typeCode: string | null }, formId: string | null | undefined): Promise<DprFormDto> {
    if (formId) {
      const row = await this.prisma.dprFormConfig.findFirst({ where: { id: formId, organizationId, typeCode: typeCodeOf(project) ?? '' }, include });
      if (row) return this.dto(row);
    }
    return this.forProject(organizationId, project);
  }

  /** A type's form and its saved versions, newest first, with how many reports each holds. */
  async versions(user: RequestUser, code: string): Promise<DprFormVersionsDto> {
    const type = await this.types.type(user.organizationId, code);
    if (!type) throw new NotFoundException('Project type not found');
    const [rows, org] = await Promise.all([
      this.prisma.dprFormConfig.findMany({ where: { organizationId: user.organizationId, typeCode: code }, orderBy: { version: 'desc' }, include: { ...include, _count: { select: { reports: true } } } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { progressFromDpr: true } }),
    ]);
    return {
      form: rows[0] ? this.dto(rows[0]) : this.standard(code, type.baseType),
      versions: rows.map((r) => ({ id: r.id, version: r.version, createdAt: iso(r.createdAt), createdByName: r.createdBy?.fullName ?? null, reports: r._count.reports })),
      progressFromDpr: org.progressFromDpr,
    };
  }

  private assertManage(user: RequestUser) {
    if (!canManageTemplates(user.roleKey)) throw new ForbiddenException('Only admin or management can change a DPR form');
  }

  /**
   * Save a new version of a type's form. It applies from the next report on every project of the type; reports made
   * already keep theirs. A field already used keeps its key and kind (`dprFormChangeProblems` over every earlier version).
   */
  async save(user: RequestUser, code: string, definition: unknown, note = 'UPDATED'): Promise<DprFormDto> {
    this.assertManage(user);
    const type = await this.types.type(user.organizationId, code);
    if (!type) throw new NotFoundException('Project type not found');
    const def = normaliseDprForm(definition);
    const { problems, last } = await this.check(user.organizationId, code, type.baseType, def);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    const row = await this.write(user.organizationId, code, def, last + 1, user.id);
    await this.audit.log(user, 'DPR_FORM', code, note, `${type.name}: version ${row.version}, ${def.own.length} fields of the company's own`);
    return row;
  }

  /**
   * What is wrong with a form for a type, before it is saved: the editor's checks, and a field kept to its kind and place
   * over the standard form and every earlier version. Also the import's check, where the type may be new.
   */
  async check(organizationId: string, code: string, baseType: ProjectType, def: DprFormDef): Promise<{ problems: string[]; last: number }> {
    const [org, earlier] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { progressFromDpr: true } }),
      this.prisma.dprFormConfig.findMany({ where: { organizationId, typeCode: code }, select: { version: true, definition: true }, orderBy: { version: 'desc' } }),
    ]);
    const before = [normaliseDprForm(standardDprForm(code, baseType)), ...earlier.map((e) => normaliseDprForm(e.definition))];
    return { problems: [...dprFormProblems(def, { progressFromDpr: org.progressFromDpr }), ...new Set(before.flatMap((b) => dprFormChangeProblems(b, def)))], last: earlier[0]?.version ?? 0 };
  }

  private async write(organizationId: string, typeCode: string, def: DprFormDef, version: number, createdById: string | null, db: Db = this.prisma): Promise<DprFormDto> {
    const row = await db.dprFormConfig.create({ data: { organizationId, typeCode, version, definition: def as unknown as Prisma.InputJsonValue, createdById }, include });
    return this.dto(row);
  }

  /** Back to the type's standard form, as a new version (the reports on the old ones keep theirs). */
  async reset(user: RequestUser, code: string): Promise<DprFormDto> {
    const type = await this.types.type(user.organizationId, code);
    if (!type) throw new NotFoundException('Project type not found');
    const saved = await this.prisma.dprFormConfig.count({ where: { organizationId: user.organizationId, typeCode: code } });
    if (!saved) return this.standard(code, type.baseType);
    return this.save(user, code, standardDprForm(code, type.baseType), 'RESET');
  }

  /** A new type made as a copy of another takes the other's form as its first version (unless it would start with it anyway). */
  async copy(user: RequestUser, from: string, to: string) {
    const [src, dest] = await Promise.all([this.types.type(user.organizationId, from), this.types.type(user.organizationId, to)]);
    if (!src || !dest) return;
    const form = await this.latest(user.organizationId, from, src.baseType);
    if (form.standard && JSON.stringify(form.def) === JSON.stringify(normaliseDprForm(standardDprForm(to, dest.baseType)))) return;
    await this.write(user.organizationId, to, form.def, 1, user.id);
  }

  /** A type deleted with no project: its versions go with it (no report can hold one). */
  async removeAll(organizationId: string, code: string) {
    await this.prisma.dprFormConfig.deleteMany({ where: { organizationId, typeCode: code, reports: { none: {} } } });
  }
}

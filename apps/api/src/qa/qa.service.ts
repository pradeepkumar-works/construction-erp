import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  STANDARD_QA_PLANS,
  STANDARD_TEST_TYPES,
  canManageQaPlan,
  concreteGrade,
  cubeAcceptance,
  gradeFck,
  planLineFor,
  planLineProblem,
  testTypeProblem,
  testTypesOf,
  testsOwed,
  type CubeAcceptanceDto,
  type LotReceived,
  type ProjectType,
  type QaFrequency,
  type QaPlanDto,
  type QaPlanLineDef,
  type QaPlanLineDto,
  type QaPlanSource,
  type QaWitness,
  type TestTypeDef,
  type TestTypeDto,
  type TestsDueDto,
  type TestsDueRowDto,
  type WorkDone,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, dec } from '../common/serialize';
import { CreatePlanLineDto, SaveTestTypeDto, UpdatePlanLineDto } from './qa.dto';

type PlanLineRow = Prisma.QaPlanLineGetPayload<object>;
type TestTypeRow = Prisma.TestTypeGetPayload<object>;

const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

/**
 * QA/QC plans (item 137, ARCHITECTURE "QA/QC"): the company's test types over the standard ones, each project's quality
 * plan, the tests due under it and the IS 456 acceptance of cubes by grade. The arithmetic is pure in `@erp/shared/qa-plan.ts`;
 * this service loads the approved work, the receipts and the tests for it.
 */
@Injectable()
export class QaService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  /* ---------- test types ---------- */

  private toDef(r: TestTypeRow): TestTypeDef {
    return {
      code: r.code,
      name: r.name,
      kind: r.kind,
      material: r.material,
      method: r.method,
      unit: r.unit,
      specMin: num(r.specMin),
      specMax: num(r.specMax),
      readings: (r.readings as { label: string; days: number }[]) ?? [],
      specimens: r.specimens,
      active: r.isActive,
    };
  }

  /** The company's test types (standard ones with its changes, then its own), switched-off ones included. */
  async typeDefs(organizationId: string): Promise<TestTypeDef[]> {
    const rows = await this.prisma.testType.findMany({ where: { organizationId }, orderBy: { code: 'asc' } });
    return testTypesOf(rows.map((r) => this.toDef(r)));
  }

  async testTypes(user: RequestUser): Promise<TestTypeDto[]> {
    const [defs, rows, used] = await Promise.all([
      this.typeDefs(user.organizationId),
      this.prisma.testType.findMany({ where: { organizationId: user.organizationId }, select: { code: true } }),
      this.prisma.qualityTest.groupBy({ by: ['testTypeCode'], where: { organizationId: user.organizationId, testTypeCode: { not: null } }, _count: { _all: true } }),
    ]);
    const saved = new Set(rows.map((r) => r.code));
    const uses = new Map(used.map((u) => [u.testTypeCode!, u._count._all]));
    return defs.map((d) => {
      const standard = STANDARD_TEST_TYPES.some((s) => s.code === d.code);
      return { ...d, standard, changed: standard && saved.has(d.code), inUse: uses.get(d.code) ?? 0 };
    });
  }

  private assertManage(user: RequestUser) {
    if (!canManageQaPlan(user.roleKey)) throw new ForbiddenException('Only QA/QC or a project manager changes test types and quality plans');
  }

  /** Save a standard type's copy or one of the company's own, by code. */
  async saveTestType(user: RequestUser, code: string, dto: SaveTestTypeDto): Promise<TestTypeDto> {
    this.assertManage(user);
    const def: TestTypeDef = {
      code: code.trim().toUpperCase(),
      name: dto.name,
      kind: dto.kind,
      material: dto.material,
      method: dto.method || null,
      unit: dto.unit,
      specMin: dto.specMin ?? null,
      specMax: dto.specMax ?? null,
      readings: dto.readings.map((r) => ({ label: r.label, days: r.days })),
      specimens: dto.specimens,
      active: dto.active ?? true,
    };
    const problem = testTypeProblem(def);
    if (problem) throw new BadRequestException(problem);
    const data = {
      name: def.name,
      kind: def.kind,
      material: def.material,
      method: def.method,
      unit: def.unit,
      specMin: def.specMin,
      specMax: def.specMax,
      readings: def.readings as unknown as Prisma.InputJsonValue,
      specimens: def.specimens,
      isActive: def.active,
    };
    await this.prisma.testType.upsert({ where: { organizationId_code: { organizationId: user.organizationId, code: def.code } }, create: { organizationId: user.organizationId, code: def.code, ...data }, update: data });
    await this.audit.log(user, 'TEST_TYPE', def.code, 'UPDATED');
    return (await this.testTypes(user)).find((t) => t.code === def.code)!;
  }

  /** A standard type goes back to as shipped; one of the company's own goes only while no test or plan uses it. */
  async removeTestType(user: RequestUser, code: string) {
    this.assertManage(user);
    const standard = STANDARD_TEST_TYPES.some((s) => s.code === code);
    if (!standard) {
      const [tests, lines] = await Promise.all([
        this.prisma.qualityTest.count({ where: { organizationId: user.organizationId, testTypeCode: code } }),
        this.prisma.qaPlanLine.count({ where: { organizationId: user.organizationId, testType: code } }),
      ]);
      if (tests || lines) throw new BadRequestException(`${tests ? `${tests} test${tests === 1 ? '' : 's'}` : `${lines} plan line${lines === 1 ? '' : 's'}`} use it. Switch it off instead.`);
    }
    const { count } = await this.prisma.testType.deleteMany({ where: { organizationId: user.organizationId, code } });
    if (!count && !standard) throw new NotFoundException('Test type not found');
    await this.audit.log(user, 'TEST_TYPE', code, standard ? 'RESET' : 'DELETED');
    return { ok: true };
  }

  /* ---------- the quality plan ---------- */

  private lineDef(r: PlanLineRow): QaPlanLineDef {
    return {
      testType: r.testType,
      source: r.source as QaPlanSource,
      match: r.match,
      grade: r.grade,
      itemCategory: r.itemCategory,
      frequency: r.frequency as QaFrequency,
      per: num(r.per),
      unit: r.unit,
      witness: r.witness as QaWitness,
      holdPoint: r.holdPoint,
    };
  }

  private toLineDto(r: PlanLineRow, types: TestTypeDef[]): QaPlanLineDto {
    return { ...this.lineDef(r), id: r.id, projectId: r.projectId, testName: types.find((t) => t.code === r.testType)?.name ?? r.testType, notes: r.notes, sortOrder: r.sortOrder };
  }

  private async project(user: RequestUser, projectId: string) {
    await this.access.assertCanAccessProject(user, projectId);
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { id: true, name: true, type: true } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  async plan(user: RequestUser, projectId: string): Promise<QaPlanDto> {
    const p = await this.project(user, projectId);
    const [rows, types] = await Promise.all([this.prisma.qaPlanLine.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }), this.typeDefs(user.organizationId)]);
    return { projectId, projectName: p.name, projectType: p.type as ProjectType, lines: rows.map((r) => this.toLineDto(r, types)), canEdit: canManageQaPlan(user.roleKey) };
  }

  /** A project with no plan starts from the standard plan of its kind of work. */
  async startFromStandard(user: RequestUser, projectId: string): Promise<QaPlanDto> {
    this.assertManage(user);
    const p = await this.project(user, projectId);
    if (await this.prisma.qaPlanLine.count({ where: { projectId } })) throw new BadRequestException('This project already has a quality plan');
    const lines = STANDARD_QA_PLANS[p.type as ProjectType] ?? [];
    if (!lines.length) throw new BadRequestException('There is no standard plan for this kind of project. Add its lines one by one.');
    await this.prisma.qaPlanLine.createMany({ data: lines.map((l, i) => ({ organizationId: user.organizationId, projectId, ...l, sortOrder: i })) });
    await this.audit.log(user, 'QA_PLAN', projectId, 'CREATED');
    return this.plan(user, projectId);
  }

  private async checkLine(user: RequestUser, l: QaPlanLineDef) {
    const problem = planLineProblem(l, await this.typeDefs(user.organizationId));
    if (problem) throw new BadRequestException(problem);
  }

  private normalise(dto: Partial<CreatePlanLineDto>, cur?: QaPlanLineDef): QaPlanLineDef {
    const l: QaPlanLineDef = {
      testType: (dto.testType ?? cur?.testType ?? '').toUpperCase(),
      source: dto.source ?? cur?.source ?? 'WORK',
      match: dto.match ?? cur?.match ?? '',
      grade: dto.grade !== undefined ? concreteGrade(dto.grade) ?? (dto.grade || null) : (cur?.grade ?? null),
      itemCategory: dto.itemCategory !== undefined ? dto.itemCategory || null : (cur?.itemCategory ?? null),
      frequency: dto.frequency ?? cur?.frequency ?? 'QUANTITY',
      per: dto.per !== undefined ? dto.per : (cur?.per ?? null),
      unit: dto.unit !== undefined ? dto.unit || null : (cur?.unit ?? null),
      witness: dto.witness ?? cur?.witness ?? 'OWN',
      holdPoint: dto.holdPoint ?? cur?.holdPoint ?? false,
    };
    if (l.frequency === 'IS456') l.unit = 'm3';
    if (l.source === 'WORK') l.itemCategory = null;
    return l;
  }

  async addLine(user: RequestUser, dto: CreatePlanLineDto): Promise<QaPlanLineDto> {
    this.assertManage(user);
    await this.project(user, dto.projectId);
    const l = this.normalise(dto);
    await this.checkLine(user, l);
    const last = await this.prisma.qaPlanLine.findFirst({ where: { projectId: dto.projectId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const row = await this.prisma.qaPlanLine.create({ data: { organizationId: user.organizationId, projectId: dto.projectId, ...l, notes: dto.notes || null, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    await this.audit.log(user, 'QA_PLAN', dto.projectId, 'LINE_ADDED');
    return this.toLineDto(row, await this.typeDefs(user.organizationId));
  }

  private async loadLine(user: RequestUser, id: string) {
    const row = await this.prisma.qaPlanLine.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Plan line not found');
    await this.access.assertCanAccessProject(user, row.projectId);
    return row;
  }

  async updateLine(user: RequestUser, id: string, dto: UpdatePlanLineDto): Promise<QaPlanLineDto> {
    this.assertManage(user);
    const cur = await this.loadLine(user, id);
    const l = this.normalise(dto, this.lineDef(cur));
    await this.checkLine(user, l);
    const row = await this.prisma.qaPlanLine.update({ where: { id }, data: { ...l, ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}) } });
    await this.audit.log(user, 'QA_PLAN', cur.projectId, 'LINE_CHANGED');
    return this.toLineDto(row, await this.typeDefs(user.organizationId));
  }

  /** A line goes; tests taken under it stay, counted under none. */
  async removeLine(user: RequestUser, id: string) {
    this.assertManage(user);
    const cur = await this.loadLine(user, id);
    await this.prisma.qaPlanLine.delete({ where: { id } });
    await this.audit.log(user, 'QA_PLAN', cur.projectId, 'LINE_REMOVED');
    return { ok: true };
  }

  /** The plan line a new test of a type counts under on a project, when the test names none. */
  async lineForTest(projectId: string, testTypeCode: string | null | undefined, title: string): Promise<string | null> {
    if (!testTypeCode) return null;
    const lines = await this.prisma.qaPlanLine.findMany({ where: { projectId, testType: testTypeCode }, select: { id: true, testType: true, grade: true } });
    return planLineFor(testTypeCode, title, lines)?.id ?? null;
  }

  /* ---------- tests due ---------- */

  /** Approved work on the projects, with what it is called (activity and BOQ item) for the plan lines' words. */
  private async workDone(projectIds: string[]): Promise<Map<string, WorkDone[]>> {
    const rows = await this.prisma.progressEntry.findMany({
      where: { projectId: { in: projectIds }, status: 'APPROVED', project: { type: { not: 'STORE' } } },
      select: { projectId: true, date: true, quantity: true, activity: { select: { name: true, unit: true, boqItem: { select: { description: true } } } } },
    });
    const by = new Map<string, WorkDone[]>();
    for (const r of rows) {
      const list = by.get(r.projectId) ?? [];
      list.push({ date: dateOnly(r.date), quantity: Number(r.quantity), unit: r.activity.unit, text: `${r.activity.name} ${r.activity.boqItem?.description ?? ''}` });
      by.set(r.projectId, list);
    }
    return by;
  }

  /** Material received, less what QA/QC rejected; a GRN QA/QC rejected in full is not a lot to test. */
  private async lotsReceived(projectIds: string[]): Promise<Map<string, LotReceived[]>> {
    const rows = await this.prisma.stockTxn.findMany({
      where: { projectId: { in: projectIds }, type: 'RECEIPT', entry: { OR: [{ qcStatus: null }, { qcStatus: { not: 'REJECTED' } }] } },
      select: { projectId: true, entryId: true, date: true, quantity: true, rejectedQty: true, item: { select: { name: true, unit: true, category: true } } },
    });
    const by = new Map<string, LotReceived[]>();
    for (const r of rows) {
      const q = Number(r.quantity) - Number(r.rejectedQty ?? 0);
      if (q <= 0) continue;
      const list = by.get(r.projectId) ?? [];
      list.push({ entryId: r.entryId, date: dateOnly(r.date), quantity: q, unit: r.item.unit, itemName: r.item.name, category: r.item.category });
      by.set(r.projectId, list);
    }
    return by;
  }

  /** Tests owed under each plan line from the approved work and the material received, against the tests taken. */
  async testsDue(user: RequestUser, q: { projectId?: string; short?: boolean }): Promise<TestsDueDto> {
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const projects = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}), type: { notIn: ['STORE', 'PLANT'] }, status: { not: 'CLOSED' } },
      select: { id: true, name: true, _count: { select: { qaPlanLines: true } } },
      orderBy: { name: 'asc' },
    });
    const planned = projects.filter((p) => p._count.qaPlanLines > 0);
    const ids = planned.map((p) => p.id);
    const [lines, types, work, lots, tests] = await Promise.all([
      this.prisma.qaPlanLine.findMany({ where: { projectId: { in: ids } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.typeDefs(user.organizationId),
      this.workDone(ids),
      this.lotsReceived(ids),
      this.prisma.qualityTest.findMany({ where: { projectId: { in: ids }, planLineId: { not: null } }, select: { planLineId: true, sampledOn: true } }),
    ]);
    const names = new Map(planned.map((p) => [p.id, p.name]));
    const rows: TestsDueRowDto[] = lines.map((r) => {
      const taken = tests.filter((x) => x.planLineId === r.id).map((x) => ({ planLineId: x.planLineId, sampledOn: dateOnly(x.sampledOn) }));
      return { line: this.toLineDto(r, types), projectName: names.get(r.projectId) ?? '', ...testsOwed(this.lineDef(r), work.get(r.projectId) ?? [], lots.get(r.projectId) ?? [], taken) };
    });
    const shown = q.short ? rows.filter((r) => r.short > 0) : rows;
    return {
      rows: shown,
      required: rows.reduce((a, r) => a + r.required, 0),
      taken: rows.reduce((a, r) => a + Math.min(r.taken, r.required), 0),
      short: rows.reduce((a, r) => a + r.short, 0),
      withoutPlan: projects.filter((p) => !p._count.qaPlanLines).map((p) => ({ id: p.id, name: p.name })),
    };
  }

  /** Tests short across the reader's projects, for My work and the module's figures. */
  async shortCount(user: RequestUser): Promise<number> {
    return (await this.testsDue(user, {})).short;
  }

  /* ---------- cube acceptance ---------- */

  /**
   * The IS 456 acceptance of each grade's cubes on each project: the 28-day results of cube tests (the last reading of
   * each), the grade from the pour or the test's title.
   */
  async cubes(user: RequestUser, projectId?: string): Promise<CubeAcceptanceDto[]> {
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.qualityTest.findMany({
      where: { ...this.access.submissionWhere(user), ...(projectId ? { projectId } : {}), kind: 'CONCRETE_CUBE' },
      select: {
        id: true,
        testNo: true,
        title: true,
        sampledOn: true,
        projectId: true,
        project: { select: { name: true } },
        pour: { select: { pourNo: true, grade: true } },
        readings: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { value: true } },
      },
      orderBy: [{ sampledOn: 'asc' }, { testNo: 'asc' }],
    });
    const groups = new Map<string, CubeAcceptanceDto>();
    for (const r of rows) {
      const grade = concreteGrade(r.pour?.grade ?? r.title);
      const last = r.readings[r.readings.length - 1];
      if (!grade || !last || last.value === null) continue;
      const key = `${r.projectId}:${grade}`;
      const g = groups.get(key) ?? { projectId: r.projectId, projectName: r.project.name, grade, results: [], acceptance: cubeAcceptance([], gradeFck(grade)!) };
      g.results.push({ id: r.id, date: dateOnly(r.sampledOn), value: Number(dec(last.value)), testNo: r.testNo, pourNo: r.pour?.pourNo ?? null });
      groups.set(key, g);
    }
    return [...groups.values()]
      .map((g) => ({ ...g, acceptance: cubeAcceptance(g.results, gradeFck(g.grade)!) }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName) || gradeFck(a.grade)! - gradeFck(b.grade)!);
  }
}

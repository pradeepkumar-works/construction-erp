import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  NCR_SEVERITY_LABELS,
  TEST_KIND_DEFAULTS,
  TEST_KIND_LABELS,
  canActOnNcr,
  canApprove,
  canEditTest,
  canRaiseNcr,
  comparePipeCodes,
  isCompanyWide,
  judgeTest,
  planLineFor,
  segmentLabel,
  specRange,
  type NcrDto,
  type NcrSortField,
  type Paginated,
  type QualitySummaryDto,
  type QualityTestDto,
  type QualityTestSortField,
  type RoleKey,
  type SortOrder,
  type TestResult,
  testedOutOfCalibration,
  type CalibrationResult,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MastersService } from '../masters/masters.service';
import { todayIn } from '../notifications/time';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreateNcrDto, CreateTestDto, ListNcrsQuery, ListTestsQuery, NcrActionDto, NcrCloseDto, NcrReopenDto, TestReadingInputDto, UpdateNcrDto, UpdateTestDto } from './quality.dto';

const testInclude = {
  project: { select: { name: true } },
  activity: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  readings: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
  _count: { select: { ncrs: { where: { status: { not: 'CLOSED' } } } } },
  pipeSegments: { select: { segment: { select: { id: true, code: true, fromNode: { select: { code: true } }, toNode: { select: { code: true } } } } } },
  pour: { select: { pourNo: true } },
  lab: { select: { name: true } },
  instrument: { select: { name: true, lastCalibratedOn: true, nextDueOn: true, intervalDays: true, lastResult: true } },
} satisfies Prisma.QualityTestInclude;
type TestRow = Prisma.QualityTestGetPayload<{ include: typeof testInclude }>;

const ncrInclude = {
  project: { select: { name: true } },
  activity: { select: { name: true } },
  inspection: { select: { inspectionNo: true } },
  qualityTest: { select: { testNo: true } },
  raisedBy: { select: { fullName: true } },
  actionBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.NcrInclude;
type NcrRow = Prisma.NcrGetPayload<{ include: typeof ncrInclude }>;

const TEST_ORDER: Record<QualityTestSortField, (o: SortOrder) => Prisma.QualityTestOrderByWithRelationInput[]> = {
  sampledOn: (o) => [{ sampledOn: o }, { testNo: o }],
  testNo: (o) => [{ testNo: o }],
  kind: (o) => [{ kind: o }, { sampledOn: 'desc' }],
  result: (o) => [{ result: o }, { sampledOn: 'desc' }],
  project: (o) => [{ project: { name: o } }, { sampledOn: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const NCR_ORDER: Record<NcrSortField, (o: SortOrder) => Prisma.NcrOrderByWithRelationInput[]> = {
  raisedOn: (o) => [{ raisedOn: o }, { ncrNo: o }],
  ncrNo: (o) => [{ ncrNo: o }],
  severity: (o) => [{ severity: o }, { raisedOn: 'desc' }],
  status: (o) => [{ status: o }, { raisedOn: 'desc' }],
  dueDate: (o) => [{ dueDate: { sort: o, nulls: 'last' } }, { raisedOn: 'desc' }],
  project: (o) => [{ project: { name: o } }, { raisedOn: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['sampledOn', 'testNo', 'raisedOn', 'ncrNo', 'severity', 'createdAt']);

const addDays = (date: string, days: number) => new Date(parseDate(date).getTime() + days * 86_400_000);

/**
 * Quality tests and non-conformance reports (NCRs).
 * A test is a sample taken on a date with its specification and readings (cubes at 7 and 28 days); the last reading
 * decides pass or fail against specMin / specMax, and readings falling due are reminded daily (NotificationJobsService).
 * An NCR is raised by QA/QC, site records the cause and corrective action, and QA/QC closes it (or reopens it).
 * Neither is an approval submission: both are registers numbered TST- and NCR-<year>-0001 per organisation.
 */
@Injectable()
export class QualityService {
  private readonly log = new Logger(QualityService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
    private masters: MastersService,
  ) {}

  /* ---------- tests ---------- */

  toTestDto(r: TestRow, today = todayIn()): QualityTestDto {
    const readings = r.readings.map((x) => {
      const dueOn = dateOnly(x.dueOn);
      return { id: x.id, label: x.label, dueOn, value: dec(x.value), testedOn: dateOnly(x.testedOn), remarks: x.remarks, overdue: x.value === null && !!dueOn && dueOn < today };
    });
    const open = readings.filter((x) => x.value === null && x.dueOn).map((x) => x.dueOn!);
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      activityId: r.activityId,
      activityName: r.activity?.name ?? null,
      testNo: r.testNo,
      kind: r.kind,
      title: r.title,
      location: r.location,
      sampledOn: dateOnly(r.sampledOn)!,
      specification: r.specification,
      unit: r.unit,
      specMin: dec(r.specMin),
      specMax: dec(r.specMax),
      result: r.result,
      remarks: r.remarks,
      readings,
      nextDueOn: open.length ? open.sort()[0] : null,
      overdue: readings.some((x) => x.overdue),
      openNcrs: r._count.ncrs,
      segments: r.pipeSegments
        .map(({ segment: g }) => ({ id: g.id, code: g.code, label: segmentLabel({ code: g.code, fromCode: g.fromNode.code, toCode: g.toNode.code }) }))
        .sort((a, b) => comparePipeCodes(a.code, b.code)),
      testTypeCode: r.testTypeCode,
      planLineId: r.planLineId,
      pourId: r.pourId,
      pourNo: r.pour?.pourNo ?? null,
      labId: r.labId,
      labName: r.lab?.name ?? null,
      sentOn: dateOnly(r.sentOn),
      labReportNo: r.labReportNo,
      reportOn: dateOnly(r.reportOn),
      labCharge: money(r.labCharge),
      instrumentId: r.instrumentId,
      instrumentName: r.instrument?.name ?? null,
      outOfCalibration: !!r.instrument && testedOutOfCalibration({ lastCalibratedOn: dateOnly(r.instrument.lastCalibratedOn), nextDueOn: dateOnly(r.instrument.nextDueOn), intervalDays: r.instrument.intervalDays, lastResult: r.instrument.lastResult as CalibrationResult | null }, dateOnly(r.sampledOn)!),
      createdById: r.createdById,
      createdByName: r.createdBy.fullName,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  private testWhere(user: RequestUser, q: ListTestsQuery): Prisma.QualityTestWhereInput {
    const where: Prisma.QualityTestWhereInput = { ...this.access.submissionWhere(user) };
    const and: Prisma.QualityTestWhereInput[] = [];
    if (q.projectId) where.projectId = q.projectId;
    if (q.kind) where.kind = q.kind;
    if (q.result) where.result = q.result;
    if (q.overdue) where.readings = { some: { value: null, dueOn: { lt: parseDate(todayIn()) } } };
    if (q.from || q.to) where.sampledOn = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    for (const w of searchWords(q.q))
      and.push({ OR: [{ testNo: ilike(w) }, { title: ilike(w) }, { location: ilike(w) }, { specification: ilike(w) }, { activity: { name: ilike(w) } }, { project: { name: ilike(w) } }] });
    if (and.length) where.AND = and;
    return where;
  }

  async listTests(user: RequestUser, q: ListTestsQuery): Promise<Paginated<QualityTestDto>> {
    const where = this.testWhere(user, q);
    const sortBy = q.sortBy ?? 'sampledOn';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.qualityTest.findMany({ where, include: testInclude, orderBy: [...TEST_ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.qualityTest.count({ where }),
    ]);
    const today = todayIn();
    return paginated(rows.map((r) => this.toTestDto(r, today)), total, args);
  }

  async getTest(user: RequestUser, id: string): Promise<QualityTestDto> {
    const row = await this.prisma.qualityTest.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: testInclude });
    if (!row) throw new NotFoundException('Test not found');
    return this.toTestDto(row);
  }

  private async assertActivity(projectId: string, activityId: string | null | undefined) {
    if (!activityId) return;
    if (!(await this.prisma.activity.count({ where: { id: activityId, projectId } }))) throw new NotFoundException('Activity not found in this project');
  }

  /** Pipe lengths a test covers must be proposed pipes of the test's own project. */
  private async assertSegments(projectId: string, segmentIds: string[] | undefined) {
    if (!segmentIds?.length) return;
    const ids = [...new Set(segmentIds)];
    const found = await this.prisma.pipeSegment.count({ where: { id: { in: ids }, projectId } });
    if (found !== ids.length) throw new NotFoundException("Choose pipes from this project's pipe network");
  }

  /**
   * Where a test counts (item 137): the pour its cubes came from (on the same project, not cancelled) and the plan line,
   * given or else the only line of its type (or of its grade) on the project. `title` names the grade for the line.
   */
  private async placeInPlan(projectId: string, dto: { testTypeCode?: string | null; planLineId?: string | null; pourId?: string | null }, title: string) {
    let grade: string | null = null;
    if (dto.pourId) {
      const pour = await this.prisma.pour.findFirst({ where: { id: dto.pourId, projectId }, select: { status: true, grade: true } });
      if (!pour) throw new NotFoundException('Pour not found in this project');
      if (pour.status === 'CANCELLED') throw new BadRequestException('This pour was cancelled');
      grade = pour.grade;
    }
    if (dto.planLineId) {
      const line = await this.prisma.qaPlanLine.findFirst({ where: { id: dto.planLineId, projectId }, select: { id: true, testType: true } });
      if (!line) throw new NotFoundException("Choose a line of this project's quality plan");
      return { planLineId: line.id, testTypeCode: dto.testTypeCode ?? line.testType };
    }
    if (!dto.testTypeCode) return { planLineId: null, testTypeCode: dto.testTypeCode ?? null };
    const lines = await this.prisma.qaPlanLine.findMany({ where: { projectId, testType: dto.testTypeCode }, select: { id: true, testType: true, grade: true } });
    return { planLineId: planLineFor(dto.testTypeCode, `${grade ?? ''} ${title}`, lines)?.id ?? null, testTypeCode: dto.testTypeCode };
  }

  /**
   * Where a sample went and the instrument it was tested on (item 137 part 2): a lab and an instrument of the company, sent
   * on or after the sample and not after today, reported on or after it was sent.
   */
  private async labFields(
    user: RequestUser,
    sampledOn: string,
    v: { labId: string | null; sentOn: string | null; labReportNo: string | null; reportOn: string | null; labCharge: string | null; instrumentId: string | null },
  ): Promise<{ labId: string | null; sentOn: Date | null; labReportNo: string | null; reportOn: Date | null; labCharge: string | null; instrumentId: string | null }> {
    const today = todayIn();
    if (v.labId && !(await this.prisma.qaLab.count({ where: { id: v.labId, organizationId: user.organizationId } }))) throw new BadRequestException('Choose a lab from the list (QA/QC › Labs)');
    if (v.instrumentId && !(await this.prisma.qaInstrument.count({ where: { id: v.instrumentId, organizationId: user.organizationId } }))) throw new BadRequestException('Choose an instrument from the calibration register');
    if (v.sentOn && !v.labId) throw new BadRequestException('Choose the lab the sample went to');
    if (v.sentOn && v.sentOn < sampledOn) throw new BadRequestException('A sample goes to the lab on or after the day it was taken');
    if (v.sentOn && v.sentOn > today) throw new BadRequestException('The day sent cannot be after today');
    if (v.reportOn && !v.sentOn) throw new BadRequestException('Give the day the sample went to the lab before its report');
    if (v.reportOn && v.sentOn && v.reportOn < v.sentOn) throw new BadRequestException('The report comes on or after the day the sample was sent');
    if (v.reportOn && v.reportOn > today) throw new BadRequestException('The report day cannot be after today');
    if (v.labCharge && Number(v.labCharge) < 0) throw new BadRequestException('A lab charge cannot be below zero');
    return {
      labId: v.labId,
      sentOn: v.sentOn ? parseDate(v.sentOn) : null,
      labReportNo: v.labReportNo?.trim() || null,
      reportOn: v.reportOn ? parseDate(v.reportOn) : null,
      labCharge: v.labCharge || null,
      instrumentId: v.instrumentId,
    };
  }

  private checkSpec(min: string | null, max: string | null) {
    if (min !== null && max !== null && Number(min) > Number(max)) throw new BadRequestException('The lowest passing value is above the highest');
  }

  private checkReadings(readings: TestReadingInputDto[], sampledOn: string) {
    const today = todayIn();
    for (const r of readings) {
      if (r.testedOn && r.testedOn > today) throw new BadRequestException(`${r.label}: the test date cannot be in the future`);
      if (r.testedOn && r.testedOn < sampledOn) throw new BadRequestException(`${r.label}: tested before the sample was taken`);
    }
  }

  /** The result: judged from the last reading when there is a specification, else as recorded (PENDING until then). */
  private result(readings: { value?: string | null }[], specMin: string | null, specMax: string | null, recorded: TestResult | undefined, current: TestResult): TestResult {
    const judged = judgeTest(readings.map((r) => ({ value: r.value ?? null })), specMin, specMax);
    return judged ?? recorded ?? current;
  }

  private async findExistingTest(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.qualityTest.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.getTest(user, row.id) : null;
  }

  async createTest(user: RequestUser, dto: CreateTestDto): Promise<QualityTestDto> {
    const existing = await this.findExistingTest(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanRecordTest(user, dto.projectId);
    await this.assertActivity(dto.projectId, dto.activityId);
    await this.assertSegments(dto.projectId, dto.segmentIds);
    if (dto.sampledOn > todayIn()) throw new BadRequestException('The sample date cannot be in the future');
    const specMin = dto.specMin ?? null;
    const specMax = dto.specMax ?? null;
    this.checkSpec(specMin, specMax);
    const defaults = TEST_KIND_DEFAULTS[dto.kind];
    const readings: TestReadingInputDto[] = dto.readings?.length ? dto.readings : defaults.readings.map((r) => ({ label: r.label, dueOn: dateOnly(addDays(dto.sampledOn, r.days)) }));
    this.checkReadings(readings, dto.sampledOn);
    const result = this.result(readings, specMin, specMax, dto.result, 'PENDING');
    const placed = await this.placeInPlan(dto.projectId, dto, dto.title);
    const lab = await this.labFields(user, dto.sampledOn, {
      labId: dto.labId ?? null,
      sentOn: dto.sentOn ?? null,
      labReportNo: dto.labReportNo ?? null,
      reportOn: dto.reportOn ?? null,
      labCharge: dto.labCharge ?? null,
      instrumentId: dto.instrumentId ?? null,
    });
    const today = todayIn();
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const testNo = await nextDocNo(tx, user.organizationId, 'TST', async (prefix) =>
          (await tx.qualityTest.findFirst({ where: { organizationId: user.organizationId, testNo: { startsWith: prefix } }, orderBy: { testNo: 'desc' }, select: { testNo: true } }))?.testNo ?? null,
        );
        if (dto.id && (await tx.qualityTest.count({ where: { id: dto.id } }))) return null;
        const row = await tx.qualityTest.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            activityId: dto.activityId || null,
            testNo,
            kind: dto.kind,
            title: dto.title,
            location: dto.location || null,
            sampledOn: parseDate(dto.sampledOn),
            specification: dto.specification || null,
            unit: dto.unit === undefined ? defaults.unit || null : dto.unit || null,
            specMin,
            specMax,
            result,
            remarks: dto.remarks || null,
            createdById: user.id,
            testTypeCode: placed.testTypeCode,
            planLineId: placed.planLineId,
            pourId: dto.pourId || null,
            ...lab,
            readings: {
              create: readings.map((r, i) => ({
                label: r.label,
                dueOn: r.dueOn ? parseDate(r.dueOn) : null,
                value: r.value ?? null,
                testedOn: r.value != null ? parseDate(r.testedOn ?? today) : null,
                remarks: r.remarks || null,
                sortOrder: i,
              })),
            },
            pipeSegments: dto.segmentIds?.length ? { create: [...new Set(dto.segmentIds)].map((segmentId) => ({ segmentId, organizationId: user.organizationId })) } : undefined,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExistingTest(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    if (!id) return this.getTest(user, dto.id!);
    await this.attachments.link(user, 'qualityTestId', id, dto.attachmentIds);
    await this.audit.log(user, 'QUALITY_TEST', id, 'CREATED');
    const created = await this.getTest(user, id);
    if (created.result === 'FAIL') await this.notifyFailed(user, created);
    return created;
  }

  private async loadTest(user: RequestUser, id: string) {
    const row = await this.prisma.qualityTest.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: { readings: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } });
    if (!row) throw new NotFoundException('Test not found');
    return row;
  }

  /**
   * Change a test. Whoever records tests on the project may enter readings, remarks and photos; the specification,
   * kind and a recorded result are changed only by whoever recorded the test, QA/QC or an approver.
   */
  async updateTest(user: RequestUser, id: string, dto: UpdateTestDto): Promise<QualityTestDto> {
    const cur = await this.loadTest(user, id);
    await this.access.assertCanRecordTest(user, cur.projectId);
    const touchesSpec = [dto.kind, dto.title, dto.specification, dto.specMin, dto.specMax, dto.result, dto.sampledOn, dto.activityId].some((v) => v !== undefined);
    if (touchesSpec && !canEditTest(user, cur)) throw new ForbiddenException('Only whoever recorded the test, QA/QC or an approver can change its specification or result');
    if (dto.activityId !== undefined) await this.assertActivity(cur.projectId, dto.activityId);
    if (dto.segmentIds !== undefined && !canEditTest(user, cur)) throw new ForbiddenException('Only whoever recorded the test, QA/QC or an approver can change the pipes it covers');
    await this.assertSegments(cur.projectId, dto.segmentIds);
    const sampledOn = dto.sampledOn ?? dateOnly(cur.sampledOn)!;
    if (sampledOn > todayIn()) throw new BadRequestException('The sample date cannot be in the future');
    const specMin = dto.specMin !== undefined ? dto.specMin : dec(cur.specMin);
    const specMax = dto.specMax !== undefined ? dto.specMax : dec(cur.specMax);
    this.checkSpec(specMin, specMax);
    const readings: TestReadingInputDto[] =
      dto.readings ?? cur.readings.map((r) => ({ id: r.id, label: r.label, dueOn: dateOnly(r.dueOn), value: dec(r.value), testedOn: dateOnly(r.testedOn), remarks: r.remarks }));
    if (!readings.length) throw new BadRequestException('A test needs at least one reading');
    this.checkReadings(readings, sampledOn);
    const known = new Map(cur.readings.map((r) => [r.id, r]));
    for (const r of readings) if (r.id && !known.has(r.id)) throw new NotFoundException(`Reading ${r.label} is not on this test`);
    const result = this.result(readings, specMin, specMax, dto.result, cur.result);
    const today = todayIn();

    const data: Prisma.QualityTestUncheckedUpdateInput = { result, specMin, specMax };
    if (dto.activityId !== undefined) data.activityId = dto.activityId || null;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.location !== undefined) data.location = dto.location || null;
    if (dto.sampledOn !== undefined) data.sampledOn = parseDate(dto.sampledOn);
    if (dto.specification !== undefined) data.specification = dto.specification || null;
    if (dto.unit !== undefined) data.unit = dto.unit || null;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    if (dto.testTypeCode !== undefined || dto.planLineId !== undefined || dto.pourId !== undefined) {
      if (!canEditTest(user, cur)) throw new ForbiddenException('Only whoever recorded the test, QA/QC or an approver can change where it counts');
      const pourId = dto.pourId !== undefined ? dto.pourId || null : cur.pourId;
      const placed = await this.placeInPlan(cur.projectId, { testTypeCode: dto.testTypeCode !== undefined ? dto.testTypeCode : cur.testTypeCode, planLineId: dto.planLineId, pourId }, dto.title ?? cur.title);
      Object.assign(data, { ...placed, pourId });
    }
    if ([dto.labId, dto.sentOn, dto.labReportNo, dto.reportOn, dto.labCharge, dto.instrumentId].some((v) => v !== undefined)) {
      const pick = <K extends 'labId' | 'labReportNo' | 'instrumentId'>(k: K) => (dto[k] !== undefined ? dto[k] ?? null : cur[k]);
      Object.assign(
        data,
        await this.labFields(user, sampledOn, {
          labId: pick('labId'),
          sentOn: dto.sentOn !== undefined ? dto.sentOn ?? null : dateOnly(cur.sentOn),
          labReportNo: pick('labReportNo'),
          reportOn: dto.reportOn !== undefined ? dto.reportOn ?? null : dateOnly(cur.reportOn),
          labCharge: dto.labCharge !== undefined ? dto.labCharge ?? null : dec(cur.labCharge),
          instrumentId: pick('instrumentId'),
        }),
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.qualityTest.update({ where: { id }, data });
      if (dto.segmentIds) {
        const keepSegments = [...new Set(dto.segmentIds)];
        await tx.pipeTestSegment.deleteMany({ where: { qualityTestId: id, segmentId: { notIn: keepSegments } } });
        await tx.pipeTestSegment.createMany({ data: keepSegments.map((segmentId) => ({ qualityTestId: id, segmentId, organizationId: user.organizationId })), skipDuplicates: true });
      }
      if (!dto.readings) return;
      const keep = readings.filter((r) => r.id).map((r) => r.id!);
      await tx.qualityTestReading.deleteMany({ where: { testId: id, id: { notIn: keep } } });
      for (const [i, r] of readings.entries()) {
        const before = r.id ? known.get(r.id) : undefined;
        const value = r.value ?? null;
        // A value entered without a date was tested today; clearing the value clears the date.
        const testedOn = value === null ? null : r.testedOn ? parseDate(r.testedOn) : (before?.testedOn ?? parseDate(today));
        const fields = { label: r.label, dueOn: r.dueOn ? parseDate(r.dueOn) : null, value, testedOn, remarks: r.remarks || null, sortOrder: i };
        if (before) await tx.qualityTestReading.update({ where: { id: before.id }, data: fields });
        else await tx.qualityTestReading.create({ data: { ...fields, testId: id } });
      }
    });
    await this.attachments.sync(user, 'qualityTestId', id, dto.attachmentIds);
    await this.audit.log(user, 'QUALITY_TEST', id, 'UPDATED', result !== cur.result ? `Result ${result}` : null);
    const updated = await this.getTest(user, id);
    if (result === 'FAIL' && cur.result !== 'FAIL') await this.notifyFailed(user, updated);
    return updated;
  }

  /** Enter one reading's value (the 7-day or 28-day cubes): what the lab or site does most often. */
  async recordReading(user: RequestUser, id: string, readingId: string, dto: Pick<TestReadingInputDto, 'value' | 'testedOn' | 'remarks'>) {
    const cur = await this.loadTest(user, id);
    const readings = cur.readings.map((r) => ({ id: r.id, label: r.label, dueOn: dateOnly(r.dueOn), value: dec(r.value), testedOn: dateOnly(r.testedOn), remarks: r.remarks }));
    const r = readings.find((x) => x.id === readingId);
    if (!r) throw new NotFoundException('Reading not found');
    if (dto.value !== undefined) r.value = dto.value ?? null;
    if (dto.testedOn !== undefined) r.testedOn = dto.testedOn ?? null;
    if (dto.remarks !== undefined) r.remarks = dto.remarks ?? null;
    if (dto.value !== undefined && dto.testedOn === undefined && r.value !== null && !cur.readings.find((x) => x.id === readingId)!.testedOn) r.testedOn = todayIn();
    return this.updateTest(user, id, { readings });
  }

  async removeTest(user: RequestUser, id: string) {
    const cur = await this.loadTest(user, id);
    if (!canEditTest(user, cur)) throw new ForbiddenException('Only whoever recorded the test, QA/QC or an approver can delete it');
    await this.prisma.qualityTest.delete({ where: { id } });
    await this.audit.log(user, 'QUALITY_TEST', id, 'DELETED');
    return { ok: true };
  }

  /** A failed test goes to the project's QA/QC and its project manager. */
  private async notifyFailed(user: RequestUser, t: QualityTestDto) {
    try {
      const pm = await this.prisma.project.findUnique({ where: { id: t.projectId }, select: { projectManagerId: true } });
      const watchers = (await this.access.qualityWatchers(user.organizationId, t.projectId)).map((u) => u.id);
      const userIds = [...new Set([...watchers, ...(pm?.projectManagerId ? [pm.projectManagerId] : []), t.createdById])].filter((u) => u !== user.id);
      const last = t.readings[t.readings.length - 1];
      const spec = specRange(t.specMin, t.specMax, t.unit);
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds,
        type: 'TEST_FAILED',
        title: `Test failed: ${t.title}`,
        body: `${t.testNo} (${TEST_KIND_LABELS[t.kind]}) at ${t.projectName}: ${last?.label ?? 'result'} ${last?.value ?? ''}${t.unit ? ` ${t.unit}` : ''}${spec ? `, required ${spec}` : ''}. Raise an NCR if the work needs rectifying.`,
        projectId: t.projectId,
        entityId: t.id,
        dedupeKey: `TEST_FAILED:${t.id}:${t.updatedAt}`,
      });
    } catch (e) {
      this.log.warn(`Test failure notification failed: ${(e as Error).message}`);
    }
  }

  /* ---------- NCRs ---------- */

  toNcrDto(r: NcrRow, today = todayIn()): NcrDto {
    const dueDate = dateOnly(r.dueDate);
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      ncrNo: r.ncrNo,
      raisedOn: dateOnly(r.raisedOn)!,
      title: r.title,
      description: r.description,
      location: r.location,
      severity: r.severity,
      status: r.status,
      activityId: r.activityId,
      activityName: r.activity?.name ?? null,
      inspectionId: r.inspectionId,
      inspectionNo: r.inspection?.inspectionNo ?? null,
      qualityTestId: r.qualityTestId,
      testNo: r.qualityTest?.testNo ?? null,
      raisedById: r.raisedById,
      raisedByName: r.raisedBy.fullName,
      actionById: r.actionById,
      actionByName: r.actionBy?.fullName ?? null,
      dueDate,
      overdue: r.status !== 'CLOSED' && !!dueDate && dueDate < today,
      cause: r.cause,
      correctiveAction: r.correctiveAction,
      preventiveAction: r.preventiveAction,
      actionAt: iso(r.actionAt),
      closedById: r.closedById,
      closedByName: r.closedBy?.fullName ?? null,
      closedAt: iso(r.closedAt),
      closureNote: r.closureNote,
      category: r.category,
      rootCause: r.rootCause,
      raisedByClient: r.raisedByClient,
      reworkCost: money(r.reworkCost),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  private ncrWhere(user: RequestUser, q: ListNcrsQuery): Prisma.NcrWhereInput {
    const where: Prisma.NcrWhereInput = { ...this.access.submissionWhere(user) };
    const and: Prisma.NcrWhereInput[] = [];
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    if (q.severity) where.severity = q.severity;
    if (q.mine) where.actionById = user.id;
    if (q.qualityTestId) where.qualityTestId = q.qualityTestId;
    if (q.inspectionId) where.inspectionId = q.inspectionId;
    if (q.active) and.push({ status: { not: 'CLOSED' } });
    if (q.overdue) and.push({ status: { not: 'CLOSED' } }, { dueDate: { lt: parseDate(todayIn()) } });
    for (const w of searchWords(q.q))
      and.push({ OR: [{ ncrNo: ilike(w) }, { title: ilike(w) }, { description: ilike(w) }, { location: ilike(w) }, { activity: { name: ilike(w) } }, { project: { name: ilike(w) } }] });
    if (and.length) where.AND = and;
    return where;
  }

  async listNcrs(user: RequestUser, q: ListNcrsQuery): Promise<Paginated<NcrDto>> {
    const where = this.ncrWhere(user, q);
    const sortBy = q.sortBy ?? 'raisedOn';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.ncr.findMany({ where, include: ncrInclude, orderBy: [...NCR_ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.ncr.count({ where }),
    ]);
    const today = todayIn();
    return paginated(rows.map((r) => this.toNcrDto(r, today)), total, args);
  }

  async getNcr(user: RequestUser, id: string): Promise<NcrDto> {
    const row = await this.prisma.ncr.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: ncrInclude });
    if (!row) throw new NotFoundException('NCR not found');
    return this.toNcrDto(row);
  }

  /** The person to rectify it must be an active user of the organisation who can see the project. */
  private async assertActionBy(user: RequestUser, projectId: string, actionById: string | null | undefined) {
    if (!actionById) return;
    const u = await this.prisma.user.findFirst({ where: { id: actionById, organizationId: user.organizationId, isActive: true }, include: { role: { select: { key: true } } } });
    if (!u) throw new NotFoundException('User not found');
    if (isCompanyWide(u.role.key as RoleKey)) return;
    const member = await this.prisma.project.count({ where: { id: projectId, OR: [{ projectManagerId: actionById }, { members: { some: { userId: actionById } } }] } });
    if (!member) throw new BadRequestException(`${u.fullName} is not on this project`);
  }

  /** The activity, inspection and test an NCR refers to must be of the same project. */
  private async assertLinks(projectId: string, dto: { activityId?: string | null; inspectionId?: string | null; qualityTestId?: string | null }) {
    await this.assertActivity(projectId, dto.activityId);
    if (dto.inspectionId && !(await this.prisma.inspection.count({ where: { id: dto.inspectionId, projectId } }))) throw new NotFoundException('Inspection not found in this project');
    if (dto.qualityTestId && !(await this.prisma.qualityTest.count({ where: { id: dto.qualityTestId, projectId } }))) throw new NotFoundException('Test not found in this project');
  }

  private async findExistingNcr(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.ncr.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.getNcr(user, row.id) : null;
  }

  /** An NCR's category and root cause are codes of the company's lists; a rework cost is not below zero. */
  private async assertNcrLists(user: RequestUser, dto: { category?: string | null; rootCause?: string | null; reworkCost?: string | null }) {
    if (dto.category && !(await this.masters.entriesFor(user.organizationId, 'ncrCategory')).some((e) => e.code === dto.category)) throw new BadRequestException('Choose a category from the list (Masters › NCR categories)');
    if (dto.rootCause && !(await this.masters.entriesFor(user.organizationId, 'ncrRootCause')).some((e) => e.code === dto.rootCause)) throw new BadRequestException('Choose a root cause from the list (Masters › NCR root causes)');
    if (dto.reworkCost && Number(dto.reworkCost) < 0) throw new BadRequestException('A rework cost cannot be below zero');
  }

  async createNcr(user: RequestUser, dto: CreateNcrDto): Promise<NcrDto> {
    const existing = await this.findExistingNcr(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanRaiseNcr(user, dto.projectId);
    await this.assertLinks(dto.projectId, dto);
    await this.assertActionBy(user, dto.projectId, dto.actionById);
    await this.assertNcrLists(user, dto);
    const raisedOn = dto.raisedOn ?? todayIn();
    if (raisedOn > todayIn()) throw new BadRequestException('The NCR date cannot be in the future');
    if (dto.dueDate && dto.dueDate < raisedOn) throw new BadRequestException('The rectify-by date is before the NCR date');
    // An NCR from a test or an inspection takes its activity when none is given.
    let activityId = dto.activityId || null;
    if (!activityId && dto.inspectionId) activityId = (await this.prisma.inspection.findUnique({ where: { id: dto.inspectionId }, select: { activityId: true } }))?.activityId ?? null;
    if (!activityId && dto.qualityTestId) activityId = (await this.prisma.qualityTest.findUnique({ where: { id: dto.qualityTestId }, select: { activityId: true } }))?.activityId ?? null;
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const ncrNo = await nextDocNo(tx, user.organizationId, 'NCR', async (prefix) =>
          (await tx.ncr.findFirst({ where: { organizationId: user.organizationId, ncrNo: { startsWith: prefix } }, orderBy: { ncrNo: 'desc' }, select: { ncrNo: true } }))?.ncrNo ?? null,
        );
        if (dto.id && (await tx.ncr.count({ where: { id: dto.id } }))) return null;
        const row = await tx.ncr.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            ncrNo,
            raisedOn: parseDate(raisedOn),
            title: dto.title,
            description: dto.description,
            location: dto.location || null,
            severity: dto.severity ?? 'MINOR',
            raisedById: user.id,
            actionById: dto.actionById || null,
            dueDate: dto.dueDate ? parseDate(dto.dueDate) : null,
            activityId,
            inspectionId: dto.inspectionId || null,
            qualityTestId: dto.qualityTestId || null,
            category: dto.category || null,
            rootCause: dto.rootCause || null,
            raisedByClient: dto.raisedByClient ?? false,
            reworkCost: dto.reworkCost || null,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExistingNcr(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    if (!id) return this.getNcr(user, dto.id!);
    await this.attachments.link(user, 'ncrId', id, dto.attachmentIds);
    await this.audit.log(user, 'NCR', id, 'CREATED');
    const created = await this.getNcr(user, id);
    await this.notifyRaised(user, created);
    return created;
  }

  private async loadNcr(user: RequestUser, id: string) {
    const row = await this.prisma.ncr.findFirst({ where: { id, ...this.access.submissionWhere(user) } });
    if (!row) throw new NotFoundException('NCR not found');
    return row;
  }

  /** QA/QC and approvers change an NCR that is not closed. */
  async updateNcr(user: RequestUser, id: string, dto: UpdateNcrDto): Promise<NcrDto> {
    const cur = await this.loadNcr(user, id);
    await this.access.assertCanRaiseNcr(user, cur.projectId);
    if (cur.status === 'CLOSED') throw new BadRequestException('A closed NCR cannot be changed; reopen it first');
    await this.assertLinks(cur.projectId, dto);
    if (dto.actionById !== undefined) await this.assertActionBy(user, cur.projectId, dto.actionById);
    await this.assertNcrLists(user, dto);
    const raisedOn = dto.raisedOn ?? dateOnly(cur.raisedOn)!;
    if (raisedOn > todayIn()) throw new BadRequestException('The NCR date cannot be in the future');
    const dueDate = dto.dueDate !== undefined ? dto.dueDate : dateOnly(cur.dueDate);
    if (dueDate && dueDate < raisedOn) throw new BadRequestException('The rectify-by date is before the NCR date');
    const data: Prisma.NcrUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.location !== undefined) data.location = dto.location || null;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.raisedOn !== undefined) data.raisedOn = parseDate(dto.raisedOn);
    if (dto.actionById !== undefined) data.actionById = dto.actionById || null;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? parseDate(dto.dueDate) : null;
    if (dto.activityId !== undefined) data.activityId = dto.activityId || null;
    if (dto.inspectionId !== undefined) data.inspectionId = dto.inspectionId || null;
    if (dto.qualityTestId !== undefined) data.qualityTestId = dto.qualityTestId || null;
    if (dto.category !== undefined) data.category = dto.category || null;
    if (dto.rootCause !== undefined) data.rootCause = dto.rootCause || null;
    if (dto.raisedByClient !== undefined) data.raisedByClient = dto.raisedByClient;
    if (dto.reworkCost !== undefined) data.reworkCost = dto.reworkCost || null;
    await this.prisma.ncr.update({ where: { id }, data });
    await this.attachments.sync(user, 'ncrId', id, dto.attachmentIds);
    await this.audit.log(user, 'NCR', id, 'UPDATED');
    const updated = await this.getNcr(user, id);
    if (updated.actionById && updated.actionById !== cur.actionById && updated.actionById !== user.id) await this.notifyAssigned(user, updated);
    return updated;
  }

  /** Site records the cause and the corrective action (again, if QA/QC reopened it). */
  async recordAction(user: RequestUser, id: string, dto: NcrActionDto): Promise<NcrDto> {
    const cur = await this.loadNcr(user, id);
    await this.access.assertCanAccessProject(user, cur.projectId);
    if (!canActOnNcr(user, cur)) throw new ForbiddenException('Only the person it is assigned to, site staff or an approver can record the action on an NCR');
    if (cur.status === 'CLOSED') throw new BadRequestException('This NCR is closed');
    await this.assertNcrLists(user, dto);
    await this.prisma.ncr.update({
      where: { id },
      data: {
        status: 'ACTION_TAKEN',
        cause: dto.cause,
        correctiveAction: dto.correctiveAction,
        preventiveAction: dto.preventiveAction || null,
        actionAt: new Date(),
        actionById: cur.actionById ?? user.id,
        ...(dto.rootCause !== undefined ? { rootCause: dto.rootCause || null } : {}),
        ...(dto.reworkCost !== undefined ? { reworkCost: dto.reworkCost || null } : {}),
      },
    });
    await this.attachments.link(user, 'ncrId', id, dto.attachmentIds);
    await this.audit.log(user, 'NCR', id, 'ACTION_TAKEN', dto.correctiveAction);
    const updated = await this.getNcr(user, id);
    await this.tell(user, [updated.raisedById], updated, `Action taken on ${updated.ncrNo}: ${updated.title}`, `${user.fullName}: ${dto.correctiveAction}. Verify and close it.`, `ACTION:${Date.now()}`);
    return updated;
  }

  /** QA/QC verifies the corrective action and closes the NCR. */
  async close(user: RequestUser, id: string, dto: NcrCloseDto): Promise<NcrDto> {
    const cur = await this.loadNcr(user, id);
    await this.access.assertCanRaiseNcr(user, cur.projectId);
    if (cur.status !== 'ACTION_TAKEN') throw new BadRequestException(cur.status === 'CLOSED' ? 'This NCR is already closed' : 'Record the cause and corrective action before closing the NCR');
    await this.assertNcrLists(user, dto);
    await this.prisma.ncr.update({ where: { id }, data: { status: 'CLOSED', closedById: user.id, closedAt: new Date(), closureNote: dto.note || null, ...(dto.reworkCost !== undefined ? { reworkCost: dto.reworkCost || null } : {}) } });
    await this.audit.log(user, 'NCR', id, 'CLOSED', dto.note || null);
    const updated = await this.getNcr(user, id);
    if (updated.actionById) await this.tell(user, [updated.actionById], updated, `NCR closed: ${updated.ncrNo}`, `${user.fullName} verified the corrective action on ${updated.title}.${dto.note ? ` ${dto.note}` : ''}`, `CLOSED:${Date.now()}`);
    return updated;
  }

  /** The action did not put it right (or a closed NCR recurred): back to site. */
  async reopen(user: RequestUser, id: string, dto: NcrReopenDto): Promise<NcrDto> {
    const cur = await this.loadNcr(user, id);
    await this.access.assertCanRaiseNcr(user, cur.projectId);
    if (cur.status === 'OPEN') throw new BadRequestException('This NCR is already open');
    await this.prisma.ncr.update({ where: { id }, data: { status: 'OPEN', closedById: null, closedAt: null, closureNote: null } });
    await this.audit.log(user, 'NCR', id, 'REOPENED', dto.note);
    const updated = await this.getNcr(user, id);
    if (updated.actionById) await this.tell(user, [updated.actionById], updated, `NCR reopened: ${updated.ncrNo}`, `${user.fullName}: ${dto.note}`, `REOPENED:${Date.now()}`);
    return updated;
  }

  /** For an NCR raised by mistake: its raiser or an approver, before any action is recorded. */
  async removeNcr(user: RequestUser, id: string) {
    const cur = await this.loadNcr(user, id);
    if (cur.raisedById !== user.id && !canApprove(user.roleKey)) throw new ForbiddenException('Only whoever raised the NCR or an approver can delete it');
    if (cur.status !== 'OPEN' || cur.actionAt) throw new BadRequestException('An NCR with the action recorded cannot be deleted; close it instead');
    await this.prisma.ncr.delete({ where: { id } });
    await this.audit.log(user, 'NCR', id, 'DELETED');
    return { ok: true };
  }

  async ncrHistory(user: RequestUser, id: string) {
    await this.loadNcr(user, id);
    return this.audit.forEntity(user.organizationId, 'NCR', id);
  }

  /** Raised: the person to rectify it and the project manager; a major or critical one also the project's approvers. */
  private async notifyRaised(user: RequestUser, n: NcrDto) {
    try {
      const pm = await this.prisma.project.findUnique({ where: { id: n.projectId }, select: { projectManagerId: true } });
      const approvers = n.severity === 'MINOR' ? [] : (await this.access.approversForProject(user.organizationId, n.projectId)).map((u) => u.id);
      const others = [...(pm?.projectManagerId ? [pm.projectManagerId] : []), ...approvers].filter((u) => u !== n.actionById);
      if (n.actionById && n.actionById !== user.id) await this.notifyAssigned(user, n);
      await this.tell(user, others, n, `${NCR_SEVERITY_LABELS[n.severity]} NCR raised: ${n.title}`, `${n.ncrNo} at ${n.projectName}, raised by ${n.raisedByName}${n.location ? ` at ${n.location}` : ''}.`, 'RAISED');
    } catch (e) {
      this.log.warn(`NCR notification failed: ${(e as Error).message}`);
    }
  }

  private notifyAssigned(user: RequestUser, n: NcrDto) {
    return this.tell(user, [n.actionById!], n, `NCR to rectify: ${n.title}`, `${n.ncrNo} at ${n.projectName}${n.dueDate ? `, by ${n.dueDate}` : ''}. Record the cause and corrective action when done.`, `ASSIGNED:${n.actionById}`);
  }

  private async tell(user: RequestUser, userIds: string[], n: NcrDto, title: string, body: string, key: string) {
    const to = [...new Set(userIds)].filter((u) => u !== user.id);
    if (!to.length) return;
    try {
      await this.notifications.notify({ organizationId: user.organizationId, userIds: to, type: 'NCR', title, body, projectId: n.projectId, entityId: n.id, dedupeKey: `NCR:${n.id}:${key}` });
    } catch (e) {
      this.log.warn(`NCR notification failed: ${(e as Error).message}`);
    }
  }

  /* ---------- summary ---------- */

  async summary(user: RequestUser, projectId?: string): Promise<QualitySummaryDto> {
    const base = { ...this.access.submissionWhere(user), ...(projectId ? { projectId } : {}) };
    const today = parseDate(todayIn());
    const [inspectionsWaiting, testsPending, testsOverdue, testsFailed, ncrsOpen, ncrsOverdue] = await Promise.all([
      this.prisma.inspection.count({ where: { ...base, status: 'SUBMITTED' } }),
      this.prisma.qualityTest.count({ where: { ...base, result: 'PENDING' } }),
      this.prisma.qualityTest.count({ where: { ...base, readings: { some: { value: null, dueOn: { lt: today } } } } }),
      this.prisma.qualityTest.count({ where: { ...base, result: 'FAIL' } }),
      this.prisma.ncr.count({ where: { ...base, status: { not: 'CLOSED' } } }),
      this.prisma.ncr.count({ where: { ...base, status: { not: 'CLOSED' }, dueDate: { lt: today } } }),
    ]);
    return { inspectionsWaiting, testsPending, testsOverdue, testsFailed, ncrsOpen, ncrsOverdue };
  }
}

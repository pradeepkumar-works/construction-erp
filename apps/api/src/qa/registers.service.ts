import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  STANDARD_MTC_CATEGORIES,
  accreditationState,
  certificateNeeded,
  calibrationDaysFor,
  calibrationProblem,
  calibrationState,
  canManageQaPlan,
  isGuest,
  labProblem,
  reportWait,
  sampleState,
  type CalibrationDto,
  type CertificateMissingDto,
  type CalibrationRegisterDto,
  type CalibrationResult,
  type LabKind,
  type LabSampleDto,
  type LabSamplesDto,
  type QaInstrumentDto,
  type QaLabDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService } from '../common/attachments.service';
import { MastersService } from '../masters/masters.service';
import { todayIn } from '../notifications/time';
import { dateOnly, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { pageArgs } from '../common/paging';
import { CertificateCategoriesDto, InstrumentsQuery, LabSamplesQuery, RecordCalibrationDto, SaveInstrumentDto, SaveLabDto } from './registers.dto';

const instrumentInclude = {
  project: { select: { name: true } },
  lab: { select: { name: true } },
} satisfies Prisma.QaInstrumentInclude;
type InstrumentRow = Prisma.QaInstrumentGetPayload<{ include: typeof instrumentInclude }>;

/**
 * QA/QC registers (item 137 part 2, ARCHITECTURE "QA/QC"): the labs tests go to and the samples waiting on them, the
 * calibration register, and which receipts need the maker's test certificate. Where each stands is pure in
 * `@erp/shared/qa-registers.ts`.
 */
@Injectable()
export class QaRegistersService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private masters: MastersService,
  ) {}

  private assertView(user: RequestUser) {
    if (isGuest(user.roleKey)) throw new ForbiddenException('The QA/QC registers are for the company’s own staff');
  }

  private assertManage(user: RequestUser) {
    if (!canManageQaPlan(user.roleKey)) throw new ForbiddenException('Only QA/QC, a project manager, management or an admin keeps the labs and the calibration register');
  }

  /** Rows of the company, or of a project the user is on. */
  private projectScope(user: RequestUser) {
    return { OR: [{ projectId: null }, { project: this.access.projectWhere(user) }] };
  }

  /* ---------- labs ---------- */

  async labs(user: RequestUser): Promise<QaLabDto[]> {
    this.assertView(user);
    const today = todayIn();
    const [rows, counts] = await Promise.all([
      this.prisma.qaLab.findMany({ where: { organizationId: user.organizationId }, include: { project: { select: { name: true } } }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      this.prisma.qualityTest.groupBy({ by: ['labId', 'reportOn'], where: { organizationId: user.organizationId, labId: { not: null }, sentOn: { not: null } }, _count: { _all: true } }),
    ]);
    const atLab = new Map<string, number>();
    const reported = new Map<string, number>();
    for (const c of counts) {
      const m = c.reportOn ? reported : atLab;
      m.set(c.labId!, (m.get(c.labId!) ?? 0) + c._count._all);
    }
    return rows.map((r) => {
      const nablValidTill = dateOnly(r.nablValidTill);
      return {
        id: r.id,
        name: r.name,
        kind: r.kind as LabKind,
        nablNo: r.nablNo,
        nablValidTill,
        accreditation: accreditationState({ kind: r.kind as LabKind, nablValidTill }, today),
        projectId: r.projectId,
        projectName: r.project?.name ?? null,
        address: r.address,
        contact: r.contact,
        phone: r.phone,
        email: r.email,
        active: r.active,
        notes: r.notes,
        atLab: atLab.get(r.id) ?? 0,
        reported: reported.get(r.id) ?? 0,
      };
    });
  }

  private async labData(user: RequestUser, dto: SaveLabDto) {
    const problem = labProblem({ name: dto.name, kind: dto.kind, nablNo: dto.nablNo, nablValidTill: dto.nablValidTill });
    if (problem) throw new BadRequestException(problem);
    if (dto.kind === 'SITE' && !dto.projectId) throw new BadRequestException('Choose the project the site lab is at');
    if (dto.projectId) await this.access.assertCanAccessProject(user, dto.projectId);
    return {
      name: dto.name,
      kind: dto.kind,
      nablNo: dto.kind === 'NABL' ? dto.nablNo!.toUpperCase() : null,
      nablValidTill: dto.kind === 'NABL' && dto.nablValidTill ? parseDate(dto.nablValidTill) : null,
      projectId: dto.kind === 'SITE' ? dto.projectId! : null,
      address: dto.address ?? null,
      contact: dto.contact ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      active: dto.active ?? true,
      notes: dto.notes ?? null,
    };
  }

  async saveLab(user: RequestUser, id: string | null, dto: SaveLabDto): Promise<QaLabDto> {
    this.assertManage(user);
    const data = await this.labData(user, dto);
    try {
      if (id) {
        await this.lab(user, id);
        await this.prisma.qaLab.update({ where: { id }, data });
      } else {
        id = (await this.prisma.qaLab.create({ data: { organizationId: user.organizationId, ...data } })).id;
      }
    } catch (e) {
      if (isUniqueViolation(e)) throw new BadRequestException(`There is already a lab called ${dto.name}`);
      throw e;
    }
    await this.audit.log(user, 'QA_LAB', id, 'SAVED', dto.name);
    return (await this.labs(user)).find((l) => l.id === id)!;
  }

  private async lab(user: RequestUser, id: string) {
    const row = await this.prisma.qaLab.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Lab not found');
    return row;
  }

  /** A lab nothing was sent to is deleted; one with samples or instruments is switched off instead. */
  async removeLab(user: RequestUser, id: string) {
    this.assertManage(user);
    await this.lab(user, id);
    const used = (await this.prisma.qualityTest.count({ where: { labId: id } })) + (await this.prisma.qaInstrument.count({ where: { labId: id } }));
    if (used) {
      await this.prisma.qaLab.update({ where: { id }, data: { active: false } });
      await this.audit.log(user, 'QA_LAB', id, 'SWITCHED_OFF');
      return { ok: true, switchedOff: true };
    }
    await this.prisma.qaLab.delete({ where: { id } });
    await this.audit.log(user, 'QA_LAB', id, 'DELETED');
    return { ok: true, switchedOff: false };
  }

  /* ---------- samples sent out ---------- */

  /** Tests sent to a lab: waiting for their report (oldest first), or reported. */
  async samples(user: RequestUser, q: LabSamplesQuery): Promise<LabSamplesDto> {
    this.assertView(user);
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const today = todayIn();
    const where: Prisma.QualityTestWhereInput = {
      ...this.access.submissionWhere(user),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      labId: q.labId ?? { not: null },
      sentOn: { not: null },
      ...(q.state === 'AT_LAB' ? { reportOn: null } : q.state === 'REPORTED' ? { reportOn: { not: null } } : {}),
    };
    const rows = await this.prisma.qualityTest.findMany({
      where,
      include: { project: { select: { name: true } }, lab: { select: { name: true } }, readings: { select: { dueOn: true } } },
      orderBy: [{ sentOn: 'asc' }, { testNo: 'asc' }],
      take: 2000,
    });
    let items: LabSampleDto[] = rows.map((t) => {
      const sentOn = dateOnly(t.sentOn)!;
      const reportOn = dateOnly(t.reportOn);
      const lastDueOn = t.readings.map((r) => dateOnly(r.dueOn)).filter((d): d is string => !!d).sort().pop() ?? null;
      const wait = reportWait({ labId: t.labId, sentOn, reportOn, lastDueOn }, today);
      return {
        testId: t.id,
        testNo: t.testNo,
        title: t.title,
        projectId: t.projectId,
        projectName: t.project.name,
        labId: t.labId!,
        labName: t.lab!.name,
        sentOn,
        reportOn,
        labReportNo: t.labReportNo,
        labCharge: money(t.labCharge),
        state: sampleState({ labId: t.labId, sentOn, reportOn }),
        waitDays: wait?.days ?? null,
        late: wait?.late ?? false,
        result: t.result,
      };
    });
    if (q.late) items = items.filter((s) => s.late);
    // Waiting ones first (longest wait at the top), then reports newest first.
    items.sort((a, b) => (a.state === b.state ? (a.state === 'AT_LAB' ? a.sentOn.localeCompare(b.sentOn) : (b.reportOn ?? '').localeCompare(a.reportOn ?? '')) : a.state === 'AT_LAB' ? -1 : 1));
    const charges = items.reduce((s, i) => s + Number(i.labCharge ?? 0), 0);
    const args = pageArgs(q);
    return {
      items: items.slice(args.skip, args.skip + args.take),
      total: items.length,
      atLab: items.filter((i) => i.state === 'AT_LAB').length,
      late: items.filter((i) => i.late).length,
      charges: charges.toFixed(2),
    };
  }

  /* ---------- instruments and calibration ---------- */

  private async kindNames(organizationId: string) {
    return new Map((await this.masters.entriesFor(organizationId, 'instrumentKind')).map((e) => [e.code, e.name]));
  }

  private toInstrument(r: InstrumentRow, names: Map<string, string>, today: string): QaInstrumentDto {
    const base = { lastCalibratedOn: dateOnly(r.lastCalibratedOn), nextDueOn: dateOnly(r.nextDueOn), intervalDays: r.intervalDays, lastResult: (r.lastResult as CalibrationResult | null) ?? null, active: r.active };
    const st = calibrationState(base, today);
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      kindName: names.get(r.kind) ?? r.kind,
      serialNo: r.serialNo,
      make: r.make,
      range: r.range,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      labId: r.labId,
      labName: r.lab?.name ?? null,
      intervalDays: r.intervalDays,
      lastCalibratedOn: base.lastCalibratedOn,
      lastResult: base.lastResult,
      certificateNo: r.certificateNo,
      state: st.state,
      dueOn: st.dueOn,
      daysLeft: st.daysLeft,
      active: r.active,
      notes: r.notes,
    };
  }

  async instruments(user: RequestUser, q: InstrumentsQuery): Promise<CalibrationRegisterDto> {
    this.assertView(user);
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const today = todayIn();
    const [rows, names] = await Promise.all([
      this.prisma.qaInstrument.findMany({
        where: { organizationId: user.organizationId, ...this.projectScope(user), ...(q.projectId ? { projectId: q.projectId } : {}) },
        include: instrumentInclude,
        orderBy: [{ nextDueOn: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
      }),
      this.kindNames(user.organizationId),
    ]);
    const all = rows.map((r) => this.toInstrument(r, names, today));
    const order = { OVERDUE: 0, OUT_OF_USE: 1, NEVER: 2, DUE_SOON: 3, OK: 4 } as const;
    all.sort((a, b) => order[a.state] - order[b.state] || (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || a.name.localeCompare(b.name));
    const items = q.attention ? all.filter((i) => i.state !== 'OK' && i.active) : all;
    return {
      items,
      overdue: all.filter((i) => i.state === 'OVERDUE').length,
      dueSoon: all.filter((i) => i.state === 'DUE_SOON').length,
      outOfUse: all.filter((i) => i.state === 'OUT_OF_USE' && i.active).length,
    };
  }

  private async instrumentRow(user: RequestUser, id: string) {
    const row = await this.prisma.qaInstrument.findFirst({ where: { id, organizationId: user.organizationId, ...this.projectScope(user) }, include: instrumentInclude });
    if (!row) throw new NotFoundException('Instrument not found');
    return row;
  }

  async instrument(user: RequestUser, id: string): Promise<QaInstrumentDto> {
    this.assertView(user);
    const row = await this.instrumentRow(user, id);
    const history = await this.prisma.qaCalibration.findMany({
      where: { instrumentId: id },
      include: { createdBy: { select: { fullName: true } }, attachments: true },
      orderBy: { calibratedOn: 'desc' },
    });
    return {
      ...this.toInstrument(row, await this.kindNames(user.organizationId), todayIn()),
      history: history.map(
        (c): CalibrationDto => ({
          id: c.id,
          calibratedOn: dateOnly(c.calibratedOn)!,
          certificateNo: c.certificateNo,
          agency: c.agency,
          result: c.result as CalibrationResult,
          nextDueOn: dateOnly(c.nextDueOn),
          remarks: c.remarks,
          createdByName: c.createdBy.fullName,
          attachments: c.attachments.map((a) => this.attachments.toDto(a)),
        }),
      ),
    };
  }

  private async instrumentData(user: RequestUser, dto: SaveInstrumentDto) {
    const kinds = await this.kindNames(user.organizationId);
    if (!kinds.has(dto.kind)) throw new BadRequestException('Choose the kind from the list (Masters › Instrument kinds)');
    if (dto.projectId) await this.access.assertCanAccessProject(user, dto.projectId);
    if (dto.labId) await this.lab(user, dto.labId);
    return {
      name: dto.name,
      kind: dto.kind,
      serialNo: dto.serialNo ?? null,
      make: dto.make ?? null,
      range: dto.range ?? null,
      projectId: dto.projectId ?? null,
      labId: dto.labId ?? null,
      intervalDays: dto.intervalDays ?? calibrationDaysFor(dto.kind),
      active: dto.active ?? true,
      notes: dto.notes ?? null,
    };
  }

  async saveInstrument(user: RequestUser, id: string | null, dto: SaveInstrumentDto): Promise<QaInstrumentDto> {
    this.assertManage(user);
    const data = await this.instrumentData(user, dto);
    if (id) {
      // A new interval counts from the next calibration; the due day the last certificate gave stays.
      await this.instrumentRow(user, id);
      await this.prisma.qaInstrument.update({ where: { id }, data });
    } else {
      id = (await this.prisma.qaInstrument.create({ data: { organizationId: user.organizationId, ...data } })).id;
    }
    await this.audit.log(user, 'QA_INSTRUMENT', id, 'SAVED', dto.name);
    return this.instrument(user, id);
  }

  async removeInstrument(user: RequestUser, id: string) {
    this.assertManage(user);
    await this.instrumentRow(user, id);
    if ((await this.prisma.qualityTest.count({ where: { instrumentId: id } })) || (await this.prisma.qaCalibration.count({ where: { instrumentId: id } }))) {
      await this.prisma.qaInstrument.update({ where: { id }, data: { active: false } });
      await this.audit.log(user, 'QA_INSTRUMENT', id, 'SWITCHED_OFF');
      return { ok: true, switchedOff: true };
    }
    await this.prisma.qaInstrument.delete({ where: { id } });
    await this.audit.log(user, 'QA_INSTRUMENT', id, 'DELETED');
    return { ok: true, switchedOff: false };
  }

  /** Records a calibration; the latest one sets the instrument's last calibration, result and next due day. */
  async recordCalibration(user: RequestUser, id: string, dto: RecordCalibrationDto): Promise<QaInstrumentDto> {
    this.assertManage(user);
    const inst = await this.instrumentRow(user, id);
    const problem = calibrationProblem(dto, todayIn());
    if (problem) throw new BadRequestException(problem);
    const calibratedOn = parseDate(dto.calibratedOn);
    const nextDueOn = dto.result === 'FAILED' ? null : dto.nextDueOn ? parseDate(dto.nextDueOn) : new Date(calibratedOn.getTime() + inst.intervalDays * 86_400_000);
    const cal = await this.prisma.$transaction(async (tx) => {
      const c = await tx.qaCalibration.create({
        data: {
          organizationId: user.organizationId,
          instrumentId: id,
          calibratedOn,
          certificateNo: dto.certificateNo ?? null,
          agency: dto.agency ?? null,
          result: dto.result,
          nextDueOn,
          remarks: dto.remarks ?? null,
          createdById: user.id,
        },
      });
      if (!inst.lastCalibratedOn || calibratedOn >= inst.lastCalibratedOn) {
        await tx.qaInstrument.update({ where: { id }, data: { lastCalibratedOn: calibratedOn, nextDueOn, lastResult: dto.result, certificateNo: dto.certificateNo ?? null } });
      }
      return c;
    });
    await this.attachments.link(user, 'qaCalibrationId', cal.id, dto.attachmentIds);
    await this.audit.log(user, 'QA_INSTRUMENT', id, 'CALIBRATED', `${dto.calibratedOn} ${dto.result}${dto.certificateNo ? ` ${dto.certificateNo}` : ''}`);
    return this.instrument(user, id);
  }

  /* ---------- test certificates ---------- */

  async certificateCategories(user: RequestUser): Promise<{ categories: string[]; standard: string[]; canEdit: boolean }> {
    this.assertView(user);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { mtcCategories: true } });
    return { categories: org.mtcCategories, standard: STANDARD_MTC_CATEGORIES, canEdit: canManageQaPlan(user.roleKey) };
  }

  /** Receipts not rejected whose items need the maker's test certificate and that have none, newest first. */
  async certificatesMissing(user: RequestUser, projectId?: string): Promise<CertificateMissingDto[]> {
    this.assertView(user);
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { mtcCategories: true } });
    if (!org.mtcCategories.length) return [];
    const rows = await this.prisma.stockEntry.findMany({
      where: {
        ...this.access.submissionWhere(user),
        ...(projectId ? { projectId } : {}),
        type: 'RECEIPT',
        mtcNo: null,
        OR: [{ qcStatus: null }, { qcStatus: { not: 'REJECTED' } }],
        project: { ...this.access.projectWhere(user), status: { not: 'CLOSED' } },
      },
      select: { id: true, entryNo: true, date: true, supplier: true, projectId: true, qcStatus: true, project: { select: { name: true } }, lines: { select: { item: { select: { name: true, category: true } } } } },
      orderBy: { date: 'desc' },
      take: 500,
    });
    return rows
      .filter((r) => certificateNeeded(r.lines.map((l) => l.item.category), org.mtcCategories))
      .map((r) => ({
        id: r.id,
        entryNo: r.entryNo,
        date: dateOnly(r.date)!,
        projectId: r.projectId,
        projectName: r.project.name,
        supplier: r.supplier,
        items: [...new Set(r.lines.filter((l) => certificateNeeded([l.item.category], org.mtcCategories)).map((l) => l.item.name))],
        checked: r.qcStatus !== null,
      }));
  }

  async saveCertificateCategories(user: RequestUser, dto: CertificateCategoriesDto) {
    this.assertManage(user);
    const known = new Set((await this.masters.entriesFor(user.organizationId, 'itemCategory')).map((e) => e.code));
    const unknown = dto.categories.filter((c) => !known.has(c));
    if (unknown.length) throw new BadRequestException(`Choose item categories from the list (Masters › Item categories): ${unknown.join(', ')} is not one`);
    const categories = [...new Set(dto.categories)];
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { mtcCategories: categories } });
    await this.audit.log(user, 'ORGANIZATION', user.organizationId, 'MTC_CATEGORIES', categories.join(', ') || 'none');
    return this.certificateCategories(user);
  }
}

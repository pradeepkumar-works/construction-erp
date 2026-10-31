import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  POUR_CARD_CHECKLIST,
  canRecordPour,
  concreteGrade,
  cubeSetsFor,
  pourFlags,
  type Paginated,
  type PourDto,
  type PourSource,
  type PourStatus,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { InspectionsService } from '../inspections/inspections.service';
import { todayIn } from '../notifications/time';
import { dateOnly, dec, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CancelPourDto, CreatePourDto, ListPoursQuery, PouredDto, UpdatePourDto } from './qa.dto';

const pourInclude = {
  project: { select: { name: true } },
  activity: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  inspection: { select: { id: true, inspectionNo: true, status: true } },
  tests: {
    select: { id: true, testNo: true, sampledOn: true, result: true, readings: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { value: true } } },
    orderBy: [{ sampledOn: 'asc' }, { testNo: 'asc' }],
  },
} satisfies Prisma.PourInclude;
type PourRow = Prisma.PourGetPayload<{ include: typeof pourInclude }>;

/**
 * The pour register: a pour is planned with its grade and volume, cleared by its pour card (an inspection with
 * the card's points, passed by QA/QC), recorded poured with the volume placed, and owes the cube sets IS 456 asks for that
 * volume. Cube sets are tests recorded against the pour (`QualityTest.pourId`); the grade's acceptance is in `QaService.cubes`.
 */
@Injectable()
export class PoursService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private inspections: InspectionsService,
  ) {}

  toDto(r: PourRow): PourDto {
    const volume = r.status === 'POURED' ? dec(r.volume) : null;
    const cardPassed = r.inspection?.status === 'APPROVED';
    const status = r.status as PourStatus;
    return {
      id: r.id,
      pourNo: r.pourNo,
      projectId: r.projectId,
      projectName: r.project.name,
      activityId: r.activityId,
      activityName: r.activity.name,
      date: dateOnly(r.date),
      location: r.location,
      grade: r.grade,
      plannedVolume: dec(r.plannedVolume),
      volume,
      source: r.source as PourSource,
      supplier: r.supplier,
      status,
      remarks: r.remarks,
      card: r.inspection ? { id: r.inspection.id, inspectionNo: r.inspection.inspectionNo, status: r.inspection.status } : null,
      cardPassed,
      tests: r.tests.map((x) => ({ id: x.id, testNo: x.testNo, sampledOn: dateOnly(x.sampledOn), result: x.result, value: dec(x.readings[x.readings.length - 1]?.value ?? null) })),
      cubeSetsDue: cubeSetsFor(Number(volume ?? r.plannedVolume)),
      flags: pourFlags({ status, volume: volume === null ? null : Number(volume), cardPassed, cubeSets: r.tests.length }),
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
    };
  }

  private where(user: RequestUser, q: ListPoursQuery): Prisma.PourWhereInput {
    const where: Prisma.PourWhereInput = { ...this.access.submissionWhere(user) };
    const and: Prisma.PourWhereInput[] = [];
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    if (q.grade) where.grade = concreteGrade(q.grade) ?? q.grade;
    for (const w of searchWords(q.q)) and.push({ OR: [{ pourNo: ilike(w) }, { location: ilike(w) }, { grade: ilike(w) }, { supplier: ilike(w) }, { activity: { name: ilike(w) } }, { project: { name: ilike(w) } }] });
    if (and.length) where.AND = and;
    return where;
  }

  async list(user: RequestUser, q: ListPoursQuery): Promise<Paginated<PourDto>> {
    const where = this.where(user, q);
    const args = pageArgs(q);
    if (q.flagged) {
      // Flags are worked out from the card and the cube sets, so the poured ones are read and filtered here.
      const rows = await this.prisma.pour.findMany({ where: { ...where, status: 'POURED' }, include: pourInclude, orderBy: [{ date: 'desc' }, { pourNo: 'desc' }] });
      const flagged = rows.map((r) => this.toDto(r)).filter((p) => p.flags.length);
      return paginated(flagged.slice(args.skip, args.skip + args.take), flagged.length, args);
    }
    const o = q.sortOrder ?? (q.sortBy === 'grade' ? 'asc' : 'desc');
    const orderBy: Prisma.PourOrderByWithRelationInput[] = q.sortBy === 'pourNo' ? [{ pourNo: o }] : q.sortBy === 'grade' ? [{ grade: o }, { date: 'desc' }] : [{ date: o }, { pourNo: o }];
    const [rows, total] = await Promise.all([
      this.prisma.pour.findMany({ where, include: pourInclude, orderBy, skip: args.skip, take: args.take }),
      this.prisma.pour.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<PourDto> {
    const row = await this.prisma.pour.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: pourInclude });
    if (!row) throw new NotFoundException('Pour not found');
    return this.toDto(row);
  }

  private async assertCan(user: RequestUser, projectId: string) {
    if (!canRecordPour(user.roleKey)) throw new ForbiddenException('Your role cannot plan or record pours');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async assertActivity(projectId: string, activityId: string) {
    if (!(await this.prisma.activity.count({ where: { id: activityId, projectId } }))) throw new NotFoundException('Activity not found in this project');
  }

  private grade(text: string) {
    const g = concreteGrade(text);
    if (!g) throw new BadRequestException('Write the grade as M20, M25…');
    return g;
  }

  private volume(v: string, what: string) {
    const n = Number(v);
    if (!(n > 0) || n > 100000) throw new BadRequestException(`Give the ${what} in m³, more than 0`);
    return v;
  }

  async create(user: RequestUser, dto: CreatePourDto): Promise<PourDto> {
    if (dto.id) {
      const existing = await this.prisma.pour.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.get(user, existing.id);
    }
    await this.assertCan(user, dto.projectId);
    await this.assertActivity(dto.projectId, dto.activityId);
    const grade = this.grade(dto.grade);
    this.volume(dto.plannedVolume, 'volume');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const pourNo = await nextDocNo(tx, user.organizationId, 'POUR', async (prefix) =>
          (await tx.pour.findFirst({ where: { organizationId: user.organizationId, pourNo: { startsWith: prefix } }, orderBy: { pourNo: 'desc' }, select: { pourNo: true } }))?.pourNo ?? null,
        );
        const row = await tx.pour.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            activityId: dto.activityId,
            pourNo,
            date: parseDate(dto.date),
            location: dto.location,
            grade,
            plannedVolume: dto.plannedVolume,
            source: dto.source ?? 'RMC',
            supplier: dto.supplier || null,
            remarks: dto.remarks || null,
            createdById: user.id,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) return this.get(user, dto.id);
      throw e;
    }
    await this.audit.log(user, 'POUR', id, 'CREATED');
    return this.get(user, id);
  }

  private async load(user: RequestUser, id: string) {
    const row = await this.prisma.pour.findFirst({ where: { id, ...this.access.submissionWhere(user) }, select: { id: true, projectId: true, activityId: true, status: true, date: true, location: true, inspectionId: true, remarks: true, _count: { select: { tests: true } } } });
    if (!row) throw new NotFoundException('Pour not found');
    await this.assertCan(user, row.projectId);
    return row;
  }

  /** A planned pour changes; a poured one keeps its facts, only its remarks. */
  async update(user: RequestUser, id: string, dto: UpdatePourDto): Promise<PourDto> {
    const cur = await this.load(user, id);
    const facts = [dto.activityId, dto.date, dto.location, dto.grade, dto.plannedVolume, dto.source, dto.supplier].some((v) => v !== undefined);
    if (facts && cur.status !== 'PLANNED') throw new BadRequestException('Only a planned pour changes. Add a remark instead.');
    if (dto.activityId) await this.assertActivity(cur.projectId, dto.activityId);
    const data: Prisma.PourUncheckedUpdateInput = {};
    if (dto.activityId !== undefined) data.activityId = dto.activityId;
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.grade !== undefined) data.grade = this.grade(dto.grade);
    if (dto.plannedVolume !== undefined) data.plannedVolume = this.volume(dto.plannedVolume, 'volume');
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.supplier !== undefined) data.supplier = dto.supplier || null;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    await this.prisma.pour.update({ where: { id }, data });
    await this.audit.log(user, 'POUR', id, 'UPDATED');
    return this.get(user, id);
  }

  /** Ask QA/QC to clear the pour: an inspection with the pour card's points, on the pour's day and place. */
  async requestCard(user: RequestUser, id: string): Promise<PourDto> {
    const cur = await this.load(user, id);
    if (cur.status !== 'PLANNED') throw new BadRequestException('A card is asked for before the pour');
    if (cur.inspectionId) {
      const card = await this.prisma.inspection.findUnique({ where: { id: cur.inspectionId }, select: { status: true } });
      if (card && card.status !== 'REJECTED') throw new BadRequestException('This pour already has its card');
    }
    const today = todayIn();
    const pourDay = dateOnly(cur.date);
    const inspection = await this.inspections.create(user, {
      projectId: cur.projectId,
      activityId: cur.activityId,
      date: pourDay > today ? today : pourDay,
      location: cur.location,
      remarks: `Pour card for ${(await this.prisma.pour.findUniqueOrThrow({ where: { id }, select: { pourNo: true } })).pourNo}`,
      items: POUR_CARD_CHECKLIST.items,
      checklistName: POUR_CARD_CHECKLIST.name,
    });
    await this.prisma.pour.update({ where: { id }, data: { inspectionId: inspection.id } });
    await this.audit.log(user, 'POUR', id, 'CARD_REQUESTED');
    return this.get(user, id);
  }

  /** Record the pour placed: the volume and the day, today or before. A pour without a passed card is flagged, not stopped. */
  async poured(user: RequestUser, id: string, dto: PouredDto): Promise<PourDto> {
    const cur = await this.load(user, id);
    if (cur.status !== 'PLANNED') throw new BadRequestException(cur.status === 'POURED' ? 'This pour is already recorded' : 'A cancelled pour is not poured');
    this.volume(dto.volume, 'volume poured');
    const date = dto.date ?? dateOnly(cur.date);
    if (date > todayIn()) throw new BadRequestException('A pour is recorded on or after its day');
    await this.prisma.pour.update({
      where: { id },
      data: { status: 'POURED', volume: dto.volume, date: parseDate(date), pouredAt: new Date(), ...(dto.remarks ? { remarks: [cur.remarks, dto.remarks].filter(Boolean).join('\n') } : {}) },
    });
    await this.audit.log(user, 'POUR', id, 'POURED');
    return this.get(user, id);
  }

  async cancel(user: RequestUser, id: string, dto: CancelPourDto): Promise<PourDto> {
    const cur = await this.load(user, id);
    if (cur.status !== 'PLANNED') throw new BadRequestException('Only a planned pour is cancelled');
    await this.prisma.pour.update({ where: { id }, data: { status: 'CANCELLED', remarks: [cur.remarks, `Cancelled: ${dto.reason}`].filter(Boolean).join('\n') } });
    await this.audit.log(user, 'POUR', id, 'CANCELLED', dto.reason);
    return this.get(user, id);
  }

  /** A pour goes only while nothing hangs on it: no cube sets taken. */
  async remove(user: RequestUser, id: string) {
    const cur = await this.load(user, id);
    if (cur._count.tests) throw new BadRequestException('Cube sets were taken at this pour. Cancel it instead.');
    if (cur.status === 'POURED') throw new BadRequestException('A pour recorded as poured stays in the register');
    await this.prisma.pour.delete({ where: { id } });
    await this.audit.log(user, 'POUR', id, 'DELETED');
    return { ok: true };
  }

  /** The pour a cube set is taken at: on the test's project, poured or planned, and its grade for the plan line. */
  async forTest(projectId: string, pourId: string) {
    const p = await this.prisma.pour.findFirst({ where: { id: pourId, projectId }, select: { id: true, grade: true, status: true, location: true, activityId: true } });
    if (!p) throw new NotFoundException('Pour not found in this project');
    if (p.status === 'CANCELLED') throw new BadRequestException('This pour was cancelled');
    return p;
  }
}

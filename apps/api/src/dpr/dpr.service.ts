import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DailyReportDto, DprSortField, ManpowerLine, MachineryLine, Paginated, SortOrder } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService } from '../common/attachments.service';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreateDprDto, ListDprQuery, UpdateDprDto } from './dpr.dto';
import { AttendanceService } from '../attendance/attendance.service';

const include = {
  project: { select: { name: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: true,
} satisfies Prisma.DailyReportInclude;
type Row = Prisma.DailyReportGetPayload<{ include: typeof include }>;

const ORDER: Record<DprSortField, (o: SortOrder) => Prisma.DailyReportOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { createdAt: o }],
  createdAt: (o) => [{ createdAt: o }],
  submittedAt: (o) => [{ submittedAt: { sort: o, nulls: 'last' } }],
  status: (o) => [{ status: o }, { date: 'desc' }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  submittedBy: (o) => [{ submittedBy: { fullName: o } }, { date: 'desc' }],
};
const DESC_DEFAULT = new Set<string>(['date', 'createdAt', 'submittedAt']);

@Injectable()
export class DprService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
    private attendance: AttendanceService,
  ) {}

  toDto(r: Row): DailyReportDto {
    const manpower = (r.manpower as unknown as ManpowerLine[]) ?? [];
    const machinery = (r.machinery as unknown as MachineryLine[]) ?? [];
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      date: dateOnly(r.date)!,
      weather: r.weather,
      siteCondition: r.siteCondition,
      manpower,
      machinery,
      materialReceived: r.materialReceived,
      workExecuted: r.workExecuted,
      testsConducted: r.testsConducted,
      safetyObservations: r.safetyObservations,
      issues: r.issues,
      nextDayPlan: r.nextDayPlan,
      totalManpower: manpower.reduce((s, m) => s + (Number(m.count) || 0), 0),
      status: r.status,
      submittedById: r.submittedById,
      submittedByName: r.submittedBy.fullName,
      submittedAt: iso(r.submittedAt),
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      reviewedAt: iso(r.reviewedAt),
      reviewNote: r.reviewNote,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  async list(user: RequestUser, q: ListDprQuery): Promise<Paginated<DailyReportDto>> {
    const where: Prisma.DailyReportWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ workExecuted: ilike(w) }, { issues: ilike(w) }, { siteCondition: ilike(w) }, { project: { name: ilike(w) } }, { submittedBy: { fullName: ilike(w) } }],
      }));
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.dailyReport.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<DailyReportDto> {
    const row = await this.prisma.dailyReport.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Daily report not found');
    return this.toDto(row);
  }

  /** One DPR per project per day (a rejected one may be replaced). */
  private async assertNoDuplicate(projectId: string, date: Date, excludeId?: string) {
    const dup = await this.prisma.dailyReport.findFirst({
      where: { projectId, date, status: { not: 'REJECTED' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, status: true },
    });
    if (dup) throw new ConflictException(`A DPR for ${dateOnly(date)} already exists for this project (status ${dup.status}). Edit it instead of creating another.`);
  }

  /** Idempotent create: a DPR that already exists under the client-supplied id is returned as is. */
  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.dailyReport.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateDprDto): Promise<DailyReportDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanAccessProject(user, dto.projectId);
    await this.assertNoDuplicate(dto.projectId, parseDate(dto.date));
    // No manpower sent: take it from the day's attendance sheet, if the supervisor recorded one.
    const manpower = dto.manpower?.length ? dto.manpower : ((await this.attendance.manpowerFor(dto.projectId, parseDate(dto.date))) ?? []);
    let row: { id: string };
    try {
      row = await this.prisma.dailyReport.create({
        data: {
          id: dto.id,
          organizationId: user.organizationId,
          projectId: dto.projectId,
          date: parseDate(dto.date),
          weather: dto.weather ?? null,
          siteCondition: dto.siteCondition ?? null,
          manpower: manpower as unknown as Prisma.InputJsonValue,
          machinery: (dto.machinery ?? []) as unknown as Prisma.InputJsonValue,
          materialReceived: dto.materialReceived ?? null,
          workExecuted: dto.workExecuted,
          testsConducted: dto.testsConducted ?? null,
          safetyObservations: dto.safetyObservations ?? null,
          issues: dto.issues ?? null,
          nextDayPlan: dto.nextDayPlan ?? null,
          submittedById: user.id,
          status: 'DRAFT',
        },
        select: { id: true },
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.attachments.link(user, 'dailyReportId', row.id, dto.attachmentIds);
    await this.audit.log(user, 'DPR', row.id, 'CREATED');
    if (dto.submit !== false) await this.lifecycle.submit(user, 'DPR', row.id);
    return this.get(user, row.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateDprDto): Promise<DailyReportDto> {
    const row = await this.lifecycle.load(user, 'DPR', id);
    await this.lifecycle.assertEditable(user, row);
    const data: Prisma.DailyReportUncheckedUpdateInput = {};
    if (dto.date !== undefined) {
      await this.assertNoDuplicate(row.projectId, parseDate(dto.date), id);
      data.date = parseDate(dto.date);
    }
    if (dto.weather !== undefined) data.weather = dto.weather;
    if (dto.siteCondition !== undefined) data.siteCondition = dto.siteCondition;
    if (dto.manpower !== undefined) data.manpower = dto.manpower as unknown as Prisma.InputJsonValue;
    if (dto.machinery !== undefined) data.machinery = dto.machinery as unknown as Prisma.InputJsonValue;
    if (dto.materialReceived !== undefined) data.materialReceived = dto.materialReceived;
    if (dto.workExecuted !== undefined) data.workExecuted = dto.workExecuted;
    if (dto.testsConducted !== undefined) data.testsConducted = dto.testsConducted;
    if (dto.safetyObservations !== undefined) data.safetyObservations = dto.safetyObservations;
    if (dto.issues !== undefined) data.issues = dto.issues;
    if (dto.nextDayPlan !== undefined) data.nextDayPlan = dto.nextDayPlan;
    await this.prisma.dailyReport.update({ where: { id }, data });
    await this.attachments.sync(user, 'dailyReportId', id, dto.attachmentIds);
    await this.audit.log(user, 'DPR', id, 'UPDATED');
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  /** (Re)submit for approval. A rejected DPR may have been replaced by a newer one for the same day, so re-check. */
  async submit(user: RequestUser, id: string) {
    const current = await this.get(user, id);
    if (current.status === 'REJECTED') await this.assertNoDuplicate(current.projectId, parseDate(current.date), id);
    await this.lifecycle.submit(user, 'DPR', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'DPR', id);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.dailyReport.delete({ where: { id } });
    await this.audit.log(user, 'DPR', id, 'DELETED');
    return { ok: true };
  }
}

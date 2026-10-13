import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubmissionStatus } from '@prisma/client';
import {
  DEPARTMENTAL_CONTRACTOR,
  MANPOWER_CATEGORIES,
  attendanceToManpower,
  isAttendanceLocked,
  normalizeAttendanceLines,
  totalWorkers,
  type AttendanceDayDto,
  type AttendanceLineInput,
  type AttendanceSheetDto,
  type AttendanceSortField,
  type AttendanceSuggestionsDto,
  type ManpowerLine,
  type Paginated,
  type SortOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { AttendanceDayQuery, AttendanceSuggestionsQuery, CreateAttendanceDto, ListAttendanceQuery, UpdateAttendanceDto } from './attendance.dto';

const include = {
  project: { select: { name: true } },
  recordedBy: { select: { fullName: true } },
  updatedBy: { select: { fullName: true } },
  lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.AttendanceSheetInclude;
type Row = Prisma.AttendanceSheetGetPayload<{ include: typeof include }>;

const ORDER: Record<AttendanceSortField, (o: SortOrder) => Prisma.AttendanceSheetOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { project: { name: 'asc' } }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  totalWorkers: (o) => [{ totalWorkers: o }, { date: 'desc' }],
  recordedBy: (o) => [{ recordedBy: { fullName: o } }, { date: 'desc' }],
  updatedAt: (o) => [{ updatedAt: o }],
};
const DESC_DEFAULT = new Set<string>(['date', 'totalWorkers', 'updatedAt']);

const dayKey = (projectId: string, date: Date) => `${projectId}|${dateOnly(date)}`;

/**
 * Daily attendance register: one sheet per project per day with head counts by contractor and trade.
 * Not an approval submission. It feeds the day's DPR manpower and locks once that DPR is approved.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  toDto(r: Row, dprStatus: SubmissionStatus | null): AttendanceSheetDto {
    const lines = r.lines.map((l) => ({ id: l.id, contractor: l.contractor, category: l.category, count: l.count }));
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      date: dateOnly(r.date)!,
      remarks: r.remarks,
      totalWorkers: r.totalWorkers,
      lines,
      manpower: attendanceToManpower(lines),
      recordedById: r.recordedById,
      recordedByName: r.recordedBy.fullName,
      updatedByName: r.updatedBy?.fullName ?? null,
      dprStatus,
      locked: isAttendanceLocked(dprStatus),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  /**
   * Status of the DPR for each (project, day). DPRs are one per project per day except that a rejected one
   * may sit next to its replacement, so a non-rejected DPR wins.
   */
  private async dprStatuses(days: { projectId: string; date: Date }[]): Promise<Map<string, SubmissionStatus>> {
    const out = new Map<string, SubmissionStatus>();
    if (!days.length) return out;
    const dprs = await this.prisma.dailyReport.findMany({
      where: { OR: days.map((d) => ({ projectId: d.projectId, date: d.date })) },
      select: { projectId: true, date: true, status: true },
    });
    for (const d of dprs) {
      const k = dayKey(d.projectId, d.date);
      const prev = out.get(k);
      if (!prev || prev === 'REJECTED') out.set(k, d.status);
    }
    return out;
  }

  private async dprStatus(projectId: string, date: Date) {
    return (await this.dprStatuses([{ projectId, date }])).get(dayKey(projectId, date)) ?? null;
  }

  private async assertUnlocked(projectId: string, date: Date) {
    if (isAttendanceLocked(await this.dprStatus(projectId, date)))
      throw new ConflictException(`The DPR for ${dateOnly(date)} is approved, so its attendance can no longer be changed.`);
  }

  private async assertNoDuplicate(projectId: string, date: Date, excludeId?: string) {
    const dup = await this.prisma.attendanceSheet.findFirst({
      where: { projectId, date, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`Attendance for ${dateOnly(date)} is already recorded for this project. Edit that sheet instead.`);
  }

  private cleanLines(lines: AttendanceLineInput[], remarks: string | null | undefined) {
    const clean = normalizeAttendanceLines(lines);
    if (!clean.length && !remarks?.trim()) throw new BadRequestException('Add at least one row of workers, or a remark such as "Holiday" when nobody worked.');
    return clean;
  }

  private visibleWhere(user: RequestUser): Prisma.AttendanceSheetWhereInput {
    return { ...this.access.submissionWhere(user) };
  }

  async list(user: RequestUser, q: ListAttendanceQuery): Promise<Paginated<AttendanceSheetDto>> {
    const where: Prisma.AttendanceSheetWhereInput = this.visibleWhere(user);
    if (q.projectId) where.projectId = q.projectId;
    if (q.from || q.to) where.date = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { project: { name: ilike(w) } },
          { recordedBy: { fullName: ilike(w) } },
          { remarks: ilike(w) },
          { lines: { some: { OR: [{ contractor: ilike(w) }, { category: ilike(w) }] } } },
        ],
      }));
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.attendanceSheet.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.attendanceSheet.count({ where }),
    ]);
    const statuses = await this.dprStatuses(rows.map((r) => ({ projectId: r.projectId, date: r.date })));
    return paginated(rows.map((r) => this.toDto(r, statuses.get(dayKey(r.projectId, r.date)) ?? null)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<AttendanceSheetDto> {
    const row = await this.prisma.attendanceSheet.findFirst({ where: { id, ...this.visibleWhere(user) }, include });
    if (!row) throw new NotFoundException('Attendance sheet not found');
    return this.toDto(row, await this.dprStatus(row.projectId, row.date));
  }

  async day(user: RequestUser, q: AttendanceDayQuery): Promise<AttendanceDayDto> {
    await this.access.assertCanAccessProject(user, q.projectId);
    const date = parseDate(q.date);
    const [row, dprStatus] = await Promise.all([
      this.prisma.attendanceSheet.findFirst({ where: { projectId: q.projectId, date, organizationId: user.organizationId }, include }),
      this.dprStatus(q.projectId, date),
    ]);
    return { projectId: q.projectId, date: q.date, sheet: row ? this.toDto(row, dprStatus) : null, dprStatus, locked: isAttendanceLocked(dprStatus) };
  }

  /** Contractor and trade names for pickers: what this project (or the organisation) used before, plus defaults. */
  async suggestions(user: RequestUser, q: AttendanceSuggestionsQuery): Promise<AttendanceSuggestionsDto> {
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const sheet: Prisma.AttendanceSheetWhereInput = { ...this.visibleWhere(user), ...(q.projectId ? { projectId: q.projectId } : {}) };
    const [contractors, categories] = await Promise.all([
      this.prisma.attendanceLine.groupBy({ by: ['contractor'], where: { sheet }, _count: { _all: true }, orderBy: { _count: { contractor: 'desc' } }, take: 50 }),
      this.prisma.attendanceLine.groupBy({ by: ['category'], where: { sheet }, _count: { _all: true }, orderBy: { _count: { category: 'desc' } }, take: 50 }),
    ]);
    const uniq = (xs: string[]) => {
      const seen = new Set<string>();
      return xs.filter((x) => {
        const k = x.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    return {
      contractors: uniq([DEPARTMENTAL_CONTRACTOR, ...contractors.map((c) => c.contractor)]),
      categories: uniq([...categories.map((c) => c.category), ...MANPOWER_CATEGORIES]),
    };
  }

  /** Manpower by trade for the project's attendance on that day, or null when nothing was recorded. Used to fill a new DPR. */
  async manpowerFor(projectId: string, date: Date): Promise<ManpowerLine[] | null> {
    const row = await this.prisma.attendanceSheet.findUnique({ where: { projectId_date: { projectId, date } }, include: { lines: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } });
    if (!row || !row.lines.length) return null;
    return attendanceToManpower(row.lines);
  }

  /** Idempotent create: a sheet that already exists under the client-supplied id is returned as is. */
  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.attendanceSheet.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateAttendanceDto): Promise<AttendanceSheetDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanRecordAttendance(user, dto.projectId);
    const date = parseDate(dto.date);
    const lines = this.cleanLines(dto.lines, dto.remarks);
    await this.assertUnlocked(dto.projectId, date);
    await this.assertNoDuplicate(dto.projectId, date);
    let id: string;
    try {
      const row = await this.prisma.attendanceSheet.create({
        data: {
          id: dto.id,
          organizationId: user.organizationId,
          projectId: dto.projectId,
          date,
          remarks: dto.remarks?.trim() || null,
          totalWorkers: totalWorkers(lines),
          recordedById: user.id,
          lines: { create: lines.map((l, i) => ({ ...l, sortOrder: i })) },
        },
        select: { id: true },
      });
      id = row.id;
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Either a retry of this same request won the race, or someone else recorded the day meanwhile.
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
        throw new ConflictException(`Attendance for ${dto.date} is already recorded for this project. Edit that sheet instead.`);
      }
      throw e;
    }
    await this.audit.log(user, 'ATTENDANCE', id, 'CREATED', `${dto.date}: ${totalWorkers(lines)} workers`);
    return this.get(user, id);
  }

  private async loadForWrite(user: RequestUser, id: string) {
    const row = await this.prisma.attendanceSheet.findFirst({ where: { id, ...this.visibleWhere(user) }, select: { id: true, projectId: true, date: true, remarks: true } });
    if (!row) throw new NotFoundException('Attendance sheet not found');
    await this.access.assertCanRecordAttendance(user, row.projectId);
    await this.assertUnlocked(row.projectId, row.date);
    return row;
  }

  async update(user: RequestUser, id: string, dto: UpdateAttendanceDto): Promise<AttendanceSheetDto> {
    const row = await this.loadForWrite(user, id);
    const data: Prisma.AttendanceSheetUncheckedUpdateInput = { updatedById: user.id };
    if (dto.date !== undefined) {
      const date = parseDate(dto.date);
      if (date.getTime() !== row.date.getTime()) {
        await this.assertUnlocked(row.projectId, date);
        await this.assertNoDuplicate(row.projectId, date, id);
      }
      data.date = date;
    }
    if (dto.remarks !== undefined) data.remarks = dto.remarks?.trim() || null;
    const remarks = dto.remarks !== undefined ? dto.remarks : row.remarks;
    let lines: AttendanceLineInput[] | null = null;
    if (dto.lines !== undefined) {
      lines = this.cleanLines(dto.lines, remarks);
      data.totalWorkers = totalWorkers(lines);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.attendanceSheet.update({ where: { id }, data });
        if (lines) {
          await tx.attendanceLine.deleteMany({ where: { sheetId: id } });
          await tx.attendanceLine.createMany({ data: lines.map((l, i) => ({ ...l, sheetId: id, sortOrder: i })) });
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Attendance for ${dto.date} is already recorded for this project.`);
      throw e;
    }
    const saved = await this.get(user, id);
    await this.audit.log(user, 'ATTENDANCE', id, 'UPDATED', `${saved.date}: ${saved.totalWorkers} workers`);
    return saved;
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.loadForWrite(user, id);
    await this.prisma.attendanceSheet.delete({ where: { id } });
    await this.audit.log(user, 'ATTENDANCE', id, 'DELETED', dateOnly(row.date));
    return { ok: true };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, ProgressEntryDto, ProgressSortField, SortOrder } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { SECTOR_SELECT, locationOr, resolveSector } from '../common/sector';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, dec, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords, dateRange } from '../common/paging';
import { CreateProgressDto, ListProgressQuery, UpdateProgressDto } from './progress.dto';

const include = {
  project: { select: { name: true } },
  activity: { select: { name: true, unit: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.ProgressEntryInclude;
type Row = Prisma.ProgressEntryGetPayload<{ include: typeof include }>;

const ORDER: Record<ProgressSortField, (o: SortOrder) => Prisma.ProgressEntryOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { createdAt: o }],
  createdAt: (o) => [{ createdAt: o }],
  submittedAt: (o) => [{ submittedAt: { sort: o, nulls: 'last' } }],
  quantity: (o) => [{ quantity: o }],
  status: (o) => [{ status: o }, { date: 'desc' }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  activity: (o) => [{ activity: { name: o } }, { date: 'desc' }],
  submittedBy: (o) => [{ submittedBy: { fullName: o } }, { date: 'desc' }],
};
const DESC_DEFAULT = new Set<string>(['date', 'createdAt', 'submittedAt', 'quantity']);

/** Progress goes against an activity of the project that has no sub-activities (an RCC slab is its steel, shuttering and concrete). */
export async function assertTakesProgress(prisma: PrismaService, activityId: string, projectId: string) {
  const activity = await prisma.activity.findFirst({ where: { id: activityId, projectId }, select: { name: true, _count: { select: { subActivities: true } } } });
  if (!activity) throw new NotFoundException('Activity not found in this project');
  if (activity._count.subActivities) throw new BadRequestException(`${activity.name} is made of sub-activities; record progress against one of them`);
}

/** The refusal for changing a DPR's work line on its own (item 127). */
export const DPR_LINE_NOTE = (date: Date) => `This entry is a work line of the DPR of ${dateOnly(date)}; change, submit or decide it in the DPR`;

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {
    lifecycle.partOf('PROGRESS', async (id) => {
      const row = await this.prisma.progressEntry.findUnique({ where: { id }, select: { dailyReport: { select: { date: true } } } });
      return row?.dailyReport ? DPR_LINE_NOTE(row.dailyReport.date) : null;
    });
  }

  /** A DPR's work line is changed only through its DPR. */
  private async assertNotDprLine(id: string) {
    const row = await this.prisma.progressEntry.findUnique({ where: { id }, select: { dailyReport: { select: { date: true } } } });
    if (row?.dailyReport) throw new BadRequestException(DPR_LINE_NOTE(row.dailyReport.date));
  }

  toDto(r: Row): ProgressEntryDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      activityId: r.activityId,
      activityName: r.activity.name,
      unit: r.activity.unit,
      date: dateOnly(r.date)!,
      quantity: dec(r.quantity)!,
      remarks: r.remarks,
      location: r.location,
      chainageFrom: r.chainageFrom,
      chainageTo: r.chainageTo,
      floor: r.floor,
      village: r.village,
      dailyReportId: r.dailyReportId,
      manpowerCount: r.manpowerCount,
      machineryUsed: r.machineryUsed,
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

  async list(user: RequestUser, q: ListProgressQuery): Promise<Paginated<ProgressEntryDto>> {
    const where: Prisma.ProgressEntryWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.activityId) where.activityId = q.activityId;
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    const days = dateRange(q.from, q.to);
    if (days) where.date = days;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ activity: { name: ilike(w) } }, { location: ilike(w) }, { remarks: ilike(w) }, { project: { name: ilike(w) } }, { submittedBy: { fullName: ilike(w) } }],
      }));
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.progressEntry.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.progressEntry.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<ProgressEntryDto> {
    const row = await this.prisma.progressEntry.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Progress entry not found');
    return this.toDto(row);
  }

  /** Idempotent create: an entry that already exists under the client-supplied id is returned as is. */
  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.progressEntry.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateProgressDto): Promise<ProgressEntryDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanAccessProject(user, dto.projectId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { progressFromDpr: true } });
    if (org.progressFromDpr) throw new BadRequestException("Your company records progress in the DPR: add a work line to the day's DPR instead");
    await assertTakesProgress(this.prisma, dto.activityId, dto.projectId);
    const sector = await resolveSector(this.prisma, dto.projectId, dto);
    let row: { id: string };
    try {
      row = await this.prisma.progressEntry.create({
        data: {
          id: dto.id,
          organizationId: user.organizationId,
          projectId: dto.projectId,
          activityId: dto.activityId,
          date: parseDate(dto.date),
          quantity: new Prisma.Decimal(dto.quantity),
          remarks: dto.remarks ?? null,
          location: locationOr(dto.location, sector) ?? null,
          ...sector,
          manpowerCount: dto.manpowerCount ?? null,
          machineryUsed: dto.machineryUsed ?? null,
          submittedById: user.id,
          status: 'DRAFT',
        },
        select: { id: true },
      });
    } catch (e) {
      // Two retries of the same offline entry raced; the first one won.
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.attachments.link(user, 'progressEntryId', row.id, dto.attachmentIds);
    await this.audit.log(user, 'PROGRESS', row.id, 'CREATED');
    if (dto.submit !== false) await this.lifecycle.submit(user, 'PROGRESS', row.id);
    return this.get(user, row.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateProgressDto): Promise<ProgressEntryDto> {
    const row = await this.lifecycle.load(user, 'PROGRESS', id);
    await this.assertNotDprLine(id);
    await this.lifecycle.assertEditable(user, row);
    const data: Prisma.ProgressEntryUncheckedUpdateInput = {};
    if (dto.activityId !== undefined) {
      await assertTakesProgress(this.prisma, dto.activityId, row.projectId);
      data.activityId = dto.activityId;
    }
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.quantity !== undefined) data.quantity = new Prisma.Decimal(dto.quantity);
    if (dto.remarks !== undefined) data.remarks = dto.remarks;
    const sector = await resolveSector(this.prisma, row.projectId, dto, (await this.prisma.progressEntry.findUnique({ where: { id }, select: SECTOR_SELECT }))!);
    Object.assign(data, sector);
    if (dto.location !== undefined) data.location = locationOr(dto.location, sector) ?? null;
    if (dto.manpowerCount !== undefined) data.manpowerCount = dto.manpowerCount;
    if (dto.machineryUsed !== undefined) data.machineryUsed = dto.machineryUsed;
    await this.prisma.progressEntry.update({ where: { id }, data });
    await this.attachments.sync(user, 'progressEntryId', id, dto.attachmentIds);
    await this.audit.log(user, 'PROGRESS', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'PROGRESS', id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string) {
    await this.lifecycle.submit(user, 'PROGRESS', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'PROGRESS', id);
    await this.assertNotDprLine(id);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.progressEntry.delete({ where: { id } });
    await this.audit.log(user, 'PROGRESS', id, 'DELETED');
    return { ok: true };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProgressEntryDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService } from '../common/attachments.service';
import { dateOnly, dec, iso, parseDate } from '../common/serialize';
import { CreateProgressDto, ListProgressQuery, UpdateProgressDto } from './progress.dto';

const include = {
  project: { select: { name: true } },
  activity: { select: { name: true, unit: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: true,
} satisfies Prisma.ProgressEntryInclude;
type Row = Prisma.ProgressEntryGetPayload<{ include: typeof include }>;

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {}

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

  async list(user: RequestUser, q: ListProgressQuery): Promise<ProgressEntryDto[]> {
    const where: Prisma.ProgressEntryWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.activityId) where.activityId = q.activityId;
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    const rows = await this.prisma.progressEntry.findMany({ where, include, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: q.limit ?? 200 });
    return rows.map((r) => this.toDto(r));
  }

  async get(user: RequestUser, id: string): Promise<ProgressEntryDto> {
    const row = await this.prisma.progressEntry.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Progress entry not found');
    return this.toDto(row);
  }

  async create(user: RequestUser, dto: CreateProgressDto): Promise<ProgressEntryDto> {
    await this.access.assertCanAccessProject(user, dto.projectId);
    const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, projectId: dto.projectId } });
    if (!activity) throw new NotFoundException('Activity not found in this project');
    const row = await this.prisma.progressEntry.create({
      data: {
        organizationId: user.organizationId,
        projectId: dto.projectId,
        activityId: dto.activityId,
        date: parseDate(dto.date),
        quantity: new Prisma.Decimal(dto.quantity),
        remarks: dto.remarks ?? null,
        location: dto.location ?? null,
        manpowerCount: dto.manpowerCount ?? null,
        machineryUsed: dto.machineryUsed ?? null,
        submittedById: user.id,
        status: 'DRAFT',
      },
    });
    await this.attachments.link(user, 'progressEntryId', row.id, dto.attachmentIds);
    await this.audit.log(user, 'PROGRESS', row.id, 'CREATED');
    if (dto.submit !== false) await this.lifecycle.submit(user, 'PROGRESS', row.id);
    return this.get(user, row.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateProgressDto): Promise<ProgressEntryDto> {
    const row = await this.lifecycle.load(user, 'PROGRESS', id);
    await this.lifecycle.assertEditable(user, row);
    const data: Prisma.ProgressEntryUncheckedUpdateInput = {};
    if (dto.activityId !== undefined) {
      const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, projectId: row.projectId } });
      if (!activity) throw new NotFoundException('Activity not found in this project');
      data.activityId = dto.activityId;
    }
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.quantity !== undefined) data.quantity = new Prisma.Decimal(dto.quantity);
    if (dto.remarks !== undefined) data.remarks = dto.remarks;
    if (dto.location !== undefined) data.location = dto.location;
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
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.progressEntry.delete({ where: { id } });
    await this.audit.log(user, 'PROGRESS', id, 'DELETED');
    return { ok: true };
  }
}

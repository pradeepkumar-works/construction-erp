import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { STANDARD_CHECKLISTS, sameLocation, type ChecklistTemplateDto, type InspectionCheck, type InspectionDto, type InspectionSortField, type Paginated, type PortalInspectionDto, type SortOrder } from '@erp/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { ChecklistTemplateInputDto, CreateInspectionDto, InspectDto, ListInspectionsQuery, UpdateChecklistTemplateDto, UpdateInspectionDto } from './inspections.dto';

const include = {
  project: { select: { name: true } },
  activity: { select: { name: true, holdPoint: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.InspectionInclude;
type Row = Prisma.InspectionGetPayload<{ include: typeof include }>;

const ORDER: Record<InspectionSortField, (o: SortOrder) => Prisma.InspectionOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { inspectionNo: o }],
  inspectionNo: (o) => [{ inspectionNo: o }],
  createdAt: (o) => [{ createdAt: o }],
  submittedAt: (o) => [{ submittedAt: { sort: o, nulls: 'last' } }],
  status: (o) => [{ status: o }, { date: 'desc' }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  activity: (o) => [{ activity: { name: o } }, { date: 'desc' }],
  submittedBy: (o) => [{ submittedBy: { fullName: o } }, { date: 'desc' }],
};
const DESC_DEFAULT = new Set<string>(['date', 'inspectionNo', 'createdAt', 'submittedAt']);

const fresh = (items: string[]): InspectionCheck[] => items.map((item) => ({ item, result: null, remark: null }));
const checksOf = (v: Prisma.JsonValue): InspectionCheck[] => (Array.isArray(v) ? (v as unknown as InspectionCheck[]) : []);

/**
 * Inspections: site requests one for an activity at a location, QA/QC passes or fails it against a checklist.
 * A submission (requested = submitted, passed = approved, failed = rejected, re-inspect = changes requested), so the
 * approvals queue, notifications and audit trail work as for every other entry. An activity marked as a hold point
 * gets its progress approved only after a passed inspection at that location.
 */
@Injectable()
export class InspectionsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
  ) {
    lifecycle.beforeApprove('PROGRESS', (_user, id) => this.assertHoldPointCleared(id));
  }

  toDto(r: Row): InspectionDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      inspectionNo: r.inspectionNo,
      activityId: r.activityId,
      activityName: r.activity.name,
      holdPoint: r.activity.holdPoint,
      date: dateOnly(r.date)!,
      location: r.location,
      remarks: r.remarks,
      checklistName: r.checklistName,
      checklist: checksOf(r.checklist),
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

  async list(user: RequestUser, q: ListInspectionsQuery): Promise<Paginated<InspectionDto>> {
    const where: Prisma.InspectionWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.activityId) where.activityId = q.activityId;
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    if (q.from || q.to) where.date = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { inspectionNo: ilike(w) },
          { location: ilike(w) },
          { remarks: ilike(w) },
          { checklistName: ilike(w) },
          { activity: { name: ilike(w) } },
          { project: { name: ilike(w) } },
          { submittedBy: { fullName: ilike(w) } },
        ],
      }));
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.inspection.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.inspection.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  /* ---------- the client portal ---------- */

  private portalDto(r: Row & { witnessedBy: { fullName: string } | null }): PortalInspectionDto {
    const d = this.toDto(r);
    return {
      id: d.id,
      projectId: d.projectId,
      inspectionNo: d.inspectionNo,
      activityName: d.activityName,
      holdPoint: d.holdPoint,
      date: d.date,
      location: d.location,
      remarks: d.remarks,
      checklistName: d.checklistName,
      checklist: d.checklist,
      status: d.status,
      submittedByName: d.submittedByName,
      reviewedByName: d.reviewedByName,
      reviewedAt: d.reviewedAt,
      reviewNote: d.reviewNote,
      attachments: d.attachments,
      witnessedByName: r.witnessedBy?.fullName ?? null,
      witnessedAt: iso(r.witnessedAt),
      witnessNote: r.witnessNote,
    };
  }

  /** Inspections requested on a project (drafts left out), newest first: the client portal's list. */
  async listForClient(user: RequestUser, projectId: string): Promise<PortalInspectionDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.inspection.findMany({
      where: { projectId, organizationId: user.organizationId, status: { not: 'DRAFT' } },
      include: { ...include, witnessedBy: { select: { fullName: true } } },
      orderBy: [{ date: 'desc' }, { inspectionNo: 'desc' }],
      take: 200,
    });
    return rows.map((r) => this.portalDto(r));
  }

  /**
   * The client's engineer or consultant records attending an inspection, with remarks; whoever requested it and QA/QC
   * are told. Recording again replaces the remarks.
   */
  async witness(user: RequestUser, id: string, note: string | null): Promise<PortalInspectionDto> {
    const row = await this.prisma.inspection.findFirst({ where: { id, organizationId: user.organizationId, status: { not: 'DRAFT' } }, select: { projectId: true, submittedById: true, inspectionNo: true } });
    if (!row) throw new NotFoundException('Inspection not found');
    await this.access.assertCanActAsClient(user, row.projectId);
    const updated = await this.prisma.inspection.update({
      where: { id },
      data: { witnessedById: user.id, witnessedAt: new Date(), witnessNote: note?.trim() || null },
      include: { ...include, witnessedBy: { select: { fullName: true } } },
    });
    await this.audit.log(user, 'INSPECTION', id, 'WITNESSED', note?.trim() ? `Attended for the client: ${note.trim()}` : 'Attended for the client');
    const watchers = await this.access.qualityWatchers(user.organizationId, row.projectId, { onProjectOnly: true });
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: [...new Set([row.submittedById, ...watchers.map((w) => w.id)])],
      type: 'PORTAL',
      title: `${row.inspectionNo}: ${user.fullName} attended for the client`,
      body: `${updated.activity.name} at ${updated.location}, ${updated.project.name}.${note?.trim() ? ` Remarks: ${note.trim()}` : ''}`,
      projectId: row.projectId,
      entityType: 'INSPECTION',
      entityId: id,
    });
    return this.portalDto(updated);
  }

  async get(user: RequestUser, id: string): Promise<InspectionDto> {
    const row = await this.prisma.inspection.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Inspection not found');
    return this.toDto(row);
  }

  private checkDate(date: string) {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The date cannot be in the future');
  }

  private async activity(projectId: string, activityId: string) {
    const a = await this.prisma.activity.findFirst({ where: { id: activityId, projectId }, select: { id: true, checklistTemplateId: true } });
    if (!a) throw new NotFoundException('Activity not found in this project');
    return a;
  }

  /** The points to check: given ones, else the chosen checklist's, else the activity's checklist's. */
  private async checklist(user: RequestUser, dto: { items?: string[]; checklistTemplateId?: string | null }, activityChecklistId: string | null) {
    if (dto.items?.length) return { checklistName: null, checklist: fresh(dto.items) };
    const templateId = dto.checklistTemplateId === undefined ? activityChecklistId : dto.checklistTemplateId;
    if (!templateId) return { checklistName: null, checklist: [] as InspectionCheck[] };
    const t = await this.prisma.checklistTemplate.findFirst({ where: { id: templateId, organizationId: user.organizationId } });
    if (!t) throw new NotFoundException('Checklist not found');
    return { checklistName: t.name, checklist: fresh(t.items) };
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.inspection.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateInspectionDto): Promise<InspectionDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanRequestInspection(user, dto.projectId);
    const activity = await this.activity(dto.projectId, dto.activityId);
    this.checkDate(dto.date);
    const { checklistName, checklist } = await this.checklist(user, dto, activity.checklistTemplateId);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const inspectionNo = await nextDocNo(tx, user.organizationId, 'INS', async (prefix) =>
          (await tx.inspection.findFirst({ where: { organizationId: user.organizationId, inspectionNo: { startsWith: prefix } }, orderBy: { inspectionNo: 'desc' }, select: { inspectionNo: true } }))?.inspectionNo ?? null,
        );
        if (dto.id && (await tx.inspection.count({ where: { id: dto.id } }))) return null;
        const row = await tx.inspection.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            activityId: dto.activityId,
            inspectionNo,
            date: parseDate(dto.date),
            location: dto.location,
            remarks: dto.remarks || null,
            checklistName,
            checklist: checklist as unknown as Prisma.InputJsonValue,
            submittedById: user.id,
            status: 'DRAFT',
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    if (!id) return this.get(user, dto.id!);
    await this.attachments.link(user, 'inspectionId', id, dto.attachmentIds);
    await this.audit.log(user, 'INSPECTION', id, 'CREATED');
    if (dto.submit !== false) await this.lifecycle.submit(user, 'INSPECTION', id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateInspectionDto): Promise<InspectionDto> {
    const row = await this.lifecycle.load(user, 'INSPECTION', id);
    await this.lifecycle.assertEditable(user, row);
    const cur = await this.prisma.inspection.findUniqueOrThrow({ where: { id }, select: { activityId: true } });
    const activity = await this.activity(row.projectId, dto.activityId ?? cur.activityId);
    if (dto.date !== undefined) this.checkDate(dto.date);
    const data: Prisma.InspectionUncheckedUpdateInput = {};
    if (dto.activityId !== undefined) data.activityId = dto.activityId;
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    if (dto.items !== undefined || dto.checklistTemplateId !== undefined || (dto.activityId !== undefined && dto.activityId !== cur.activityId)) {
      const c = await this.checklist(user, dto, activity.checklistTemplateId);
      data.checklistName = c.checklistName;
      data.checklist = c.checklist as unknown as Prisma.InputJsonValue;
    }
    await this.prisma.inspection.update({ where: { id }, data });
    await this.attachments.sync(user, 'inspectionId', id, dto.attachmentIds);
    await this.audit.log(user, 'INSPECTION', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'INSPECTION', id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string) {
    await this.lifecycle.submit(user, 'INSPECTION', id);
    return this.get(user, id);
  }

  /** QA/QC records the result of each checklist point and passes, fails or sends the work back for re-inspection. */
  async inspect(user: RequestUser, id: string, dto: InspectDto): Promise<InspectionDto> {
    const row = await this.lifecycle.load(user, 'INSPECTION', id);
    await this.access.assertCanApproveSubmission(user, 'INSPECTION', id, row.projectId);
    if (row.status !== 'SUBMITTED') throw new BadRequestException('Only a requested inspection can be inspected');
    const { checklist } = await this.prisma.inspection.findUniqueOrThrow({ where: { id }, select: { checklist: true } });
    const checks = checksOf(checklist);
    if (dto.results.length !== checks.length) throw new BadRequestException(`Record a result for each of the ${checks.length} checklist points`);
    const done: InspectionCheck[] = checks.map((c, i) => ({ item: c.item, result: dto.results[i].result, remark: dto.results[i].remark?.trim() || null }));
    const failed = done.filter((c) => c.result === 'FAIL');
    const note = dto.note?.trim() || null;
    if (dto.decision === 'APPROVE' && failed.length) throw new BadRequestException(`${failed.length} point${failed.length === 1 ? ' is' : 's are'} not OK: the inspection cannot pass`);
    if (dto.decision !== 'APPROVE' && !failed.length && !note) throw new BadRequestException('Mark the points that are not OK, or add a note saying what is wrong');
    await this.prisma.inspection.update({ where: { id }, data: { checklist: done as unknown as Prisma.InputJsonValue } });
    await this.attachments.link(user, 'inspectionId', id, dto.attachmentIds);
    const summary = failed.length ? `Not OK: ${failed.map((c) => c.item + (c.remark ? ` (${c.remark})` : '')).join('; ')}` : null;
    await this.lifecycle.review(user, 'INSPECTION', id, dto.decision, [note, dto.decision === 'APPROVE' ? null : summary].filter(Boolean).join('. ') || null);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'INSPECTION', id);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.inspection.delete({ where: { id } });
    await this.audit.log(user, 'INSPECTION', id, 'DELETED');
    return { ok: true };
  }

  /** Hold point: progress of the activity is approved only after a passed inspection there. */
  async assertHoldPointCleared(progressId: string) {
    const p = await this.prisma.progressEntry.findUnique({ where: { id: progressId }, select: { location: true, activityId: true, activity: { select: { name: true, holdPoint: true } } } });
    if (!p?.activity.holdPoint) return;
    const passed = await this.prisma.inspection.findMany({ where: { activityId: p.activityId, status: 'APPROVED' }, select: { location: true } });
    const at = p.location?.trim();
    if (at ? passed.some((i) => sameLocation(i.location, at)) : passed.length > 0) return;
    throw new BadRequestException(
      `${p.activity.name} is a hold point: its progress is approved after a passed inspection${at ? ` at ${at}` : ''}. Request an inspection there first.`,
    );
  }

  /* ---------- checklists ---------- */

  async checklists(user: RequestUser): Promise<ChecklistTemplateDto[]> {
    const rows = await this.prisma.checklistTemplate.findMany({ where: { organizationId: user.organizationId }, include: { _count: { select: { activities: true } } }, orderBy: { name: 'asc' } });
    return rows.map((t) => ({ id: t.id, name: t.name, items: t.items, activityCount: t._count.activities, updatedAt: t.updatedAt.toISOString() }));
  }

  private async saveChecklist(user: RequestUser, id: string | null, dto: UpdateChecklistTemplateDto) {
    if (dto.items !== undefined && !dto.items.length) throw new BadRequestException('Add at least one point to check');
    try {
      const row = id
        ? await this.prisma.checklistTemplate.update({ where: { id }, data: { name: dto.name, items: dto.items } })
        : await this.prisma.checklistTemplate.create({ data: { organizationId: user.organizationId, name: dto.name!, items: dto.items! } });
      await this.audit.log(user, 'CHECKLIST', row.id, id ? 'UPDATED' : 'CREATED', row.name);
      return (await this.checklists(user)).find((t) => t.id === row.id)!;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`A checklist named "${dto.name}" already exists`);
      throw e;
    }
  }

  createChecklist(user: RequestUser, dto: ChecklistTemplateInputDto) {
    return this.saveChecklist(user, null, dto);
  }

  async updateChecklist(user: RequestUser, id: string, dto: UpdateChecklistTemplateDto) {
    if (!(await this.prisma.checklistTemplate.count({ where: { id, organizationId: user.organizationId } }))) throw new NotFoundException('Checklist not found');
    return this.saveChecklist(user, id, dto);
  }

  /** Inspections already requested keep their copy of the points. */
  async deleteChecklist(user: RequestUser, id: string) {
    const { count } = await this.prisma.checklistTemplate.deleteMany({ where: { id, organizationId: user.organizationId } });
    if (!count) throw new NotFoundException('Checklist not found');
    await this.audit.log(user, 'CHECKLIST', id, 'DELETED');
    return { ok: true };
  }

  /** Add the standard checklists the organisation does not have yet (by name). */
  async addStandardChecklists(user: RequestUser) {
    const { count } = await this.prisma.checklistTemplate.createMany({
      data: STANDARD_CHECKLISTS.map((c) => ({ organizationId: user.organizationId, name: c.name, items: c.items })),
      skipDuplicates: true,
    });
    if (count) await this.audit.log(user, 'CHECKLIST', user.organizationId, 'CREATED', `${count} standard checklists`);
    return this.checklists(user);
  }
}

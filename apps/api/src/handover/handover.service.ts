import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_CLOSEOUT_ITEMS,
  DEFAULT_DLP_MONTHS,
  DEFECT_PHASE_LABELS,
  canCloseDefect,
  canViewContract,
  dlpEnd,
  type CloseoutCategory,
  type CloseoutItemDto,
  type DefectDto,
  type HandoverDto,
  type HandoverSummaryDto,
  type Paginated,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { todayIn } from '../notifications/time';
import { CreateCloseoutItemDto, CreateDefectDto, DefectNoteDto, FixDefectDto, ListDefectsQuery, SaveHandoverDto, UpdateCloseoutItemDto, UpdateDefectDto } from './handover.dto';

const defectInclude = {
  project: { select: { name: true } },
  reportedBy: { select: { fullName: true } },
  assignedTo: { select: { fullName: true } },
  fixedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.DefectInclude;
type DefectRow = Prisma.DefectGetPayload<{ include: typeof defectInclude }>;

const handoverInclude = {
  recordedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ProjectHandoverInclude;
type HandoverRow = Prisma.ProjectHandoverGetPayload<{ include: typeof handoverInclude }>;

const itemInclude = { doneBy: { select: { fullName: true } } } satisfies Prisma.CloseoutItemInclude;
type ItemRow = Prisma.CloseoutItemGetPayload<{ include: typeof itemInclude }>;

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 86_400_000;
const blank = (v: string | null | undefined) => (v ? v : null);
const daysBetween = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS);

/**
 * Handover and defects (v4 item 47). Snags are logged before handover and defects during the defect liability period
 * (DLP); both are put right (fixed) by our team or a subcontractor and then accepted (closed) by QA/QC or an approver.
 * The project's approvers record the completion certificate, which starts the DLP, and keep the close-out checklist.
 * NotificationJobsService.handoverDue reminds them when the DLP is about to end, to claim back retention.
 */
@Injectable()
export class HandoverService {
  private readonly log = new Logger(HandoverService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
    private undo: UndoService,
  ) {
    undo.register('CLOSEOUT_ITEM', { entityType: 'CLOSEOUT_ITEM', check: (user, row) => this.access.assertCanManageHandover(user, row.projectId as string) });
  }

  /* ---------- the handover page ---------- */

  private handoverDto(r: HandoverRow, today: string): HandoverDto {
    const dlpEndsOn = dateOnly(r.dlpEndsOn)!;
    return {
      id: r.id,
      completedOn: dateOnly(r.completedOn)!,
      certificateNo: r.certificateNo,
      certificateDate: dateOnly(r.certificateDate),
      certifiedBy: r.certifiedBy,
      dlpMonths: r.dlpMonths,
      dlpEndsOn,
      dlpDaysLeft: daysBetween(today, dlpEndsOn),
      note: r.note,
      recordedByName: r.recordedBy.fullName,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
    };
  }

  private itemDto(r: ItemRow): CloseoutItemDto {
    return { id: r.id, category: r.category as CloseoutCategory, title: r.title, sortOrder: r.sortOrder, doneOn: dateOnly(r.doneOn), doneByName: r.doneBy?.fullName ?? null, note: r.note };
  }

  /** Retention (or deposit) the client still holds on a project: deducted from bills less what was released. */
  private async held(projectId: string, field: 'retentionAmount' | 'securityDepositAmount', release: 'RETENTION_RELEASE' | 'DEPOSIT_RELEASE') {
    const [deducted, released] = await Promise.all([
      this.prisma.receipt.aggregate({ where: { projectId, kind: 'BILL' }, _sum: { [field]: true } }),
      this.prisma.receipt.aggregate({ where: { projectId, kind: release }, _sum: { amount: true } }),
    ]);
    const d = (deducted._sum as Record<string, Prisma.Decimal | null>)[field] ?? ZERO;
    return Prisma.Decimal.max(d.sub(released._sum.amount ?? ZERO), ZERO);
  }

  async summary(user: RequestUser, projectId: string): Promise<HandoverSummaryDto> {
    await this.access.assertCanViewHandover(user, projectId);
    const today = todayIn();
    const [project, handover, counts, overdue, cost, checklist] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, status: true, defectLiabilityMonths: true } }),
      this.prisma.projectHandover.findUnique({ where: { projectId }, include: handoverInclude }),
      this.prisma.defect.groupBy({ by: ['phase', 'status'], where: { projectId }, _count: { _all: true } }),
      this.prisma.defect.count({ where: { projectId, phase: 'DEFECT', status: 'OPEN', dueDate: { lt: parseDate(today) } } }),
      this.prisma.defect.aggregate({ where: { projectId, phase: 'DEFECT' }, _sum: { cost: true } }),
      this.prisma.closeoutItem.findMany({ where: { projectId }, include: itemInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    const n = (phase: string, status: string) => counts.find((c) => c.phase === phase && c.status === status)?._count._all ?? 0;
    const contract = canViewContract(user.roleKey);
    const [retention, deposit] = contract ? await Promise.all([this.held(projectId, 'retentionAmount', 'RETENTION_RELEASE'), this.held(projectId, 'securityDepositAmount', 'DEPOSIT_RELEASE')]) : [null, null];
    return {
      projectId,
      projectName: project.name,
      projectStatus: project.status,
      defectLiabilityMonths: project.defectLiabilityMonths,
      handover: handover ? this.handoverDto(handover, today) : null,
      snags: { open: n('SNAG', 'OPEN'), fixed: n('SNAG', 'FIXED'), closed: n('SNAG', 'CLOSED') },
      defects: { open: n('DEFECT', 'OPEN'), fixed: n('DEFECT', 'FIXED'), closed: n('DEFECT', 'CLOSED'), overdue, cost: (cost._sum.cost ?? ZERO).toFixed(2) },
      retentionHeld: retention ? retention.toFixed(2) : null,
      depositHeld: deposit ? deposit.toFixed(2) : null,
      checklist: checklist.map((r) => this.itemDto(r)),
    };
  }

  /** Record (or correct) the completion: starts the DLP, marks the project completed and seeds the close-out checklist. */
  async saveHandover(user: RequestUser, projectId: string, dto: SaveHandoverDto): Promise<HandoverSummaryDto> {
    await this.access.assertCanManageHandover(user, projectId);
    const today = todayIn();
    if (dto.completedOn > today) throw new BadRequestException('The completion date cannot be in the future');
    if (dto.certificateDate && dto.certificateDate < dto.completedOn) throw new BadRequestException('The certificate cannot be dated before the completion');
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true, defectLiabilityMonths: true } });
    const existing = await this.prisma.projectHandover.findUnique({ where: { projectId }, select: { id: true, dlpMonths: true } });
    const dlpMonths = dto.dlpMonths ?? existing?.dlpMonths ?? project.defectLiabilityMonths ?? DEFAULT_DLP_MONTHS;
    const fields = {
      completedOn: parseDate(dto.completedOn),
      certificateNo: blank(dto.certificateNo),
      certificateDate: dto.certificateDate ? parseDate(dto.certificateDate) : null,
      certifiedBy: blank(dto.certifiedBy),
      dlpMonths,
      dlpEndsOn: parseDate(dlpEnd(dto.completedOn, dlpMonths)),
      note: blank(dto.note),
    };
    const id = await this.prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.projectHandover.update({ where: { id: existing.id }, data: fields, select: { id: true } })
        : await tx.projectHandover.create({ data: { ...fields, organizationId: user.organizationId, projectId, recordedById: user.id }, select: { id: true } });
      if (project.status !== 'CLOSED' && project.status !== 'COMPLETED') await tx.project.update({ where: { id: projectId }, data: { status: 'COMPLETED' } });
      if (!(await tx.closeoutItem.count({ where: { projectId } }))) await this.seedChecklist(tx, user, projectId);
      return row.id;
    });
    if (existing) await this.attachments.sync(user, 'handoverId', id, dto.attachmentIds);
    else await this.attachments.link(user, 'handoverId', id, dto.attachmentIds);
    await this.audit.log(user, 'HANDOVER', id, existing ? 'UPDATED' : 'CREATED', `Completed ${dto.completedOn}, DLP ${dlpMonths} months`);
    return this.summary(user, projectId);
  }

  /** Undo a completion recorded by mistake; the project goes back to active. */
  async removeHandover(user: RequestUser, projectId: string): Promise<HandoverSummaryDto> {
    await this.access.assertCanManageHandover(user, projectId);
    const existing = await this.prisma.projectHandover.findUnique({ where: { projectId }, select: { id: true } });
    if (!existing) throw new NotFoundException('No completion is recorded for this project');
    await this.prisma.$transaction([
      this.prisma.projectHandover.delete({ where: { id: existing.id } }),
      this.prisma.project.updateMany({ where: { id: projectId, status: 'COMPLETED' }, data: { status: 'ACTIVE' } }),
    ]);
    await this.audit.log(user, 'HANDOVER', existing.id, 'DELETED');
    return this.summary(user, projectId);
  }

  private async seedChecklist(tx: Prisma.TransactionClient, user: RequestUser, projectId: string) {
    await tx.closeoutItem.createMany({
      data: DEFAULT_CLOSEOUT_ITEMS.map((i, n) => ({ organizationId: user.organizationId, projectId, category: i.category, title: i.title, sortOrder: (n + 1) * 10 })),
    });
  }

  /* ---------- close-out checklist ---------- */

  /** Start the checklist from the standard lines (only while it is empty). */
  async addDefaultChecklist(user: RequestUser, projectId: string): Promise<CloseoutItemDto[]> {
    await this.access.assertCanManageHandover(user, projectId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CLOSEOUT:${projectId}`}))`;
      if (await tx.closeoutItem.count({ where: { projectId } })) throw new ConflictException('This project already has a checklist');
      await this.seedChecklist(tx, user, projectId);
    });
    return this.checklist(projectId);
  }

  private async checklist(projectId: string) {
    const rows = await this.prisma.closeoutItem.findMany({ where: { projectId }, include: itemInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((r) => this.itemDto(r));
  }

  async addChecklistItem(user: RequestUser, projectId: string, dto: CreateCloseoutItemDto): Promise<CloseoutItemDto> {
    await this.access.assertCanManageHandover(user, projectId);
    const last = await this.prisma.closeoutItem.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const row = await this.prisma.closeoutItem.create({
      data: { organizationId: user.organizationId, projectId, category: dto.category, title: dto.title, sortOrder: (last._max.sortOrder ?? 0) + 10 },
      include: itemInclude,
    });
    return this.itemDto(row);
  }

  private async loadItem(user: RequestUser, id: string) {
    const row = await this.prisma.closeoutItem.findFirst({ where: { id, ...this.access.handoverWhere(user) } });
    if (!row) throw new NotFoundException('Checklist line not found');
    await this.access.assertCanManageHandover(user, row.projectId);
    return row;
  }

  async updateChecklistItem(user: RequestUser, id: string, dto: UpdateCloseoutItemDto): Promise<CloseoutItemDto> {
    const current = await this.loadItem(user, id);
    const data: Prisma.CloseoutItemUncheckedUpdateInput = {};
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.note !== undefined) data.note = blank(dto.note);
    if (dto.doneOn && dto.doneOn > todayIn()) throw new BadRequestException('The date cannot be in the future');
    if (dto.done === false) Object.assign(data, { doneOn: null, doneById: null });
    else if (dto.done === true || (dto.doneOn && current.doneOn)) {
      data.doneOn = parseDate(dto.doneOn ?? todayIn());
      if (!current.doneOn) data.doneById = user.id;
    }
    const row = await this.prisma.closeoutItem.update({ where: { id }, data, include: itemInclude });
    return this.itemDto(row);
  }

  async removeChecklistItem(user: RequestUser, id: string) {
    const row = await this.loadItem(user, id);
    await this.prisma.closeoutItem.delete({ where: { id } });
    return { ok: true, undo: this.undo.offer(user, 'CLOSEOUT_ITEM', { rows: [{ model: 'closeoutItem', data: row }] }) };
  }

  /* ---------- snags and defects ---------- */

  private defectDto(r: DefectRow, today: string): DefectDto {
    const dueDate = dateOnly(r.dueDate);
    return {
      id: r.id,
      defectNo: r.defectNo,
      projectId: r.projectId,
      projectName: r.project.name,
      phase: r.phase,
      title: r.title,
      description: r.description,
      location: r.location,
      trade: r.trade,
      priority: r.priority,
      status: r.status,
      reportedOn: dateOnly(r.reportedOn)!,
      reportedByName: r.reportedBy.fullName,
      foundBy: r.reportedByName,
      assignedToId: r.assignedToId,
      assignedToName: r.assignedTo?.fullName ?? null,
      contractor: r.contractor,
      dueDate,
      overdue: r.status === 'OPEN' && !!dueDate && dueDate < today,
      fixedOn: dateOnly(r.fixedOn),
      fixNote: r.fixNote,
      fixedByName: r.fixedBy?.fullName ?? null,
      cost: money(r.cost),
      closedAt: iso(r.closedAt),
      closedByName: r.closedBy?.fullName ?? null,
      closeNote: r.closeNote,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
    };
  }

  async listDefects(user: RequestUser, q: ListDefectsQuery): Promise<Paginated<DefectDto>> {
    const today = todayIn();
    const where: Prisma.DefectWhereInput = { ...this.access.handoverWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.phase) where.phase = q.phase;
    if (q.status === 'PENDING') where.status = { in: ['OPEN', 'FIXED'] };
    else if (q.status) where.status = q.status;
    if (q.overdue) Object.assign(where, { status: 'OPEN', dueDate: { lt: parseDate(today) } });
    if (q.mine) where.assignedToId = user.id;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({ OR: [{ defectNo: ilike(w) }, { title: ilike(w) }, { location: ilike(w) }, { trade: ilike(w) }, { contractor: ilike(w) }, { project: { name: ilike(w) } }] }));
    const args = pageArgs(q);
    const order = q.sortOrder ?? 'desc';
    const [rows, total] = await Promise.all([
      // Open first, then fixed (waiting to be accepted), then closed; the newest first within each.
      this.prisma.defect.findMany({ where, include: defectInclude, orderBy: [{ status: 'asc' }, { reportedOn: order }, { defectNo: order }], skip: args.skip, take: args.take }),
      this.prisma.defect.count({ where }),
    ]);
    return paginated(rows.map((r) => this.defectDto(r, today)), total, args);
  }

  async getDefect(user: RequestUser, id: string): Promise<DefectDto> {
    const row = await this.prisma.defect.findFirst({ where: { id, ...this.access.handoverWhere(user) }, include: defectInclude });
    if (!row) throw new NotFoundException('Snag or defect not found');
    return this.defectDto(row, todayIn());
  }

  private async assertAssignee(user: RequestUser, assignedToId: string | null | undefined) {
    if (!assignedToId) return;
    const ok = await this.prisma.user.count({ where: { id: assignedToId, organizationId: user.organizationId, isActive: true } });
    if (!ok) throw new BadRequestException('Assign it to someone in your company');
  }

  async createDefect(user: RequestUser, dto: CreateDefectDto): Promise<DefectDto> {
    if (dto.id) {
      const existing = await this.prisma.defect.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.getDefect(user, existing.id);
    }
    await this.access.assertCanReportDefect(user, dto.projectId);
    await this.assertAssignee(user, dto.assignedToId);
    const today = todayIn();
    const reportedOn = dto.reportedOn ?? today;
    if (reportedOn > today) throw new BadRequestException('The date cannot be in the future');
    const handover = await this.prisma.projectHandover.findUnique({ where: { projectId: dto.projectId }, select: { completedOn: true } });
    const phase = dto.phase ?? (handover && dateOnly(handover.completedOn)! <= reportedOn ? 'DEFECT' : 'SNAG');
    const kind = phase === 'SNAG' ? 'SNG' : 'DEF';
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const defectNo = await nextDocNo(tx, user.organizationId, kind, async (prefix) =>
          (await tx.defect.findFirst({ where: { organizationId: user.organizationId, defectNo: { startsWith: prefix } }, orderBy: { defectNo: 'desc' }, select: { defectNo: true } }))?.defectNo ?? null,
        );
        // A retry of the same offline report that waited on the lock: the first one already created it.
        if (dto.id && (await tx.defect.count({ where: { id: dto.id } }))) return null;
        const row = await tx.defect.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            defectNo,
            phase,
            title: dto.title,
            description: blank(dto.description),
            location: blank(dto.location),
            trade: blank(dto.trade),
            priority: dto.priority ?? 'MEDIUM',
            reportedOn: parseDate(reportedOn),
            reportedByName: blank(dto.reportedByName),
            reportedById: user.id,
            assignedToId: dto.assignedToId ?? null,
            contractor: blank(dto.contractor),
            dueDate: dto.dueDate ? parseDate(dto.dueDate) : null,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.prisma.defect.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
        if (winner) return this.getDefect(user, winner.id);
      }
      throw e;
    }
    if (!id) return this.getDefect(user, dto.id!);
    await this.attachments.link(user, 'defectId', id, dto.attachmentIds);
    await this.audit.log(user, 'DEFECT', id, 'CREATED');
    const created = await this.getDefect(user, id);
    const pm = await this.prisma.project.findUnique({ where: { id: created.projectId }, select: { projectManagerId: true } });
    await this.notify(user, created, [created.assignedToId, pm?.projectManagerId], `${DEFECT_PHASE_LABELS[created.phase]} ${created.defectNo}: ${created.title}`, this.defectLine(created));
    return created;
  }

  private defectLine(d: DefectDto) {
    const where = d.location ? ` at ${d.location}` : '';
    const due = d.dueDate ? `, to be put right by ${d.dueDate}` : '';
    const by = d.contractor ? ` (${d.contractor})` : '';
    return `${d.projectName}${where}${by}${due}. Reported by ${d.foundBy ?? d.reportedByName}.`;
  }

  private async loadDefect(user: RequestUser, id: string) {
    const row = await this.prisma.defect.findFirst({ where: { id, ...this.access.handoverWhere(user) } });
    if (!row) throw new NotFoundException('Snag or defect not found');
    return row;
  }

  /** The reporter or assignee while it is open, or QA/QC and the approvers at any time. */
  async updateDefect(user: RequestUser, id: string, dto: UpdateDefectDto): Promise<DefectDto> {
    const current = await this.loadDefect(user, id);
    const closer = canCloseDefect(user.roleKey);
    if (!closer && current.reportedById !== user.id && current.assignedToId !== user.id) throw new ForbiddenException('Only the person who reported it, the assignee, QA/QC or an approver can change it');
    if (!closer && current.status !== 'OPEN') throw new BadRequestException('It has been marked fixed; QA/QC or an approver can reopen it');
    if (closer) await this.access.assertCanCloseDefect(user, current.projectId);
    else await this.access.assertCanReportDefect(user, current.projectId);
    await this.assertAssignee(user, dto.assignedToId);
    if (dto.reportedOn && dto.reportedOn > todayIn()) throw new BadRequestException('The date cannot be in the future');
    const data: Prisma.DefectUncheckedUpdateInput = {};
    if (dto.phase !== undefined) data.phase = dto.phase;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.reportedOn !== undefined) data.reportedOn = parseDate(dto.reportedOn);
    if (dto.description !== undefined) data.description = blank(dto.description);
    if (dto.location !== undefined) data.location = blank(dto.location);
    if (dto.trade !== undefined) data.trade = blank(dto.trade);
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.reportedByName !== undefined) data.reportedByName = blank(dto.reportedByName);
    if (dto.assignedToId !== undefined) data.assignedToId = dto.assignedToId;
    if (dto.contractor !== undefined) data.contractor = blank(dto.contractor);
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? parseDate(dto.dueDate) : null;
    await this.prisma.defect.update({ where: { id }, data });
    await this.attachments.sync(user, 'defectId', id, dto.attachmentIds);
    await this.audit.log(user, 'DEFECT', id, 'UPDATED');
    const updated = await this.getDefect(user, id);
    if (dto.assignedToId && dto.assignedToId !== current.assignedToId) {
      await this.notify(user, updated, [dto.assignedToId], `Assigned to you: ${updated.defectNo} ${updated.title}`, this.defectLine(updated));
    }
    return updated;
  }

  /** Put right: whoever works on the project marks it fixed, with what was done and the photos after. */
  async fixDefect(user: RequestUser, id: string, dto: FixDefectDto): Promise<DefectDto> {
    const current = await this.loadDefect(user, id);
    await this.access.assertCanReportDefect(user, current.projectId);
    if (current.status !== 'OPEN') throw new ConflictException(current.status === 'FIXED' ? 'It is already marked fixed' : 'It is closed');
    const fixedOn = dto.fixedOn ?? todayIn();
    if (fixedOn > todayIn()) throw new BadRequestException('The date cannot be in the future');
    if (fixedOn < dateOnly(current.reportedOn)!) throw new BadRequestException('It cannot be fixed before it was reported');
    await this.prisma.defect.update({
      where: { id },
      data: { status: 'FIXED', fixedOn: parseDate(fixedOn), fixNote: blank(dto.fixNote), cost: dto.cost ? new Prisma.Decimal(dto.cost) : dto.cost === null ? null : undefined, fixedById: user.id },
    });
    await this.attachments.link(user, 'defectId', id, dto.attachmentIds);
    await this.audit.log(user, 'DEFECT', id, 'FIXED', dto.fixNote ?? null);
    const fixed = await this.getDefect(user, id);
    const checkers = await this.access.qualityWatchers(user.organizationId, fixed.projectId, { onProjectOnly: true });
    await this.notify(user, fixed, [current.reportedById, ...checkers.map((u) => u.id)], `Fixed, to be checked: ${fixed.defectNo} ${fixed.title}`, `${this.defectLine(fixed)} Fixed on ${fixedOn} by ${fixed.fixedByName}.`);
    return fixed;
  }

  /** Accept the repair (QA/QC or an approver). A snag or defect still open can be closed too, e.g. when the client waives it. */
  async closeDefect(user: RequestUser, id: string, dto: DefectNoteDto): Promise<DefectDto> {
    const current = await this.loadDefect(user, id);
    await this.access.assertCanCloseDefect(user, current.projectId);
    if (current.status === 'CLOSED') throw new ConflictException('It is already closed');
    if (current.status === 'OPEN' && !dto.note) throw new BadRequestException('Say why it is closed without being fixed');
    await this.prisma.defect.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: user.id, closeNote: blank(dto.note) } });
    await this.audit.log(user, 'DEFECT', id, 'CLOSED', dto.note ?? null);
    return this.getDefect(user, id);
  }

  /** Not put right after all: back to open, with the reason, for the assignee to look at again. */
  async reopenDefect(user: RequestUser, id: string, dto: DefectNoteDto): Promise<DefectDto> {
    const current = await this.loadDefect(user, id);
    await this.access.assertCanCloseDefect(user, current.projectId);
    if (current.status === 'OPEN') throw new ConflictException('It is open');
    await this.prisma.defect.update({ where: { id }, data: { status: 'OPEN', closedAt: null, closedById: null, closeNote: null, fixedOn: null, fixedById: null } });
    await this.audit.log(user, 'DEFECT', id, 'REOPENED', dto.note ?? null);
    const reopened = await this.getDefect(user, id);
    const why = dto.note ? ` ${dto.note}` : '';
    await this.notify(user, reopened, [current.assignedToId, current.fixedById], `Reopened: ${reopened.defectNo} ${reopened.title}`, `${this.defectLine(reopened)}${why}`);
    return reopened;
  }

  /** For an entry made by mistake: QA/QC or an approver. */
  async removeDefect(user: RequestUser, id: string) {
    const current = await this.loadDefect(user, id);
    await this.access.assertCanCloseDefect(user, current.projectId);
    await this.prisma.defect.delete({ where: { id } });
    await this.audit.log(user, 'DEFECT', id, 'DELETED', current.defectNo);
    return { ok: true };
  }

  async defectHistory(user: RequestUser, id: string) {
    await this.loadDefect(user, id);
    return this.audit.forEntity(user.organizationId, 'DEFECT', id);
  }

  private async notify(user: RequestUser, d: DefectDto, to: (string | null | undefined)[], title: string, body: string) {
    const userIds = [...new Set(to.filter((u): u is string => !!u && u !== user.id))];
    if (!userIds.length) return;
    try {
      await this.notifications.notify({ organizationId: user.organizationId, userIds, type: 'DEFECT', title, body, projectId: d.projectId, entityType: 'DEFECT', entityId: d.id });
    } catch (e) {
      this.log.warn(`Defect notification failed: ${(e as Error).message}`);
    }
  }
}

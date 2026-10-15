import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  INJURY_TYPES,
  LOST_TIME_TYPES,
  PERMIT_MAX_DAYS,
  SAFETY_INCIDENT_TYPES,
  SAFETY_INCIDENT_TYPE_LABELS,
  WORK_PERMIT_TYPE_LABELS,
  canEditSafetyRecord,
  canManageSafety,
  isReportableIncident,
  permitExpired,
  type Paginated,
  type SafetyIncidentDto,
  type SafetySummaryDto,
  type ToolboxTalkDto,
  type WorkPermitDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { todayIn } from '../notifications/time';
import {
  CloseIncidentDto,
  ClosePermitDto,
  CreateIncidentDto,
  CreatePermitDto,
  CreateTalkDto,
  IssuePermitDto,
  ListIncidentsQuery,
  ListPermitsQuery,
  ListTalksQuery,
  RejectPermitDto,
  UpdateIncidentDto,
  UpdatePermitDto,
  UpdateTalkDto,
} from './safety.dto';

const incidentInclude = {
  project: { select: { name: true } },
  reportedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
  attachments: true,
} satisfies Prisma.SafetyIncidentInclude;
type IncidentRow = Prisma.SafetyIncidentGetPayload<{ include: typeof incidentInclude }>;

const talkInclude = { project: { select: { name: true } }, recordedBy: { select: { fullName: true } }, attachments: true } satisfies Prisma.ToolboxTalkInclude;
type TalkRow = Prisma.ToolboxTalkGetPayload<{ include: typeof talkInclude }>;

const permitInclude = {
  project: { select: { name: true } },
  requestedBy: { select: { fullName: true } },
  issuedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
  attachments: true,
} satisfies Prisma.WorkPermitInclude;
type PermitRow = Prisma.WorkPermitGetPayload<{ include: typeof permitInclude }>;

/** Today where the sites are (NOTIFICATION_TIMEZONE), so a date picked just after local midnight is not "in the future". */
const todayStr = () => todayIn();
const blank = (v: string | null | undefined) => (v ? v : null);
const DAY_MS = 86_400_000;

/**
 * Safety at site (v4 item 40): the incident and near-miss register, toolbox talks and permits to work. Anyone working
 * at site records them (phone or web); the safety officer or an approver closes incidents with the root cause and the
 * corrective action, and issues or rejects permits. These are registers, not approval submissions: an incident is
 * recorded the moment it is reported, and a permit has its own requested / issued / closed life.
 */
@Injectable()
export class SafetyService {
  private readonly log = new Logger(SafetyService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
  ) {}

  /* ---------- incidents ---------- */

  private incidentDto(r: IncidentRow): SafetyIncidentDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      incidentNo: r.incidentNo,
      type: r.type,
      date: dateOnly(r.date)!,
      time: r.time,
      location: r.location,
      description: r.description,
      injuredCount: r.injuredCount,
      injuredNames: r.injuredNames,
      contractor: r.contractor,
      immediateAction: r.immediateAction,
      rootCause: r.rootCause,
      correctiveAction: r.correctiveAction,
      daysLost: r.daysLost,
      status: r.status,
      closedAt: iso(r.closedAt),
      closedByName: r.closedBy?.fullName ?? null,
      closureNote: r.closureNote,
      reportedById: r.reportedById,
      reportedByName: r.reportedBy.fullName,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    return { ...(from ? { gte: parseDate(from) } : {}), ...(to ? { lte: parseDate(to) } : {}) };
  }

  async listIncidents(user: RequestUser, q: ListIncidentsQuery): Promise<Paginated<SafetyIncidentDto>> {
    const where: Prisma.SafetyIncidentWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.type) where.type = q.type;
    else if (q.incidentsOnly) where.type = { not: 'NEAR_MISS' };
    if (q.status) where.status = q.status;
    const date = this.dateRange(q.from, q.to);
    if (date) where.date = date;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({ OR: [{ incidentNo: ilike(w) }, { location: ilike(w) }, { description: ilike(w) }, { contractor: ilike(w) }, { project: { name: ilike(w) } }] }));
    const args = pageArgs(q);
    const order = q.sortOrder ?? 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.safetyIncident.findMany({ where, include: incidentInclude, orderBy: [{ date: order }, { incidentNo: order }], skip: args.skip, take: args.take }),
      this.prisma.safetyIncident.count({ where }),
    ]);
    return paginated(rows.map((r) => this.incidentDto(r)), total, args);
  }

  async getIncident(user: RequestUser, id: string): Promise<SafetyIncidentDto> {
    const row = await this.prisma.safetyIncident.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: incidentInclude });
    if (!row) throw new NotFoundException('Incident not found');
    return this.incidentDto(row);
  }

  private assertNotFuture(date: string) {
    if (date > todayStr()) throw new BadRequestException('The date cannot be in the future');
  }

  /** Near misses and property damage hurt no one; the injured count and lost days belong to injuries. */
  private injuryFields(type: string, injuredCount: number | undefined, daysLost: number | null | undefined) {
    const injury = (INJURY_TYPES as string[]).includes(type);
    const count = injury ? (injuredCount ?? 1) : 0;
    if (injury && count < 1) throw new BadRequestException('Say how many people were hurt');
    return { injuredCount: count, daysLost: type === 'LOST_TIME' ? (daysLost ?? null) : null };
  }

  async createIncident(user: RequestUser, dto: CreateIncidentDto): Promise<SafetyIncidentDto> {
    if (dto.id) {
      const existing = await this.prisma.safetyIncident.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.getIncident(user, existing.id);
    }
    await this.access.assertCanReportSafety(user, dto.projectId);
    this.assertNotFuture(dto.date);
    const injury = this.injuryFields(dto.type, dto.injuredCount, dto.daysLost);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const incidentNo = await nextDocNo(tx, user.organizationId, 'INC', async (prefix) =>
          (await tx.safetyIncident.findFirst({ where: { organizationId: user.organizationId, incidentNo: { startsWith: prefix } }, orderBy: { incidentNo: 'desc' }, select: { incidentNo: true } }))?.incidentNo ?? null,
        );
        // A retry of the same offline report that waited on the lock: the first one already created it.
        if (dto.id && (await tx.safetyIncident.count({ where: { id: dto.id } }))) return null;
        const row = await tx.safetyIncident.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            incidentNo,
            type: dto.type,
            date: parseDate(dto.date),
            time: blank(dto.time),
            location: dto.location,
            description: dto.description,
            ...injury,
            injuredNames: blank(dto.injuredNames),
            contractor: blank(dto.contractor),
            immediateAction: blank(dto.immediateAction),
            rootCause: blank(dto.rootCause),
            correctiveAction: blank(dto.correctiveAction),
            reportedById: user.id,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.prisma.safetyIncident.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
        if (winner) return this.getIncident(user, winner.id);
      }
      throw e;
    }
    if (!id) return this.getIncident(user, dto.id!);
    await this.attachments.link(user, 'safetyIncidentId', id, dto.attachmentIds);
    await this.audit.log(user, 'SAFETY_INCIDENT', id, 'CREATED');
    const created = await this.getIncident(user, id);
    await this.notifyIncident(user, created);
    return created;
  }

  private async loadIncident(user: RequestUser, id: string) {
    const row = await this.prisma.safetyIncident.findFirst({ where: { id, ...this.access.submissionWhere(user) } });
    if (!row) throw new NotFoundException('Incident not found');
    return row;
  }

  /** The reporter while it is open, or the safety officer / an approver at any time. */
  async updateIncident(user: RequestUser, id: string, dto: UpdateIncidentDto): Promise<SafetyIncidentDto> {
    const current = await this.loadIncident(user, id);
    if (!canEditSafetyRecord(user, current.reportedById)) throw new ForbiddenException('Only the person who reported it, the safety officer or an approver can change it');
    if (current.status === 'CLOSED' && !canManageSafety(user.roleKey)) throw new BadRequestException('This incident is closed');
    if (dto.date) this.assertNotFuture(dto.date);
    const type = dto.type ?? current.type;
    const data: Prisma.SafetyIncidentUncheckedUpdateInput = {
      ...this.injuryFields(type, dto.injuredCount ?? (current.injuredCount || undefined), dto.daysLost !== undefined ? dto.daysLost : current.daysLost),
    };
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.time !== undefined) data.time = blank(dto.time);
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.injuredNames !== undefined) data.injuredNames = blank(dto.injuredNames);
    if (dto.contractor !== undefined) data.contractor = blank(dto.contractor);
    if (dto.immediateAction !== undefined) data.immediateAction = blank(dto.immediateAction);
    if (dto.rootCause !== undefined) data.rootCause = blank(dto.rootCause);
    if (dto.correctiveAction !== undefined) data.correctiveAction = blank(dto.correctiveAction);
    await this.prisma.safetyIncident.update({ where: { id }, data });
    await this.attachments.sync(user, 'safetyIncidentId', id, dto.attachmentIds);
    await this.audit.log(user, 'SAFETY_INCIDENT', id, 'UPDATED');
    return this.getIncident(user, id);
  }

  /** Close with the root cause and the corrective action (the safety officer or an approver). */
  async closeIncident(user: RequestUser, id: string, dto: CloseIncidentDto): Promise<SafetyIncidentDto> {
    const current = await this.loadIncident(user, id);
    await this.access.assertCanManageSafety(user, current.projectId);
    if (current.status === 'CLOSED') throw new ConflictException('This incident is already closed');
    const rootCause = dto.rootCause || current.rootCause;
    const correctiveAction = dto.correctiveAction || current.correctiveAction;
    if (!rootCause) throw new BadRequestException('Record the root cause before closing');
    if (!correctiveAction) throw new BadRequestException('Record the corrective action before closing');
    await this.prisma.safetyIncident.update({
      where: { id },
      data: { rootCause, correctiveAction, closureNote: blank(dto.closureNote), status: 'CLOSED', closedAt: new Date(), closedById: user.id },
    });
    await this.audit.log(user, 'SAFETY_INCIDENT', id, 'CLOSED', dto.closureNote ?? null);
    return this.getIncident(user, id);
  }

  async reopenIncident(user: RequestUser, id: string): Promise<SafetyIncidentDto> {
    const current = await this.loadIncident(user, id);
    await this.access.assertCanManageSafety(user, current.projectId);
    if (current.status !== 'CLOSED') throw new ConflictException('This incident is open');
    await this.prisma.safetyIncident.update({ where: { id }, data: { status: 'OPEN', closedAt: null, closedById: null } });
    await this.audit.log(user, 'SAFETY_INCIDENT', id, 'REOPENED');
    return this.getIncident(user, id);
  }

  /** For an entry made by mistake: the safety officer or an approver. */
  async removeIncident(user: RequestUser, id: string) {
    const current = await this.loadIncident(user, id);
    await this.access.assertCanManageSafety(user, current.projectId);
    await this.prisma.safetyIncident.delete({ where: { id } });
    await this.audit.log(user, 'SAFETY_INCIDENT', id, 'DELETED', current.incidentNo);
    return { ok: true };
  }

  async incidentHistory(user: RequestUser, id: string) {
    await this.loadIncident(user, id);
    return this.audit.forEntity(user.organizationId, 'SAFETY_INCIDENT', id);
  }

  /* ---------- toolbox talks ---------- */

  private talkDto(r: TalkRow): ToolboxTalkDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      talkNo: r.talkNo,
      date: dateOnly(r.date)!,
      topic: r.topic,
      conductedBy: r.conductedBy,
      contractor: r.contractor,
      attendeeCount: r.attendeeCount,
      attendees: r.attendees,
      durationMinutes: r.durationMinutes,
      notes: r.notes,
      recordedById: r.recordedById,
      recordedByName: r.recordedBy.fullName,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
    };
  }

  async listTalks(user: RequestUser, q: ListTalksQuery): Promise<Paginated<ToolboxTalkDto>> {
    const where: Prisma.ToolboxTalkWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    const date = this.dateRange(q.from, q.to);
    if (date) where.date = date;
    const words = searchWords(q.q);
    if (words.length) where.AND = words.map((w) => ({ OR: [{ talkNo: ilike(w) }, { topic: ilike(w) }, { conductedBy: ilike(w) }, { contractor: ilike(w) }, { project: { name: ilike(w) } }] }));
    const args = pageArgs(q);
    const order = q.sortOrder ?? 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.toolboxTalk.findMany({ where, include: talkInclude, orderBy: [{ date: order }, { talkNo: order }], skip: args.skip, take: args.take }),
      this.prisma.toolboxTalk.count({ where }),
    ]);
    return paginated(rows.map((r) => this.talkDto(r)), total, args);
  }

  async getTalk(user: RequestUser, id: string): Promise<ToolboxTalkDto> {
    const row = await this.prisma.toolboxTalk.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: talkInclude });
    if (!row) throw new NotFoundException('Toolbox talk not found');
    return this.talkDto(row);
  }

  async createTalk(user: RequestUser, dto: CreateTalkDto): Promise<ToolboxTalkDto> {
    if (dto.id) {
      const existing = await this.prisma.toolboxTalk.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.getTalk(user, existing.id);
    }
    await this.access.assertCanReportSafety(user, dto.projectId);
    this.assertNotFuture(dto.date);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const talkNo = await nextDocNo(tx, user.organizationId, 'TBT', async (prefix) =>
          (await tx.toolboxTalk.findFirst({ where: { organizationId: user.organizationId, talkNo: { startsWith: prefix } }, orderBy: { talkNo: 'desc' }, select: { talkNo: true } }))?.talkNo ?? null,
        );
        if (dto.id && (await tx.toolboxTalk.count({ where: { id: dto.id } }))) return null;
        const row = await tx.toolboxTalk.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            talkNo,
            date: parseDate(dto.date),
            topic: dto.topic,
            conductedBy: dto.conductedBy,
            contractor: blank(dto.contractor),
            attendeeCount: dto.attendeeCount,
            attendees: blank(dto.attendees),
            durationMinutes: dto.durationMinutes ?? null,
            notes: blank(dto.notes),
            recordedById: user.id,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.prisma.toolboxTalk.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
        if (winner) return this.getTalk(user, winner.id);
      }
      throw e;
    }
    if (!id) return this.getTalk(user, dto.id!);
    await this.attachments.link(user, 'toolboxTalkId', id, dto.attachmentIds);
    await this.audit.log(user, 'TOOLBOX_TALK', id, 'CREATED');
    return this.getTalk(user, id);
  }

  private async loadTalk(user: RequestUser, id: string) {
    const row = await this.prisma.toolboxTalk.findFirst({ where: { id, ...this.access.submissionWhere(user) } });
    if (!row) throw new NotFoundException('Toolbox talk not found');
    if (!canEditSafetyRecord(user, row.recordedById)) throw new ForbiddenException('Only the person who recorded it, the safety officer or an approver can change it');
    return row;
  }

  async updateTalk(user: RequestUser, id: string, dto: UpdateTalkDto): Promise<ToolboxTalkDto> {
    await this.loadTalk(user, id);
    if (dto.date) this.assertNotFuture(dto.date);
    const data: Prisma.ToolboxTalkUncheckedUpdateInput = {};
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.topic !== undefined) data.topic = dto.topic;
    if (dto.conductedBy !== undefined) data.conductedBy = dto.conductedBy;
    if (dto.contractor !== undefined) data.contractor = blank(dto.contractor);
    if (dto.attendeeCount !== undefined) data.attendeeCount = dto.attendeeCount;
    if (dto.attendees !== undefined) data.attendees = blank(dto.attendees);
    if (dto.durationMinutes !== undefined) data.durationMinutes = dto.durationMinutes ?? null;
    if (dto.notes !== undefined) data.notes = blank(dto.notes);
    await this.prisma.toolboxTalk.update({ where: { id }, data });
    await this.attachments.sync(user, 'toolboxTalkId', id, dto.attachmentIds);
    await this.audit.log(user, 'TOOLBOX_TALK', id, 'UPDATED');
    return this.getTalk(user, id);
  }

  async removeTalk(user: RequestUser, id: string) {
    const row = await this.loadTalk(user, id);
    await this.prisma.toolboxTalk.delete({ where: { id } });
    await this.audit.log(user, 'TOOLBOX_TALK', id, 'DELETED', row.talkNo);
    return { ok: true };
  }

  /* ---------- permits to work ---------- */

  private permitDto(r: PermitRow, now = new Date()): WorkPermitDto {
    const validTo = iso(r.validTo)!;
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      permitNo: r.permitNo,
      type: r.type,
      location: r.location,
      description: r.description,
      contractor: r.contractor,
      workerCount: r.workerCount,
      workers: r.workers,
      validFrom: iso(r.validFrom)!,
      validTo,
      precautions: r.precautions,
      status: r.status,
      expired: permitExpired({ status: r.status, validTo }, now),
      requestedById: r.requestedById,
      requestedByName: r.requestedBy.fullName,
      issuedByName: r.issuedBy?.fullName ?? null,
      issuedAt: iso(r.issuedAt),
      issueNote: r.issueNote,
      closedByName: r.closedBy?.fullName ?? null,
      closedAt: iso(r.closedAt),
      closeNote: r.closeNote,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
    };
  }

  async listPermits(user: RequestUser, q: ListPermitsQuery): Promise<Paginated<WorkPermitDto>> {
    const where: Prisma.WorkPermitWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.type) where.type = q.type;
    if (q.status) where.status = q.status;
    else if (q.active) where.status = { in: ['REQUESTED', 'ISSUED'] };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({ OR: [{ permitNo: ilike(w) }, { location: ilike(w) }, { description: ilike(w) }, { contractor: ilike(w) }, { project: { name: ilike(w) } }] }));
    const args = pageArgs(q);
    const order = q.sortOrder ?? 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.workPermit.findMany({ where, include: permitInclude, orderBy: [{ validFrom: order }, { permitNo: order }], skip: args.skip, take: args.take }),
      this.prisma.workPermit.count({ where }),
    ]);
    const now = new Date();
    return paginated(rows.map((r) => this.permitDto(r, now)), total, args);
  }

  async getPermit(user: RequestUser, id: string): Promise<WorkPermitDto> {
    const row = await this.prisma.workPermit.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: permitInclude });
    if (!row) throw new NotFoundException('Permit not found');
    return this.permitDto(row);
  }

  private validity(fromStr: string, toStr: string) {
    const validFrom = new Date(fromStr);
    const validTo = new Date(toStr);
    if (validTo.getTime() <= validFrom.getTime()) throw new BadRequestException('The permit must end after it starts');
    if (validTo.getTime() - validFrom.getTime() > PERMIT_MAX_DAYS * DAY_MS) throw new BadRequestException(`A permit is valid for at most ${PERMIT_MAX_DAYS} days; take a new one for longer work`);
    return { validFrom, validTo };
  }

  private precautions(list: string[] | undefined) {
    return [...new Set((list ?? []).map((p) => p.trim()).filter(Boolean))];
  }

  async createPermit(user: RequestUser, dto: CreatePermitDto): Promise<WorkPermitDto> {
    if (dto.id) {
      const existing = await this.prisma.workPermit.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.getPermit(user, existing.id);
    }
    await this.access.assertCanReportSafety(user, dto.projectId);
    const validity = this.validity(dto.validFrom, dto.validTo);
    if (validity.validTo.getTime() < Date.now()) throw new BadRequestException('This permit would already have ended');
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const permitNo = await nextDocNo(tx, user.organizationId, 'PTW', async (prefix) =>
          (await tx.workPermit.findFirst({ where: { organizationId: user.organizationId, permitNo: { startsWith: prefix } }, orderBy: { permitNo: 'desc' }, select: { permitNo: true } }))?.permitNo ?? null,
        );
        if (dto.id && (await tx.workPermit.count({ where: { id: dto.id } }))) return null;
        const row = await tx.workPermit.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            permitNo,
            type: dto.type,
            location: dto.location,
            description: dto.description,
            contractor: blank(dto.contractor),
            workerCount: dto.workerCount ?? null,
            workers: blank(dto.workers),
            ...validity,
            precautions: this.precautions(dto.precautions),
            requestedById: user.id,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.prisma.workPermit.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
        if (winner) return this.getPermit(user, winner.id);
      }
      throw e;
    }
    if (!id) return this.getPermit(user, dto.id!);
    await this.attachments.link(user, 'workPermitId', id, dto.attachmentIds);
    await this.audit.log(user, 'WORK_PERMIT', id, 'REQUESTED');
    const created = await this.getPermit(user, id);
    await this.notifyPermitRequested(user, created);
    return created;
  }

  private async loadPermit(user: RequestUser, id: string) {
    const row = await this.prisma.workPermit.findFirst({ where: { id, ...this.access.submissionWhere(user) } });
    if (!row) throw new NotFoundException('Permit not found');
    return row;
  }

  /** Change a permit while it is still a request: the requester, the safety officer or an approver. */
  async updatePermit(user: RequestUser, id: string, dto: UpdatePermitDto): Promise<WorkPermitDto> {
    const current = await this.loadPermit(user, id);
    if (!canEditSafetyRecord(user, current.requestedById)) throw new ForbiddenException('Only the person who asked for it, the safety officer or an approver can change it');
    if (current.status !== 'REQUESTED') throw new BadRequestException('Only a permit still waiting to be issued can be changed');
    const data: Prisma.WorkPermitUncheckedUpdateInput = {};
    if (dto.validFrom !== undefined || dto.validTo !== undefined) Object.assign(data, this.validity(dto.validFrom ?? current.validFrom.toISOString(), dto.validTo ?? current.validTo.toISOString()));
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.contractor !== undefined) data.contractor = blank(dto.contractor);
    if (dto.workerCount !== undefined) data.workerCount = dto.workerCount ?? null;
    if (dto.workers !== undefined) data.workers = blank(dto.workers);
    if (dto.precautions !== undefined) data.precautions = this.precautions(dto.precautions);
    await this.prisma.workPermit.update({ where: { id }, data });
    await this.attachments.sync(user, 'workPermitId', id, dto.attachmentIds);
    await this.audit.log(user, 'WORK_PERMIT', id, 'UPDATED');
    return this.getPermit(user, id);
  }

  /** The safety officer or an approver checks the precautions and lets the work start. */
  async issuePermit(user: RequestUser, id: string, dto: IssuePermitDto): Promise<WorkPermitDto> {
    const current = await this.loadPermit(user, id);
    await this.access.assertCanManageSafety(user, current.projectId);
    if (current.status !== 'REQUESTED') throw new ConflictException(`This permit is already ${current.status.toLowerCase()}`);
    if (current.validTo.getTime() < Date.now()) throw new BadRequestException('The permit period has already ended; ask for a new one');
    await this.prisma.workPermit.update({
      where: { id },
      data: {
        status: 'ISSUED',
        issuedById: user.id,
        issuedAt: new Date(),
        issueNote: blank(dto.note),
        ...(dto.precautions ? { precautions: this.precautions(dto.precautions) } : {}),
      },
    });
    await this.audit.log(user, 'WORK_PERMIT', id, 'ISSUED', dto.note ?? null);
    const issued = await this.getPermit(user, id);
    await this.notifyPermitDecision(user, issued);
    return issued;
  }

  async rejectPermit(user: RequestUser, id: string, dto: RejectPermitDto): Promise<WorkPermitDto> {
    const current = await this.loadPermit(user, id);
    await this.access.assertCanManageSafety(user, current.projectId);
    if (current.status !== 'REQUESTED') throw new ConflictException(`This permit is already ${current.status.toLowerCase()}`);
    await this.prisma.workPermit.update({ where: { id }, data: { status: 'REJECTED', issuedById: user.id, issuedAt: new Date(), issueNote: dto.note } });
    await this.audit.log(user, 'WORK_PERMIT', id, 'REJECTED', dto.note);
    const rejected = await this.getPermit(user, id);
    await this.notifyPermitDecision(user, rejected);
    return rejected;
  }

  /** Work done (or stopped) and the area made safe: the requester, the safety officer or an approver. */
  async closePermit(user: RequestUser, id: string, dto: ClosePermitDto): Promise<WorkPermitDto> {
    const current = await this.loadPermit(user, id);
    if (!canEditSafetyRecord(user, current.requestedById)) throw new ForbiddenException('Only the person who asked for it, the safety officer or an approver can close it');
    if (current.status !== 'ISSUED') throw new ConflictException('Only an issued permit can be closed');
    await this.prisma.workPermit.update({ where: { id }, data: { status: 'CLOSED', closedById: user.id, closedAt: new Date(), closeNote: blank(dto.note) } });
    await this.audit.log(user, 'WORK_PERMIT', id, 'CLOSED', dto.note ?? null);
    return this.getPermit(user, id);
  }

  /** A request made by mistake (its requester), or any permit (the safety officer or an approver). */
  async removePermit(user: RequestUser, id: string) {
    const current = await this.loadPermit(user, id);
    const mine = current.requestedById === user.id && current.status === 'REQUESTED';
    if (!mine) await this.access.assertCanManageSafety(user, current.projectId);
    await this.prisma.workPermit.delete({ where: { id } });
    await this.audit.log(user, 'WORK_PERMIT', id, 'DELETED', current.permitNo);
    return { ok: true };
  }

  async permitHistory(user: RequestUser, id: string) {
    await this.loadPermit(user, id);
    return this.audit.forEntity(user.organizationId, 'WORK_PERMIT', id);
  }

  /* ---------- summary ---------- */

  async summary(user: RequestUser, projectId?: string): Promise<SafetySummaryDto> {
    const scope = { ...this.access.submissionWhere(user), ...(projectId ? { projectId } : {}) };
    const today = todayStr();
    const monthStart = parseDate(`${today.slice(0, 7)}-01`);
    const yearStart = parseDate(`${today.slice(0, 4)}-01-01`);
    const now = new Date();
    const [incidents, open, lastLost, talks, permits] = await Promise.all([
      this.prisma.safetyIncident.findMany({ where: { ...scope, date: { gte: yearStart } }, select: { type: true, date: true, injuredCount: true } }),
      this.prisma.safetyIncident.count({ where: { ...scope, status: 'OPEN' } }),
      this.prisma.safetyIncident.findFirst({ where: { ...scope, type: { in: LOST_TIME_TYPES } }, orderBy: { date: 'desc' }, select: { date: true } }),
      this.prisma.toolboxTalk.aggregate({ where: { ...scope, date: { gte: monthStart } }, _count: true, _sum: { attendeeCount: true } }),
      this.prisma.workPermit.findMany({ where: { ...scope, status: { in: ['REQUESTED', 'ISSUED'] } }, select: { status: true, validTo: true } }),
    ]);
    const thisMonth = incidents.filter((i) => i.date >= monthStart);
    const counts = new Map<string, number>();
    for (const i of incidents) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
    const lastLostTimeDate = dateOnly(lastLost?.date);
    return {
      incidentsThisMonth: thisMonth.filter((i) => i.type !== 'NEAR_MISS').length,
      nearMissesThisMonth: thisMonth.filter((i) => i.type === 'NEAR_MISS').length,
      openIncidents: open,
      lostTimeThisYear: incidents.filter((i) => LOST_TIME_TYPES.includes(i.type)).length,
      injuredThisYear: incidents.reduce((s, i) => s + i.injuredCount, 0),
      daysSinceLostTime: lastLostTimeDate ? Math.round((parseDate(today).getTime() - parseDate(lastLostTimeDate).getTime()) / DAY_MS) : null,
      lastLostTimeDate,
      toolboxTalksThisMonth: talks._count,
      attendeesThisMonth: talks._sum.attendeeCount ?? 0,
      permitsRequested: permits.filter((p) => p.status === 'REQUESTED').length,
      permitsActive: permits.filter((p) => p.status === 'ISSUED' && p.validTo >= now).length,
      permitsExpired: permits.filter((p) => p.status === 'ISSUED' && p.validTo < now).length,
      byType: SAFETY_INCIDENT_TYPES.filter((t) => counts.has(t)).map((type) => ({ type, count: counts.get(type)! })),
    };
  }

  /* ---------- notifications ---------- */

  /** The project's safety officers hear of everything; its approvers of anything worse than a near miss. */
  private async notifyIncident(user: RequestUser, i: SafetyIncidentDto) {
    try {
      const userIds = (await this.access.safetyWatchersForProject(user.organizationId, i.projectId, isReportableIncident(i.type))).filter((u) => u !== user.id);
      const hurt = i.injuredCount ? `, ${i.injuredCount} hurt` : '';
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds,
        type: 'SAFETY',
        title: `${SAFETY_INCIDENT_TYPE_LABELS[i.type]} reported: ${i.location}`,
        body: `${i.incidentNo} at ${i.projectName} on ${i.date}${hurt}, reported by ${i.reportedByName}. ${i.description.length > 140 ? `${i.description.slice(0, 137)}...` : i.description}`,
        projectId: i.projectId,
        entityType: 'SAFETY_INCIDENT',
        entityId: i.id,
        dedupeKey: `SAFETY_INCIDENT:${i.id}`,
      });
    } catch (e) {
      this.log.warn(`Incident notification failed: ${(e as Error).message}`);
    }
  }

  private async notifyPermitRequested(user: RequestUser, p: WorkPermitDto) {
    try {
      const userIds = (await this.access.safetyWatchersForProject(user.organizationId, p.projectId, true)).filter((u) => u !== user.id);
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds,
        type: 'SAFETY',
        title: `Permit to work requested: ${WORK_PERMIT_TYPE_LABELS[p.type]}`,
        body: `${p.permitNo} at ${p.projectName}, ${p.location}: ${p.description}. Asked by ${p.requestedByName}.`,
        projectId: p.projectId,
        entityType: 'WORK_PERMIT',
        entityId: p.id,
        dedupeKey: `PERMIT_REQUESTED:${p.id}`,
      });
    } catch (e) {
      this.log.warn(`Permit notification failed: ${(e as Error).message}`);
    }
  }

  private async notifyPermitDecision(user: RequestUser, p: WorkPermitDto) {
    if (p.requestedById === user.id) return;
    try {
      const issued = p.status === 'ISSUED';
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: [p.requestedById],
        type: 'SAFETY',
        title: `Permit ${p.permitNo} ${issued ? 'issued' : 'rejected'}`,
        body: issued
          ? `${WORK_PERMIT_TYPE_LABELS[p.type]} at ${p.location} may start. Issued by ${p.issuedByName}${p.issueNote ? `: ${p.issueNote}` : '.'}`
          : `${WORK_PERMIT_TYPE_LABELS[p.type]} at ${p.location} was not allowed by ${p.issuedByName}: ${p.issueNote}`,
        projectId: p.projectId,
        entityType: 'WORK_PERMIT',
        entityId: p.id,
        dedupeKey: `PERMIT_${p.status}:${p.id}`,
      });
    } catch (e) {
      this.log.warn(`Permit notification failed: ${(e as Error).message}`);
    }
  }
}

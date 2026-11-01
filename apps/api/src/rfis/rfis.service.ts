import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  RFI_AGE_BUCKETS,
  canApprove,
  canRaiseRfi,
  rfiAge,
  rfiAgeBucket,
  rfiReplyBy,
  variationLabel,
  type Paginated,
  type PortalRfiDto,
  type RfiAgeBucket,
  type RfiDto,
  type RfiSortField,
  type RfiSummaryDto,
  type SortOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { todayIn } from '../notifications/time';
import { CloseRfiDto, CreateRfiDto, LinkRfiDto, ListRfisQuery, RecordAnswerDto, UpdateRfiDto, WithdrawRfiDto } from './rfis.dto';

const include = {
  project: { select: { name: true } },
  document: { select: { docNo: true, title: true } },
  boqItem: { select: { itemNo: true, description: true } },
  variation: { select: { varNo: true } },
  risk: { select: { riskNo: true } },
  raisedBy: { select: { fullName: true } },
  answeredBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.RfiInclude;
type Row = Prisma.RfiGetPayload<{ include: typeof include }>;

const ORDER: Record<RfiSortField, (o: SortOrder) => Prisma.RfiOrderByWithRelationInput[]> = {
  raisedOn: (o) => [{ raisedOn: o }, { rfiNo: o }],
  rfiNo: (o) => [{ rfiNo: o }],
  replyBy: (o) => [{ replyBy: o }, { rfiNo: 'desc' }],
  project: (o) => [{ project: { name: o } }, { raisedOn: 'desc' }],
  updatedAt: (o) => [{ updatedAt: o }],
};
const DESC_DEFAULT = new Set<string>(['raisedOn', 'rfiNo', 'updatedAt']);
const blank = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * RFI register: requests for information to the client or consultant. Staff raise, edit, record answers from letters,
 * close or withdraw them and link a variation or delay raised from the answer; the client's engineer or consultant
 * sees and answers the project's RFIs in the portal. Ageing rules are in @erp/shared rfi.ts.
 */
@Injectable()
export class RfisService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
  ) {}

  private dto(r: Row, today = todayIn()): RfiDto {
    const raisedOn = dateOnly(r.raisedOn);
    const replyBy = dateOnly(r.replyBy);
    const answeredOn = dateOnly(r.answeredOn);
    return {
      id: r.id,
      rfiNo: r.rfiNo,
      projectId: r.projectId,
      projectName: r.project.name,
      subject: r.subject,
      question: r.question,
      proposal: r.proposal,
      location: r.location,
      priority: r.priority,
      status: r.status,
      toParty: r.toParty,
      raisedOn,
      replyBy,
      documentId: r.documentId,
      documentLabel: r.document ? `${r.document.docNo} ${r.document.title}` : null,
      boqItemId: r.boqItemId,
      boqItemLabel: r.boqItem ? `${r.boqItem.itemNo} ${r.boqItem.description}` : null,
      costImpact: r.costImpact,
      timeImpact: r.timeImpact,
      answer: r.answer,
      answeredOn,
      answeredByName: r.answeredBy?.fullName ?? r.answeredByName,
      answeredInPortal: !!r.answeredById,
      answerRef: r.answerRef,
      closedOn: dateOnly(r.closedOn),
      closeNote: r.closeNote,
      variationId: r.variationId,
      variationLabel: r.variation ? variationLabel(r.variation.varNo) : null,
      riskId: r.riskId,
      riskNo: r.risk?.riskNo ?? null,
      raisedById: r.raisedById,
      raisedByName: r.raisedBy.fullName,
      age: rfiAge({ status: r.status, raisedOn, replyBy, answeredOn }, today),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  private portalDto(r: Row, today = todayIn()): PortalRfiDto {
    const d = this.dto(r, today);
    return {
      id: d.id,
      rfiNo: d.rfiNo,
      subject: d.subject,
      question: d.question,
      proposal: d.proposal,
      location: d.location,
      priority: d.priority,
      status: d.status,
      raisedOn: d.raisedOn,
      replyBy: d.replyBy,
      documentLabel: d.documentLabel,
      boqItemLabel: d.boqItemLabel,
      answer: d.answer,
      answeredOn: d.answeredOn,
      answeredByName: d.answeredByName,
      raisedByName: d.raisedByName,
      age: d.age,
      attachments: d.attachments,
    };
  }

  // Reading

  async list(user: RequestUser, q: ListRfisQuery): Promise<Paginated<RfiDto>> {
    const today = todayIn();
    const where: Prisma.RfiWhereInput = { ...this.access.submissionWhere(user) };
    const and: Prisma.RfiWhereInput[] = [];
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.documentId) where.documentId = q.documentId;
    if (q.overdue) and.push({ status: 'OPEN', replyBy: { lt: parseDate(today) } });
    for (const w of searchWords(q.q)) and.push({ OR: [{ rfiNo: ilike(w) }, { subject: ilike(w) }, { question: ilike(w) }, { location: ilike(w) }, { toParty: ilike(w) }, { answer: ilike(w) }, { document: { docNo: ilike(w) } }] });
    if (and.length) where.AND = and;
    const sortBy = q.sortBy ?? 'raisedOn';
    const o = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.rfi.findMany({ where, include, orderBy: [...ORDER[sortBy](o), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.rfi.count({ where }),
    ]);
    return paginated(rows.map((r) => this.dto(r, today)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<RfiDto> {
    const row = await this.prisma.rfi.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('RFI not found');
    return this.dto(row);
  }

  async summary(user: RequestUser, projectId?: string): Promise<RfiSummaryDto> {
    const today = todayIn();
    const base: Prisma.RfiWhereInput = { ...this.access.submissionWhere(user), ...(projectId ? { projectId } : {}) };
    const since = new Date(`${today}T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 90);
    const [open, answered, recent] = await Promise.all([
      this.prisma.rfi.findMany({ where: { ...base, status: 'OPEN' }, select: { replyBy: true, priority: true } }),
      this.prisma.rfi.count({ where: { ...base, status: 'ANSWERED' } }),
      this.prisma.rfi.findMany({ where: { ...base, answeredOn: { gte: since } }, select: { raisedOn: true, answeredOn: true } }),
    ]);
    const ageing = Object.fromEntries(RFI_AGE_BUCKETS.map((b) => [b.key, 0])) as Record<RfiAgeBucket, number>;
    let overdue = 0;
    for (const r of open) {
      const late = rfiAge({ status: 'OPEN', raisedOn: today, replyBy: dateOnly(r.replyBy), answeredOn: null }, today).daysOverdue;
      if (late > 0) overdue += 1;
      ageing[rfiAgeBucket(late)] += 1;
    }
    const days = recent.map((r) => Math.max(0, Math.round((r.answeredOn!.getTime() - r.raisedOn.getTime()) / 86_400_000)));
    return {
      open: open.length,
      overdue,
      answered,
      urgentOpen: open.filter((r) => r.priority === 'URGENT').length,
      avgDaysToAnswer: days.length ? Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10 : null,
      ageing,
    };
  }

  // Raising and changing

  private async checkLinks(projectId: string, dto: { documentId?: string | null; boqItemId?: string | null }) {
    if (dto.documentId && !(await this.prisma.document.count({ where: { id: dto.documentId, projectId } }))) throw new BadRequestException('Choose a drawing or document of this project');
    if (dto.boqItemId && !(await this.prisma.boqItem.count({ where: { id: dto.boqItemId, projectId } }))) throw new BadRequestException('Choose a BOQ item of this project');
  }

  async create(user: RequestUser, dto: CreateRfiDto): Promise<RfiDto> {
    if (dto.id) {
      const existing = await this.prisma.rfi.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.get(user, existing.id);
    }
    if (!canRaiseRfi(user.roleKey)) throw new ForbiddenException('Your role cannot raise RFIs');
    await this.access.assertCanAccessProject(user, dto.projectId);
    const today = todayIn();
    if (dto.raisedOn > today) throw new BadRequestException('Enter a raised date up to today');
    const priority = dto.priority ?? 'NORMAL';
    const replyBy = dto.replyBy ?? rfiReplyBy(dto.raisedOn, priority);
    if (replyBy < dto.raisedOn) throw new BadRequestException('The answer-by date is before the raised date: choose a later one');
    await this.checkLinks(dto.projectId, dto);
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId }, select: { name: true, consultantName: true, clientName: true } });
    const toParty = blank(dto.toParty) ?? project?.consultantName ?? project?.clientName ?? 'Client';
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const rfiNo = await nextDocNo(tx, user.organizationId, 'RFI', async (prefix) =>
          (await tx.rfi.findFirst({ where: { organizationId: user.organizationId, rfiNo: { startsWith: prefix } }, orderBy: { rfiNo: 'desc' }, select: { rfiNo: true } }))?.rfiNo ?? null,
        );
        if (dto.id && (await tx.rfi.count({ where: { id: dto.id } }))) return null;
        const row = await tx.rfi.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            rfiNo,
            subject: dto.subject,
            question: dto.question,
            proposal: blank(dto.proposal) ?? null,
            location: blank(dto.location) ?? null,
            priority,
            toParty,
            raisedOn: parseDate(dto.raisedOn),
            replyBy: parseDate(replyBy),
            documentId: dto.documentId ?? null,
            boqItemId: dto.boqItemId ?? null,
            costImpact: !!dto.costImpact,
            timeImpact: !!dto.timeImpact,
            raisedById: user.id,
          },
          select: { id: true, rfiNo: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.prisma.rfi.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
        if (winner) return this.get(user, winner.id);
      }
      throw e;
    }
    if (!id) return this.get(user, dto.id!);
    await this.attachments.link(user, 'rfiId', id, dto.attachmentIds);
    await this.audit.log(user, 'RFI', id, 'CREATED');
    const saved = await this.get(user, id);
    // The client's engineers and consultants on the project see it in their portal and are told.
    const guests = await this.access.projectGuests(user.organizationId, dto.projectId);
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: guests.map((g) => g.id),
      type: 'PORTAL',
      title: `${saved.rfiNo}${priority === 'URGENT' ? ' (urgent)' : ''}: ${saved.subject}`,
      body: `${project?.name ?? 'Project'}: answer needed by ${replyBy}. ${short(saved.question)}`,
      projectId: dto.projectId,
      entityType: 'RFI',
      entityId: id,
    });
    return saved;
  }

  private async load(user: RequestUser, id: string) {
    const row = await this.prisma.rfi.findFirst({ where: { id, ...this.access.submissionWhere(user) } });
    if (!row) throw new NotFoundException('RFI not found');
    await this.access.assertCanAccessProject(user, row.projectId);
    return row;
  }

  /** Whoever raised it or an approver. */
  private assertOwner(user: RequestUser, row: { raisedById: string }, what: string) {
    if (row.raisedById !== user.id && !canApprove(user.roleKey)) throw new ForbiddenException(`Only whoever raised the RFI or an approver can ${what}`);
  }

  async update(user: RequestUser, id: string, dto: UpdateRfiDto): Promise<RfiDto> {
    const cur = await this.load(user, id);
    this.assertOwner(user, cur, 'change it');
    if (cur.status !== 'OPEN') throw new ConflictException('Only an RFI still waiting for its answer can be changed');
    await this.checkLinks(cur.projectId, dto);
    const replyBy = dto.replyBy ?? dateOnly(cur.replyBy);
    if (replyBy < dateOnly(cur.raisedOn)) throw new BadRequestException('The answer-by date is before the raised date: choose a later one');
    const data: Prisma.RfiUncheckedUpdateInput = {};
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.question !== undefined) data.question = dto.question;
    if (dto.proposal !== undefined) data.proposal = blank(dto.proposal);
    if (dto.location !== undefined) data.location = blank(dto.location);
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.toParty !== undefined) data.toParty = dto.toParty;
    if (dto.replyBy !== undefined) data.replyBy = parseDate(dto.replyBy);
    if (dto.documentId !== undefined) data.documentId = dto.documentId;
    if (dto.boqItemId !== undefined) data.boqItemId = dto.boqItemId;
    if (dto.costImpact !== undefined) data.costImpact = dto.costImpact;
    if (dto.timeImpact !== undefined) data.timeImpact = dto.timeImpact;
    await this.prisma.rfi.update({ where: { id }, data });
    await this.attachments.sync(user, 'rfiId', id, dto.attachmentIds);
    await this.audit.log(user, 'RFI', id, 'UPDATED');
    return this.get(user, id);
  }

  /** An RFI raised by mistake, before any answer: whoever raised it or an approver. */
  async remove(user: RequestUser, id: string) {
    const cur = await this.load(user, id);
    this.assertOwner(user, cur, 'delete it');
    if (cur.status !== 'OPEN') throw new ConflictException('An answered, closed or withdrawn RFI stays on record and cannot be deleted');
    await this.prisma.rfi.delete({ where: { id } });
    await this.audit.log(user, 'RFI', id, 'DELETED', cur.rfiNo);
    return { ok: true };
  }

  // Answering and closing

  private checkAnswerDate(raisedOn: Date, answeredOn: string) {
    if (answeredOn > todayIn() || answeredOn < dateOnly(raisedOn)) throw new BadRequestException('Enter an answer date between the raised date and today');
  }

  /** Staff record an answer received by letter, mail or at a meeting. */
  async recordAnswer(user: RequestUser, id: string, dto: RecordAnswerDto): Promise<RfiDto> {
    const cur = await this.load(user, id);
    if (!canRaiseRfi(user.roleKey)) throw new ForbiddenException('Your role cannot record RFI answers');
    if (cur.status !== 'OPEN' && cur.status !== 'ANSWERED') throw new ConflictException('This RFI is closed or withdrawn: reopen it by raising a new one');
    this.checkAnswerDate(cur.raisedOn, dto.answeredOn);
    await this.prisma.rfi.update({
      where: { id },
      data: { status: 'ANSWERED', answer: dto.answer, answeredOn: parseDate(dto.answeredOn), answeredByName: dto.answeredByName, answeredById: null, answerRef: blank(dto.answerRef) ?? null },
    });
    await this.audit.log(user, 'RFI', id, 'ANSWERED', `Recorded from ${dto.answeredByName}${dto.answerRef ? ` (${dto.answerRef})` : ''}`);
    return this.get(user, id);
  }

  async close(user: RequestUser, id: string, dto: CloseRfiDto): Promise<RfiDto> {
    const cur = await this.load(user, id);
    this.assertOwner(user, cur, 'close it');
    if (cur.status !== 'ANSWERED') throw new ConflictException(cur.status === 'OPEN' ? 'Record the answer before closing the RFI' : 'This RFI is already closed or withdrawn');
    if (dto.on > todayIn() || (cur.answeredOn && dto.on < dateOnly(cur.answeredOn))) throw new BadRequestException('Enter a date between the answer date and today');
    await this.prisma.rfi.update({ where: { id }, data: { status: 'CLOSED', closedOn: parseDate(dto.on), closeNote: blank(dto.note) ?? null, closedById: user.id } });
    await this.audit.log(user, 'RFI', id, 'CLOSED', blank(dto.note) ?? null);
    return this.get(user, id);
  }

  async withdraw(user: RequestUser, id: string, dto: WithdrawRfiDto): Promise<RfiDto> {
    const cur = await this.load(user, id);
    this.assertOwner(user, cur, 'withdraw it');
    if (cur.status !== 'OPEN') throw new ConflictException('Only an RFI still waiting for its answer can be withdrawn');
    await this.prisma.rfi.update({ where: { id }, data: { status: 'WITHDRAWN', closedOn: parseDate(todayIn()), closeNote: dto.note, closedById: user.id } });
    await this.audit.log(user, 'RFI', id, 'WITHDRAWN', dto.note);
    return this.get(user, id);
  }

  /** Link (or unlink) the variation or delay raised from the answer. */
  async link(user: RequestUser, id: string, dto: LinkRfiDto): Promise<RfiDto> {
    const cur = await this.load(user, id);
    if (!canRaiseRfi(user.roleKey)) throw new ForbiddenException('Your role cannot change RFIs');
    if (dto.variationId && !(await this.prisma.variation.count({ where: { id: dto.variationId, projectId: cur.projectId } }))) throw new BadRequestException('The variation is not on this project');
    if (dto.riskId && !(await this.prisma.risk.count({ where: { id: dto.riskId, projectId: cur.projectId } }))) throw new BadRequestException('The delay or risk is not on this project');
    const data: Prisma.RfiUncheckedUpdateInput = {};
    if (dto.variationId !== undefined) data.variationId = dto.variationId;
    if (dto.riskId !== undefined) data.riskId = dto.riskId;
    await this.prisma.rfi.update({ where: { id }, data });
    await this.audit.log(user, 'RFI', id, 'LINKED', [dto.variationId !== undefined ? (dto.variationId ? 'variation linked' : 'variation unlinked') : null, dto.riskId !== undefined ? (dto.riskId ? 'delay linked' : 'delay unlinked') : null].filter(Boolean).join(', ') || null);
    return this.get(user, id);
  }

  // The client portal

  /** The project's RFIs as the client's engineer or consultant sees them: open first, then the latest. */
  async listForClient(user: RequestUser, projectId: string): Promise<PortalRfiDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const today = todayIn();
    const rows = await this.prisma.rfi.findMany({ where: { projectId, organizationId: user.organizationId, status: { not: 'WITHDRAWN' } }, include, orderBy: [{ raisedOn: 'desc' }, { rfiNo: 'desc' }], take: 200 });
    const rank = { OPEN: 0, ANSWERED: 1, CLOSED: 2, WITHDRAWN: 3 } as const;
    return rows.sort((a, b) => rank[a.status] - rank[b.status]).map((r) => this.portalDto(r, today));
  }

  /** The client's engineer or consultant answers an open RFI; whoever raised it and the project manager are told. */
  async answerAsClient(user: RequestUser, id: string, answer: string): Promise<PortalRfiDto> {
    const row = await this.prisma.rfi.findFirst({ where: { id, organizationId: user.organizationId }, select: { projectId: true, status: true, raisedById: true, rfiNo: true, subject: true, project: { select: { name: true, projectManagerId: true } } } });
    if (!row) throw new NotFoundException('RFI not found');
    await this.access.assertCanActAsClient(user, row.projectId);
    if (row.status !== 'OPEN') throw new ConflictException('This RFI has already been answered or closed: refresh the page');
    const updated = await this.prisma.rfi.update({
      where: { id },
      data: { status: 'ANSWERED', answer: answer.trim(), answeredOn: parseDate(todayIn()), answeredById: user.id, answeredByName: null, answerRef: null },
      include,
    });
    await this.audit.log(user, 'RFI', id, 'ANSWERED', `Answered in the portal by ${user.fullName}`);
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: [row.raisedById, ...(row.project.projectManagerId ? [row.project.projectManagerId] : [])],
      type: 'DOCUMENT_ISSUED',
      title: `${row.rfiNo} answered by ${user.fullName}`,
      body: `${row.subject} (${row.project.name}): ${short(answer.trim())}`,
      projectId: row.projectId,
      entityType: 'RFI',
      entityId: id,
    });
    return this.portalDto(updated);
  }
}

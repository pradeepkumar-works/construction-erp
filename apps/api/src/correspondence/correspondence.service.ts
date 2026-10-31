import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  HEAD_OFFICE_PREFIX,
  type LetterApprovalRule,
  LETTER_ACTION_LABELS,
  LETTER_NUMBER_PATTERN,
  ROLE_LABELS,
  STANDARD_LETTER_TEMPLATES,
  actionOverdue,
  awaitingReply,
  canHeadLetters,
  canSignLetters,
  canViewLetters,
  contactLine,
  formatLetterNo,
  isDirector,
  isGuest,
  letterFy,
  letterNeedsApproval,
  letterNeedsSeal,
  letterRulesProblem,
  maySealLetters,
  LETTER_SEAL_ROLES,
  letterPrefixOf,
  letterPatternProblem,
  letterPrefixProblem,
  proofMissing,
  replyOverdue,
  type LetterContactDto,
  type LetterDirection,
  type LetterDto,
  type LetterMarkDto,
  type LetterPrintDto,
  type LetterRefDto,
  type LetterSeriesDto,
  type LetterSettingsDto,
  type LetterSortField,
  type LetterStatus,
  type LetterSummaryDto,
  type LetterTemplateDto,
  type Paginated,
  type RoleKey,
  type SortOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentTextService } from '../documents/document-text.service';
import { MastersService } from '../masters/masters.service';
import { todayIn } from '../notifications/time';
import { dateOnly, formatDay, iso, parseDate } from '../common/serialize';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import {
  CreateLetterDto,
  DispatchLetterDto,
  LetterContactInput,
  LetterSeriesInput,
  LetterSettingsInput,
  LetterTemplateInput,
  ListLetterContactsQuery,
  ListLettersQuery,
  MarkLetterDto,
  SendForApprovalDto,
  UpdateLetterContactDto,
  UpdateLetterDto,
  UpdateLetterSeriesDto,
  UpdateLetterTemplateDto,
} from './correspondence.dto';

const refSelect = { id: true, letterNo: true, direction: true, letterDate: true, subject: true } as const;
const letterInclude = {
  project: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  markedTo: { select: { fullName: true } },
  signatory: { select: { fullName: true } },
  signedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
  risk: { select: { riskNo: true, title: true } },
  inReplyTo: { select: { ...refSelect, status: true } },
  replies: { select: { ...refSelect, status: true }, orderBy: { letterDate: 'asc' } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.LetterInclude;
type LetterRow = Prisma.LetterGetPayload<{ include: typeof letterInclude }>;

const markInclude = { from: { select: { fullName: true } }, to: { select: { fullName: true } } } satisfies Prisma.LetterMarkInclude;

const LETTER_ORDER: Record<LetterSortField, (o: SortOrder) => Prisma.LetterOrderByWithRelationInput[]> = {
  letterDate: (o) => [{ letterDate: o }, { createdAt: o }],
  letterNo: (o) => [{ letterNo: { sort: o, nulls: 'first' } }],
  party: (o) => [{ party: o }, { letterDate: 'desc' }],
  replyBy: (o) => [{ replyBy: { sort: o, nulls: 'last' } }, { letterDate: 'desc' }],
  actionDue: (o) => [{ actionDue: { sort: o, nulls: 'last' } }, { letterDate: 'desc' }],
  project: (o) => [{ project: { name: o } }, { letterDate: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['letterDate', 'letterNo', 'createdAt']);
const order = (sortBy: string, o: SortOrder | undefined): SortOrder => o ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');

/** A reply has gone the other way: one of ours issued to a letter received, or theirs received to one of ours. */
const repliedOf = (l: { direction: LetterDirection; replies: { direction: LetterDirection; status: LetterStatus }[] }) =>
  l.replies.some((r) => r.direction !== l.direction && (r.direction === 'IN' || r.status === 'ISSUED'));

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Correspondence (item 136, ARCHITECTURE "Correspondence"): the inward and outward registers of every project and head
 * office. A letter received is numbered from its series on entry and marked to someone; a letter sent is a draft until it
 * is issued, and where the company's rule asks for it, until its signatory approves it; only then does it get its number.
 * `recordInward` is the one way a received letter comes in (the form, and the integrations' mailbox, item 155).
 */
@Injectable()
export class CorrespondenceService {
  private readonly log = new Logger(CorrespondenceService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
    private text: DocumentTextService,
    private masters: MastersService,
  ) {}

  /* ---------- who sees what ---------- */

  /**
   * The letters a user sees: correspondence heads all of them; correspondence roles those of their projects that are not
   * confidential; anyone the letters they recorded, sign, or were marked to.
   */
  where(user: RequestUser): Prisma.LetterWhereInput {
    const org = { organizationId: user.organizationId };
    if (canHeadLetters(user.roleKey)) return org;
    const own: Prisma.LetterWhereInput[] = [{ markedToId: user.id }, { marks: { some: { toId: user.id } } }, { signatoryId: user.id }, { createdById: user.id }];
    if (!canViewLetters(user.roleKey)) return { ...org, OR: own };
    return { ...org, OR: [{ project: this.access.projectWhere(user), confidential: false }, ...own] };
  }

  /** Registers are for correspondence roles; anyone else opens only a letter that is theirs. */
  private assertRegister(user: RequestUser) {
    if (!canViewLetters(user.roleKey)) throw new ForbiddenException('Your role does not keep letters; open the ones marked to you from My work');
  }

  /** Recording a letter: a correspondence role on the project, or a correspondence head for head office. */
  private async assertMayRecord(user: RequestUser, projectId: string | null | undefined) {
    this.assertRegister(user);
    if (!projectId) {
      if (!canHeadLetters(user.roleKey)) throw new ForbiddenException('Only admins, management and the document controller keep head office letters');
      return;
    }
    await this.access.assertCanAccessProject(user, projectId);
  }

  private can(user: RequestUser, l: { direction: LetterDirection; status: LetterStatus; createdById: string; markedToId: string | null; signatoryId: string | null; signedAt: Date | null; projectId: string | null; letterNo: string | null }): LetterDto['can'] {
    const keeper = canViewLetters(user.roleKey);
    const head = canHeadLetters(user.roleKey);
    const director = isDirector(user.roleKey);
    const isIn = l.direction === 'IN';
    return {
      edit: keeper && (isIn ? l.status === 'OPEN' : l.status === 'DRAFT'),
      mark: isIn && l.status === 'OPEN' && (keeper || l.markedToId === user.id),
      // Signed and waiting for head office's seal (item 169): a director's; before that its signatory's or a director's
      sign: !isIn && l.status === 'AWAITING_APPROVAL' && (l.signedAt ? maySealLetters(user.roleKey) : l.signatoryId === user.id || director),
      close: isIn && (l.status === 'OPEN' ? keeper || l.markedToId === user.id : head),
      dispatch: !isIn && l.status === 'ISSUED' && keeper,
      remove: !l.letterNo ? l.createdById === user.id || head : head || (isIn && l.createdById === user.id),
    };
  }

  /* ---------- DTOs ---------- */

  private ref(l: { id: string; letterNo: string | null; direction: LetterDirection; letterDate: Date; subject: string }): LetterRefDto {
    return { id: l.id, letterNo: l.letterNo, direction: l.direction, letterDate: dateOnly(l.letterDate)!, subject: l.subject };
  }

  private markDto(m: Prisma.LetterMarkGetPayload<{ include: typeof markInclude }>): LetterMarkDto {
    return {
      id: m.id,
      fromName: m.from.fullName,
      toId: m.toId,
      toName: m.to.fullName,
      action: m.action,
      dueOn: dateOnly(m.dueOn),
      note: m.note,
      doneAt: iso(m.doneAt),
      doneNote: m.doneNote,
      createdAt: iso(m.createdAt)!,
    };
  }

  private toDto(user: RequestUser, l: LetterRow, categories: Map<string, string>, today: string, seal: LetterApprovalRule, marks: LetterMarkDto[] = []): LetterDto {
    const facts = {
      direction: l.direction,
      status: l.status,
      replyBy: dateOnly(l.replyBy),
      replied: repliedOf(l),
      category: l.category,
      dispatchedOn: dateOnly(l.dispatchedOn),
      deliveredOn: dateOnly(l.deliveredOn),
      actionDue: dateOnly(l.actionDue),
      markedToId: l.markedToId,
    };
    return {
      id: l.id,
      projectId: l.projectId,
      projectName: l.project?.name ?? null,
      direction: l.direction,
      letterNo: l.letterNo,
      status: l.status,
      theirRef: l.theirRef,
      letterDate: dateOnly(l.letterDate)!,
      receivedOn: dateOnly(l.receivedOn),
      party: l.party,
      contactId: l.contactId,
      subject: l.subject,
      summary: l.summary,
      body: l.body,
      category: l.category,
      categoryName: l.category ? (categories.get(l.category) ?? l.category) : null,
      priority: l.priority,
      confidential: l.confidential,
      mode: l.mode,
      replyBy: facts.replyBy,
      awaitingReply: awaitingReply(facts),
      overdue: replyOverdue(facts, today),
      inReplyTo: l.inReplyTo ? this.ref(l.inReplyTo) : null,
      replies: l.replies.map((r) => this.ref(r)),
      riskId: l.riskId,
      riskNo: l.risk?.riskNo ?? null,
      riskTitle: l.risk?.title ?? null,
      markedToId: l.markedToId,
      markedToName: l.markedTo?.fullName ?? null,
      action: l.action,
      actionDue: facts.actionDue,
      actionOverdue: actionOverdue(facts, today),
      signatoryId: l.signatoryId,
      signatoryName: l.signatory?.fullName ?? null,
      sentForApprovalAt: iso(l.sentForApprovalAt),
      signedAt: iso(l.signedAt),
      signedByName: l.signedBy?.fullName ?? null,
      needsSeal: l.direction === 'OUT' && !l.letterNo && letterNeedsApproval(seal, l.category),
      approvedAt: iso(l.approvedAt),
      returnNote: l.returnNote,
      docketNo: l.docketNo,
      dispatchedOn: facts.dispatchedOn,
      deliveredOn: facts.deliveredOn,
      deliveryProof: l.deliveryProof,
      proofMissing: proofMissing(facts),
      closedAt: iso(l.closedAt),
      closedNote: l.closedNote,
      closedByName: l.closedBy?.fullName ?? null,
      createdById: l.createdById,
      createdByName: l.createdBy.fullName,
      attachments: l.attachments.map((a) => this.attachments.toDto(a)),
      marks,
      can: this.can(user, l),
      createdAt: iso(l.createdAt)!,
      updatedAt: iso(l.updatedAt)!,
    };
  }

  private async categoryNames(organizationId: string) {
    return new Map((await this.masters.entriesFor(organizationId, 'letterCategory')).map((e) => [e.code, e.name]));
  }

  /* ---------- registers ---------- */

  /** Conditions for the register's filters (also used by the counts). */
  private filterWhere(user: RequestUser, q: Partial<ListLettersQuery>, today: Date): Prisma.LetterWhereInput[] {
    const and: Prisma.LetterWhereInput[] = [];
    if (q.projectId === 'HO') and.push({ projectId: null });
    else if (q.projectId) and.push({ projectId: q.projectId });
    if (q.direction) and.push({ direction: q.direction });
    if (q.status) and.push({ status: q.status });
    if (q.category) and.push({ category: q.category });
    if (q.riskId) and.push({ riskId: q.riskId });
    if (q.from) and.push({ letterDate: { gte: parseDate(q.from) } });
    if (q.to) and.push({ letterDate: { lte: parseDate(q.to) } });
    if (q.mine) and.push({ markedToId: user.id, status: 'OPEN' });
    if (q.toSign) and.push(this.toSignWhere(user));
    if (q.unmarked) and.push({ direction: 'IN', status: 'OPEN', markedToId: null });
    if (q.awaitingReply) and.push(this.awaitingWhere());
    if (q.overdue) and.push({ OR: [{ AND: [this.awaitingWhere(), { replyBy: { lt: today } }] }, { status: 'OPEN', markedToId: { not: null }, actionDue: { lt: today } }] });
    if (q.proofMissing) and.push(this.proofMissingWhere());
    for (const w of searchWords(q.q)) and.push({ OR: [{ letterNo: ilike(w) }, { theirRef: ilike(w) }, { party: ilike(w) }, { subject: ilike(w) }, { summary: ilike(w) }, { docketNo: ilike(w) }] });
    return and;
  }

  /** A reply due and none gone: ours to an open letter received, theirs to one of ours issued. */
  private awaitingWhere(): Prisma.LetterWhereInput {
    return {
      replyBy: { not: null },
      OR: [
        { direction: 'IN', status: 'OPEN', replies: { none: { direction: 'OUT', status: 'ISSUED' } } },
        { direction: 'OUT', status: 'ISSUED', replies: { none: { direction: 'IN' } } },
      ],
    };
  }

  /** Letters waiting for this user's approval: theirs to sign (L1), and for a director those signed and waiting for the seal (L2). */
  private toSignWhere(user: RequestUser): Prisma.LetterWhereInput {
    const sign: Prisma.LetterWhereInput = { signatoryId: user.id, status: 'AWAITING_APPROVAL', signedAt: null };
    return maySealLetters(user.roleKey) ? { OR: [sign, { status: 'AWAITING_APPROVAL', signedAt: { not: null } }] } : sign;
  }

  private proofMissingWhere(): Prisma.LetterWhereInput {
    return { direction: 'OUT', status: 'ISSUED', deliveredOn: null, category: { in: ['notice', 'claim', 'extension-of-time', 'hindrance', 'reply-to-show-cause'] } };
  }

  async list(user: RequestUser, q: ListLettersQuery): Promise<Paginated<LetterDto>> {
    if (!q.mine && !q.toSign) this.assertRegister(user);
    const today = todayIn();
    const where: Prisma.LetterWhereInput = { AND: [this.where(user), ...this.filterWhere(user, q, parseDate(today))] };
    const sortBy = q.sortBy ?? 'letterDate';
    const args = pageArgs(q);
    const [rows, total, categories, seal] = await Promise.all([
      this.prisma.letter.findMany({ where, include: letterInclude, orderBy: [...LETTER_ORDER[sortBy](order(sortBy, q.sortOrder)), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.letter.count({ where }),
      this.categoryNames(user.organizationId),
      this.sealRule(user.organizationId),
    ]);
    return paginated(rows.map((r) => this.toDto(user, r, categories, today, seal)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<LetterDto> {
    const row = await this.prisma.letter.findFirst({ where: { AND: [{ id }, this.where(user)] }, include: letterInclude });
    if (!row) throw new NotFoundException('Letter not found, or not one you can open');
    const [marks, categories, seal] = await Promise.all([
      this.prisma.letterMark.findMany({ where: { letterId: id }, include: markInclude, orderBy: { createdAt: 'asc' } }),
      this.categoryNames(user.organizationId),
      this.sealRule(user.organizationId),
    ]);
    return this.toDto(user, row, categories, todayIn(), seal, marks.map((m) => this.markDto(m)));
  }

  private async load(user: RequestUser, id: string) {
    const row = await this.prisma.letter.findFirst({ where: { AND: [{ id }, this.where(user)] } });
    if (!row) throw new NotFoundException('Letter not found, or not one you can open');
    return row;
  }

  /** Counts for the module screen, My work and the registers' chips. */
  async summary(user: RequestUser): Promise<LetterSummaryDto> {
    const base = this.where(user);
    const today = parseDate(todayIn());
    const keeper = canViewLetters(user.roleKey);
    const count = (w: Prisma.LetterWhereInput) => this.prisma.letter.count({ where: { AND: [base, w] } });
    const [markedToMe, markedToMeOverdue, toSign, repliesDue, repliesOverdue, theirsOverdue, proof, unmarked] = await Promise.all([
      count({ markedToId: user.id, status: 'OPEN' }),
      count({ markedToId: user.id, status: 'OPEN', actionDue: { lt: today } }),
      count(this.toSignWhere(user)),
      keeper ? count({ AND: [this.awaitingWhere(), { direction: 'IN' }] }) : 0,
      keeper ? count({ AND: [this.awaitingWhere(), { direction: 'IN', replyBy: { lt: today } }] }) : 0,
      keeper ? count({ AND: [this.awaitingWhere(), { direction: 'OUT', replyBy: { lt: today } }] }) : 0,
      keeper ? count(this.proofMissingWhere()) : 0,
      keeper ? count({ direction: 'IN', status: 'OPEN', markedToId: null }) : 0,
    ]);
    return { markedToMe, markedToMeOverdue, toSign, repliesDue, repliesOverdue, theirsOverdue, proofMissing: proof, unmarked };
  }

  /**
   * My work's "Letters for you": letters marked to the user and not yet acted on, and drafts waiting for their signature,
   * the most pressing first (an action date past, then the soonest; a letter to sign waits from the day it was sent).
   */
  async forMe(user: RequestUser): Promise<{ total: number; items: { id: string; letterNo: string | null; party: string; subject: string; projectName: string | null; toSign: boolean; due: string | null; action: string | null }[] }> {
    const where: Prisma.LetterWhereInput = { organizationId: user.organizationId, OR: [{ markedToId: user.id, status: 'OPEN' }, this.toSignWhere(user)] };
    const [rows, total] = await Promise.all([
      this.prisma.letter.findMany({ where, select: { id: true, letterNo: true, party: true, subject: true, status: true, actionDue: true, action: true, sentForApprovalAt: true, project: { select: { name: true } } }, orderBy: [{ actionDue: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], take: 20 }),
      this.prisma.letter.count({ where }),
    ]);
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        letterNo: r.letterNo,
        party: r.party,
        subject: r.subject,
        projectName: r.project?.name ?? null,
        toSign: r.status === 'AWAITING_APPROVAL',
        due: r.status === 'AWAITING_APPROVAL' ? (r.sentForApprovalAt ? r.sentForApprovalAt.toISOString().slice(0, 10) : null) : dateOnly(r.actionDue),
        action: r.action ? LETTER_ACTION_LABELS[r.action] : null,
      })),
    };
  }

  /** Staff a letter can be marked to, and who may sign one (for the project, or head office). */
  async people(user: RequestUser, projectId?: string) {
    this.assertRegister(user);
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, fullName: true, role: { select: { key: true } } },
      orderBy: { fullName: 'asc' },
    });
    const team = new Set(projectId ? await this.access.projectPeople(projectId) : []);
    return users
      .filter((u) => !isGuest(u.role.key as RoleKey))
      .map((u) => {
        const role = u.role.key as RoleKey;
        const onProject = team.has(u.id);
        return { id: u.id, fullName: u.fullName, roleName: ROLE_LABELS[role], onProject, canSign: this.maySign(role, onProject) };
      });
  }

  /** A signatory for a project letter: its project manager (on it) or a director; for head office, a director. */
  private maySign(role: RoleKey, onProject: boolean) {
    if (!canSignLetters(role)) return false;
    return isDirector(role) || onProject;
  }

  private async assertSignatory(organizationId: string, signatoryId: string, projectId: string | null) {
    const s = await this.prisma.user.findFirst({ where: { id: signatoryId, organizationId, isActive: true }, select: { id: true, fullName: true, role: { select: { key: true } } } });
    if (!s) throw new NotFoundException('The signatory is not an active user of the company');
    const onProject = projectId ? (await this.access.projectPeople(projectId)).includes(s.id) : false;
    if (!this.maySign(s.role.key as RoleKey, onProject)) throw new BadRequestException(`${s.fullName} cannot sign this letter. Choose its project manager or a director.`);
    return s;
  }

  /* ---------- numbering ---------- */

  /**
   * The next number of a project's (or head office's) series for a direction, counted in the financial year of `date`.
   * Under an advisory lock, so two letters never get one number; a number already taken (a pattern changed into an older
   * one) is passed over, and numbers are never given twice.
   */
  private async nextNumber(tx: Prisma.TransactionClient, organizationId: string, projectId: string | null, direction: LetterDirection, date: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`letter:${organizationId}:${projectId ?? 'HO'}:${direction}`}))`;
    const series = await this.ensureSeries(tx, organizationId, projectId, direction);
    const fy = letterFy(date);
    for (let i = 0; i < 50; i++) {
      const c = await tx.letterSeriesCounter.upsert({ where: { seriesId_fy: { seriesId: series.id, fy } }, create: { seriesId: series.id, fy, last: 1 }, update: { last: { increment: 1 } } });
      const letterNo = formatLetterNo(series.pattern, { prefix: series.prefix, direction, date, n: c.last });
      if (!(await tx.letter.count({ where: { organizationId, letterNo } }))) return { letterNo, seriesId: series.id };
    }
    throw new BadRequestException('Could not find a free letter number in this series. Change its pattern in Numbering and approval.');
  }

  private async ensureSeries(db: Db, organizationId: string, projectId: string | null, direction: LetterDirection) {
    const found = await db.letterSeries.findFirst({ where: { organizationId, projectId, direction } });
    if (found) return found;
    const prefix = projectId ? letterPrefixOf((await db.project.findFirst({ where: { id: projectId, organizationId }, select: { code: true } }))?.code ?? 'P') : HEAD_OFFICE_PREFIX;
    return db.letterSeries.create({ data: { organizationId, projectId, direction, prefix, pattern: LETTER_NUMBER_PATTERN } });
  }

  /* ---------- recording ---------- */

  private async checkLinks(organizationId: string, projectId: string | null, dto: { inReplyToId?: string | null; riskId?: string | null; contactId?: string | null; category?: string | null }, selfId?: string) {
    if (dto.inReplyToId) {
      if (dto.inReplyToId === selfId) throw new BadRequestException('A letter cannot answer itself');
      if (!(await this.prisma.letter.count({ where: { id: dto.inReplyToId, organizationId, projectId } }))) throw new NotFoundException(projectId ? 'The letter answered is not in this project' : 'The letter answered is not a head office letter');
    }
    if (dto.riskId) {
      if (!projectId) throw new BadRequestException('A head office letter cannot be linked to a project delay');
      if (!(await this.prisma.risk.count({ where: { id: dto.riskId, projectId } }))) throw new NotFoundException('The delay or risk is not in this project');
    }
    if (dto.contactId && !(await this.prisma.letterContact.count({ where: { id: dto.contactId, organizationId } }))) throw new NotFoundException('The address book entry was not found');
    if (dto.category) {
      const known = (await this.masters.entriesFor(organizationId, 'letterCategory')).some((e) => e.code === dto.category);
      if (!known) throw new BadRequestException('Choose a category from the list (Masters › Letter categories)');
    }
  }

  private checkDates(d: { direction: LetterDirection; letterDate: string; receivedOn?: string | null; replyBy?: string | null }) {
    const today = todayIn();
    if (d.letterDate > today) throw new BadRequestException('The letter date cannot be after today. Choose today or an earlier day.');
    if (d.receivedOn) {
      if (d.receivedOn > today) throw new BadRequestException('The received date cannot be after today. Choose today or an earlier day.');
      if (d.receivedOn < d.letterDate) throw new BadRequestException('The letter was received before it was dated. Check both dates.');
    }
    if (d.replyBy && d.replyBy < (d.receivedOn ?? d.letterDate)) throw new BadRequestException('The reply-by date is before the letter. Choose a later day.');
  }

  /** Records a letter received or sent (the form's one route); `alreadySent` for a letter sent outside Nirmaan. */
  async create(user: RequestUser, dto: CreateLetterDto): Promise<LetterDto> {
    if (dto.direction === 'IN') return this.recordInward(user, dto);
    return this.draftOutward(user, dto, !!dto.alreadySent);
  }

  /**
   * The one way a received letter comes in: the inward form, Ask's reading of a photographed letter, and the integrations'
   * mailbox (item 155) all call it. Numbered at once from the inward series in the financial year it was received, and
   * marked to someone when `markToId` is given.
   */
  async recordInward(user: RequestUser, dto: Omit<CreateLetterDto, 'direction' | 'alreadySent'>): Promise<LetterDto> {
    const projectId = dto.projectId || null;
    await this.assertMayRecord(user, projectId);
    const receivedOn = dto.receivedOn || todayIn();
    this.checkDates({ direction: 'IN', letterDate: dto.letterDate, receivedOn, replyBy: dto.replyBy });
    await this.checkLinks(user.organizationId, projectId, dto);
    const id = await this.prisma.$transaction(async (tx) => {
      const { letterNo, seriesId } = await this.nextNumber(tx, user.organizationId, projectId, 'IN', receivedOn);
      const row = await tx.letter.create({
        data: {
          organizationId: user.organizationId,
          projectId,
          direction: 'IN',
          letterNo,
          seriesId,
          status: 'OPEN',
          theirRef: dto.theirRef || null,
          letterDate: parseDate(dto.letterDate),
          receivedOn: parseDate(receivedOn),
          party: dto.party,
          contactId: dto.contactId || null,
          subject: dto.subject,
          summary: dto.summary || null,
          category: dto.category || null,
          priority: dto.priority ?? 'NORMAL',
          confidential: !!dto.confidential,
          mode: dto.mode ?? null,
          replyBy: dto.replyBy ? parseDate(dto.replyBy) : null,
          inReplyToId: dto.inReplyToId || null,
          riskId: dto.riskId || null,
          createdById: user.id,
        },
        select: { id: true },
      });
      return row.id;
    });
    await this.attachments.link(user, 'letterId', id, dto.attachmentIds);
    if (dto.attachmentIds?.length && projectId) await this.readFiles(user, projectId);
    await this.audit.log(user, 'LETTER', id, 'CREATED');
    if (dto.markToId) await this.mark(user, id, { toId: dto.markToId, action: dto.action ?? 'REPLY', dueOn: dto.actionDue ?? dto.replyBy ?? null, note: null });
    return this.get(user, id);
  }

  /** An outward letter starts as a draft; one already sent outside Nirmaan is numbered at once (by a signatory where it needs approval). */
  private async draftOutward(user: RequestUser, dto: CreateLetterDto, alreadySent: boolean): Promise<LetterDto> {
    const projectId = dto.projectId || null;
    await this.assertMayRecord(user, projectId);
    this.checkDates({ direction: 'OUT', letterDate: dto.letterDate, replyBy: dto.replyBy });
    await this.checkLinks(user.organizationId, projectId, dto);
    if (dto.signatoryId) await this.assertSignatory(user.organizationId, dto.signatoryId, projectId);
    if (alreadySent) {
      const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { letterApproval: true } });
      if (letterNeedsApproval(org.letterApproval, dto.category) && !canSignLetters(user.roleKey))
        throw new ForbiddenException('This kind of letter is approved by its signatory before it is numbered. Save it as a draft and send it for approval.');
    }
    const id = await this.prisma.$transaction(async (tx) => {
      const number = alreadySent ? await this.nextNumber(tx, user.organizationId, projectId, 'OUT', dto.letterDate) : null;
      const row = await tx.letter.create({
        data: {
          organizationId: user.organizationId,
          projectId,
          direction: 'OUT',
          letterNo: number?.letterNo ?? null,
          seriesId: number?.seriesId ?? null,
          status: alreadySent ? 'ISSUED' : 'DRAFT',
          theirRef: dto.theirRef || null,
          letterDate: parseDate(dto.letterDate),
          party: dto.party,
          contactId: dto.contactId || null,
          subject: dto.subject,
          summary: dto.summary || null,
          body: dto.body || null,
          category: dto.category || null,
          priority: dto.priority ?? 'NORMAL',
          confidential: !!dto.confidential,
          mode: dto.mode ?? null,
          replyBy: dto.replyBy ? parseDate(dto.replyBy) : null,
          inReplyToId: dto.inReplyToId || null,
          riskId: dto.riskId || null,
          signatoryId: dto.signatoryId || (alreadySent && canSignLetters(user.roleKey) ? user.id : null),
          approvedAt: alreadySent ? new Date() : null,
          createdById: user.id,
        },
        select: { id: true },
      });
      return row.id;
    });
    await this.attachments.link(user, 'letterId', id, dto.attachmentIds);
    if (dto.attachmentIds?.length && projectId) await this.readFiles(user, projectId);
    await this.audit.log(user, 'LETTER', id, alreadySent ? 'ISSUED' : 'CREATED');
    if (alreadySent) await this.settleAnswered(user, id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateLetterDto): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (!this.can(user, cur).edit) throw new BadRequestException(cur.direction === 'IN' ? 'A closed letter stays as it is; reopen it first' : 'Only a draft can be changed; an issued letter keeps its text and number');
    const projectId = dto.projectId !== undefined ? dto.projectId || null : cur.projectId;
    if (projectId !== cur.projectId) {
      if (cur.letterNo) throw new BadRequestException('A numbered letter stays in its own register');
      await this.assertMayRecord(user, projectId);
    } else if (cur.projectId) await this.access.assertCanAccessProject(user, cur.projectId);
    const letterDate = dto.letterDate ?? dateOnly(cur.letterDate)!;
    const receivedOn = dto.receivedOn !== undefined ? dto.receivedOn : dateOnly(cur.receivedOn);
    const replyBy = dto.replyBy !== undefined ? dto.replyBy : dateOnly(cur.replyBy);
    this.checkDates({ direction: cur.direction, letterDate, receivedOn: cur.direction === 'IN' ? receivedOn : null, replyBy });
    await this.checkLinks(user.organizationId, projectId, dto, id);
    if (dto.signatoryId) await this.assertSignatory(user.organizationId, dto.signatoryId, projectId);
    const data: Prisma.LetterUncheckedUpdateInput = {};
    if (projectId !== cur.projectId) data.projectId = projectId;
    if (dto.theirRef !== undefined) data.theirRef = dto.theirRef || null;
    if (dto.letterDate !== undefined) data.letterDate = parseDate(dto.letterDate);
    if (dto.receivedOn !== undefined && cur.direction === 'IN' && dto.receivedOn) data.receivedOn = parseDate(dto.receivedOn);
    if (dto.party !== undefined) data.party = dto.party;
    if (dto.contactId !== undefined) data.contactId = dto.contactId || null;
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.summary !== undefined) data.summary = dto.summary || null;
    if (dto.body !== undefined && cur.direction === 'OUT') data.body = dto.body || null;
    if (dto.category !== undefined) data.category = dto.category || null;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.confidential !== undefined) data.confidential = dto.confidential;
    if (dto.mode !== undefined) data.mode = dto.mode ?? null;
    if (dto.replyBy !== undefined) data.replyBy = dto.replyBy ? parseDate(dto.replyBy) : null;
    if (dto.inReplyToId !== undefined) data.inReplyToId = dto.inReplyToId || null;
    if (dto.riskId !== undefined) data.riskId = dto.riskId || null;
    if (dto.signatoryId !== undefined) data.signatoryId = dto.signatoryId || null;
    await this.prisma.letter.update({ where: { id }, data });
    await this.attachments.sync(user, 'letterId', id, dto.attachmentIds);
    if (projectId && dto.attachmentIds?.length) await this.readFiles(user, projectId);
    await this.audit.log(user, 'LETTER', id, 'UPDATED');
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const cur = await this.load(user, id);
    if (!this.can(user, cur).remove) throw new ForbiddenException(cur.letterNo ? 'A numbered letter stays on the register; only admins, management and the document controller delete one' : 'Only whoever started the draft deletes it');
    await this.prisma.letter.delete({ where: { id } });
    await this.audit.log(user, 'LETTER', id, 'DELETED', cur.letterNo ?? cur.subject);
    return { ok: true };
  }

  /* ---------- marking ---------- */

  /** Marks (or forwards) a received letter to someone with an action and a date; the step before is closed as forwarded. */
  async mark(user: RequestUser, id: string, dto: MarkLetterDto): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (!this.can(user, cur).mark) throw new ForbiddenException(cur.status === 'CLOSED' ? 'The letter is closed; reopen it to mark it again' : 'Only letters received are marked, by the correspondence desk or whoever has it now');
    const to = await this.prisma.user.findFirst({ where: { id: dto.toId, organizationId: user.organizationId, isActive: true }, select: { id: true, fullName: true, role: { select: { key: true } } } });
    if (!to || isGuest(to.role.key as RoleKey)) throw new NotFoundException('Choose someone on the company’s staff');
    if (dto.dueOn && dto.dueOn < dateOnly(cur.receivedOn ?? cur.letterDate)!) throw new BadRequestException('The action date is before the letter came in. Choose a later day.');
    await this.prisma.$transaction(async (tx) => {
      await tx.letterMark.updateMany({ where: { letterId: id, doneAt: null }, data: { doneAt: new Date(), doneNote: `Forwarded to ${to.fullName}` } });
      await tx.letterMark.create({ data: { organizationId: user.organizationId, letterId: id, fromId: user.id, toId: to.id, action: dto.action, dueOn: dto.dueOn ? parseDate(dto.dueOn) : null, note: dto.note || null } });
      await tx.letter.update({ where: { id }, data: { markedToId: to.id, action: dto.action, actionDue: dto.dueOn ? parseDate(dto.dueOn) : null } });
    });
    await this.audit.log(user, 'LETTER', id, 'MARKED', `${to.fullName}: ${LETTER_ACTION_LABELS[dto.action]}`);
    if (to.id !== user.id) {
      await this.notifications
        .notify({
          organizationId: user.organizationId,
          userIds: [to.id],
          type: 'LETTER',
          title: `${LETTER_ACTION_LABELS[dto.action]}: ${cur.letterNo ?? 'letter'} from ${cur.party}`,
          body: [cur.subject, dto.dueOn ? `by ${formatDay(dto.dueOn)}` : null, dto.note ? `${user.fullName}: ${dto.note}` : `marked by ${user.fullName}`].filter(Boolean).join(' · '),
          projectId: cur.projectId,
          entityType: 'LETTER',
          entityId: id,
          email: { href: `/correspondence/${id}`, cta: 'Open the letter' },
        })
        .catch((e: Error) => this.log.warn(`letter mark notice: ${e.message}`));
    }
    return this.get(user, id);
  }

  /** Settles a received letter (replied, complied, noted, filed), closing the step that had it. */
  async close(user: RequestUser, id: string, note: string | null | undefined): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (cur.direction !== 'IN' || cur.status !== 'OPEN' || !this.can(user, cur).close) throw new BadRequestException('Only an open letter received is closed, by the correspondence desk or whoever has it');
    await this.closeInward(user, id, note || null);
    return this.get(user, id);
  }

  private async closeInward(user: RequestUser, id: string, note: string | null) {
    await this.prisma.$transaction([
      this.prisma.letterMark.updateMany({ where: { letterId: id, doneAt: null }, data: { doneAt: new Date(), doneNote: note ?? 'Closed' } }),
      this.prisma.letter.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: user.id, closedNote: note } }),
    ]);
    await this.audit.log(user, 'LETTER', id, 'CLOSED', note ?? undefined);
  }

  async reopen(user: RequestUser, id: string): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (cur.direction !== 'IN' || cur.status !== 'CLOSED' || !(canHeadLetters(user.roleKey) || cur.closedById === user.id)) throw new BadRequestException('Only a closed letter received is reopened, by whoever closed it or the correspondence heads');
    await this.prisma.letter.update({ where: { id }, data: { status: 'OPEN', closedAt: null, closedById: null, closedNote: null } });
    await this.audit.log(user, 'LETTER', id, 'REOPENED');
    return this.get(user, id);
  }

  /** When one of ours is issued in reply to a letter received and still open, that letter is settled by it. */
  private async settleAnswered(user: RequestUser, outId: string) {
    const out = await this.prisma.letter.findUnique({ where: { id: outId }, select: { letterNo: true, inReplyTo: { select: { id: true, direction: true, status: true } } } });
    const answered = out?.inReplyTo;
    if (answered && answered.direction === 'IN' && answered.status === 'OPEN') await this.closeInward(user, answered.id, `Replied with ${out.letterNo}`);
  }

  /* ---------- sign-off and issue ---------- */

  private async sealRule(organizationId: string) {
    return (await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { letterSeal: true } })).letterSeal;
  }

  private async approvalRule(organizationId: string) {
    return (await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { letterApproval: true } })).letterApproval;
  }

  /** A draft goes to its signatory, who approves it (and it gets its number) or returns it with what to change. */
  async sendForApproval(user: RequestUser, id: string, dto: SendForApprovalDto): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (cur.direction !== 'OUT' || cur.status !== 'DRAFT') throw new BadRequestException('Only a draft letter is sent for approval');
    this.assertRegister(user);
    const signatoryId = dto.signatoryId || cur.signatoryId;
    if (!signatoryId) throw new BadRequestException('Choose who signs the letter');
    const s = await this.assertSignatory(user.organizationId, signatoryId, cur.projectId);
    if (!cur.body?.trim()) throw new BadRequestException('Write the letter before sending it for approval');
    await this.prisma.letter.update({ where: { id }, data: { status: 'AWAITING_APPROVAL', signatoryId: s.id, sentForApprovalAt: new Date(), returnNote: null } });
    await this.audit.log(user, 'LETTER', id, 'SUBMITTED', s.fullName);
    if (s.id !== user.id) {
      await this.notifications
        .notify({
          organizationId: user.organizationId,
          userIds: [s.id],
          type: 'LETTER',
          title: `To sign: ${cur.subject}`,
          body: `To ${cur.party}, drafted by ${user.fullName}`,
          projectId: cur.projectId,
          entityType: 'LETTER',
          entityId: id,
          email: { href: `/correspondence/${id}`, cta: 'Read and sign' },
        })
        .catch((e: Error) => this.log.warn(`letter approval notice: ${e.message}`));
    }
    return this.get(user, id);
  }

  /** Issues a draft that needs no approval: numbered now and dated today. */
  async issue(user: RequestUser, id: string): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (cur.direction !== 'OUT' || cur.status !== 'DRAFT') throw new BadRequestException('Only a draft letter is issued');
    this.assertRegister(user);
    if (letterNeedsApproval(await this.approvalRule(user.organizationId), cur.category)) throw new BadRequestException('This kind of letter is approved by its signatory before it is numbered. Send it for approval.');
    await this.number(user, cur, 'ISSUED');
    return this.get(user, id);
  }

  /** The signatory approves: the letter gets its number, is dated today and is issued. */
  async approve(user: RequestUser, id: string): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (!this.can(user, cur).sign)
      throw new ForbiddenException(cur.status !== 'AWAITING_APPROVAL' ? 'The letter is not waiting for approval' : cur.signedAt ? 'A director seals this letter at head office' : 'Only its signatory or a director approves this letter');
    if (!cur.signedAt && letterNeedsSeal(await this.sealRule(user.organizationId), cur.category, user.roleKey)) {
      await this.sign(user, cur);
      return this.get(user, id);
    }
    await this.number(user, cur, 'APPROVED');
    if (cur.createdById !== user.id) {
      const fresh = await this.prisma.letter.findUniqueOrThrow({ where: { id }, select: { letterNo: true } });
      await this.notifications
        .notify({
          organizationId: user.organizationId,
          userIds: [cur.createdById],
          type: 'LETTER',
          title: `Approved: ${fresh.letterNo}`,
          body: `${cur.subject}, signed by ${user.fullName}. Print it and dispatch it.`,
          projectId: cur.projectId,
          entityType: 'LETTER',
          entityId: id,
          email: { href: `/correspondence/${id}`, cta: 'Print and dispatch' },
        })
        .catch((e: Error) => this.log.warn(`letter approved notice: ${e.message}`));
    }
    return this.get(user, id);
  }

  /** The signatory's approval (L1) of a letter that then waits for a director's seal at head office (L2, item 169). */
  private async sign(user: RequestUser, cur: { id: string; subject: string; party: string; projectId: string | null }) {
    await this.prisma.letter.update({ where: { id: cur.id }, data: { signedAt: new Date(), signedById: user.id } });
    await this.audit.log(user, 'LETTER', cur.id, 'APPROVED', 'Signed; waiting for the seal at head office');
    const directors = await this.prisma.user.findMany({ where: { organizationId: user.organizationId, isActive: true, id: { not: user.id }, role: { key: { in: [...LETTER_SEAL_ROLES] } } }, select: { id: true } });
    if (!directors.length) return;
    await this.notifications
      .notify({
        organizationId: user.organizationId,
        userIds: directors.map((d) => d.id),
        type: 'LETTER',
        title: `To seal: ${cur.subject}`,
        body: `To ${cur.party}, signed by ${user.fullName}`,
        projectId: cur.projectId,
        entityType: 'LETTER',
        entityId: cur.id,
        email: { href: `/correspondence/${cur.id}`, cta: 'Read and seal' },
      })
      .catch((e: Error) => this.log.warn(`letter seal notice: ${e.message}`));
  }

  private async number(user: RequestUser, cur: { id: string; projectId: string | null; signatoryId: string | null }, action: 'ISSUED' | 'APPROVED') {
    const today = todayIn();
    const letterNo = await this.prisma.$transaction(async (tx) => {
      const n = await this.nextNumber(tx, user.organizationId, cur.projectId, 'OUT', today);
      await tx.letter.update({
        where: { id: cur.id },
        data: { letterNo: n.letterNo, seriesId: n.seriesId, status: 'ISSUED', letterDate: parseDate(today), approvedAt: new Date(), signatoryId: cur.signatoryId ?? (canSignLetters(user.roleKey) ? user.id : null), returnNote: null },
      });
      return n.letterNo;
    });
    await this.audit.log(user, 'LETTER', cur.id, action, letterNo);
    await this.settleAnswered(user, cur.id);
  }

  async returnToDraft(user: RequestUser, id: string, note: string): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (!this.can(user, cur).sign) throw new ForbiddenException(cur.signedAt ? 'A director returns a letter waiting for the seal' : 'Only its signatory or a director returns this letter');
    await this.prisma.letter.update({ where: { id }, data: { status: 'DRAFT', returnNote: note, sentForApprovalAt: null, signedAt: null, signedById: null } });
    await this.audit.log(user, 'LETTER', id, 'CHANGES_REQUESTED', note);
    if (cur.createdById !== user.id) {
      await this.notifications
        .notify({
          organizationId: user.organizationId,
          userIds: [cur.createdById],
          type: 'LETTER',
          title: `Returned: ${cur.subject}`,
          body: `${user.fullName}: ${note}`,
          projectId: cur.projectId,
          entityType: 'LETTER',
          entityId: id,
          email: { href: `/correspondence/${id}`, cta: 'Change the draft' },
        })
        .catch((e: Error) => this.log.warn(`letter returned notice: ${e.message}`));
    }
    return this.get(user, id);
  }

  /** How and when an issued letter went, and the proof it arrived. */
  async dispatch(user: RequestUser, id: string, dto: DispatchLetterDto): Promise<LetterDto> {
    const cur = await this.load(user, id);
    if (!this.can(user, cur).dispatch) throw new BadRequestException('Only an issued letter is dispatched, by the correspondence desk');
    const today = todayIn();
    const dated = dateOnly(cur.letterDate)!;
    if (dto.dispatchedOn > today) throw new BadRequestException('The dispatch date cannot be after today. Choose today or an earlier day.');
    if (dto.dispatchedOn < dated) throw new BadRequestException('The letter went before it was dated. Check the dispatch date.');
    if (dto.deliveredOn && dto.deliveredOn > today) throw new BadRequestException('The delivery date cannot be after today. Choose today or an earlier day.');
    if (dto.deliveredOn && dto.deliveredOn < dto.dispatchedOn) throw new BadRequestException('It was delivered before it went. Check both dates.');
    await this.prisma.letter.update({
      where: { id },
      data: { mode: dto.mode, docketNo: dto.docketNo || null, dispatchedOn: parseDate(dto.dispatchedOn), deliveredOn: dto.deliveredOn ? parseDate(dto.deliveredOn) : null, deliveryProof: dto.deliveryProof || null },
    });
    await this.attachments.link(user, 'letterId', id, dto.attachmentIds);
    await this.audit.log(user, 'LETTER', id, 'DISPATCHED', [dto.mode, dto.docketNo, dto.deliveredOn ? `delivered ${dto.deliveredOn}` : null].filter(Boolean).join(' · '));
    return this.get(user, id);
  }

  /** The letter as printed on the company's letterhead; a draft prints marked as one. */
  async print(user: RequestUser, id: string): Promise<LetterPrintDto> {
    const letter = await this.get(user, id);
    if (letter.direction !== 'OUT') throw new BadRequestException('Only a letter we send is printed on the letterhead');
    const [org, contact, signer] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { name: true, billingAddress: true, billingGstin: true } }),
      letter.contactId ? this.prisma.letterContact.findUnique({ where: { id: letter.contactId } }) : null,
      letter.signatoryId ? this.prisma.user.findUnique({ where: { id: letter.signatoryId }, select: { fullName: true, role: { select: { key: true } }, employee: { select: { designation: true } } } }) : null,
    ]);
    return {
      company: { name: org.name, address: org.billingAddress, gstin: org.billingGstin },
      letter,
      to: contact ? { name: contact.name, office: contact.office, organisation: contact.organisation, address: contact.address } : { name: letter.party, office: null, organisation: null, address: null },
      signedBy: signer ? { name: signer.fullName, title: signer.employee?.designation ?? ROLE_LABELS[signer.role.key as RoleKey] } : null,
    };
  }

  /** Reads newly filed PDFs of the project into searchable pages (Ask the contract). */
  private async readFiles(user: RequestUser, projectId: string) {
    await this.text.readPending(user.organizationId, [projectId], 3, 15_000).catch((e: Error) => this.log.warn(`reading files: ${e.message}`));
  }

  /* ---------- numbering and approval settings ---------- */

  private assertHead(user: RequestUser) {
    if (!canHeadLetters(user.roleKey)) throw new ForbiddenException('Only admins, management and the document controller change letter numbering and approval');
  }

  private async seriesDto(s: { id: string; projectId: string | null; direction: LetterDirection; prefix: string; pattern: string; project: { name: string } | null }, today: string): Promise<LetterSeriesDto> {
    const fy = letterFy(today);
    const used = (await this.prisma.letterSeriesCounter.findUnique({ where: { seriesId_fy: { seriesId: s.id, fy } } }))?.last ?? 0;
    return { id: s.id, projectId: s.projectId, projectName: s.project?.name ?? null, direction: s.direction, prefix: s.prefix, pattern: s.pattern, next: formatLetterNo(s.pattern, { prefix: s.prefix, direction: s.direction, date: today, n: used + 1 }), usedThisYear: used };
  }

  /** The approval rule and a series for head office and each live project, made with the defaults where missing. */
  async settings(user: RequestUser): Promise<LetterSettingsDto> {
    this.assertRegister(user);
    const org = user.organizationId;
    const projects = await this.prisma.project.findMany({ where: { ...this.access.projectWhere(user), type: { not: 'STORE' }, status: { notIn: ['COMPLETED', 'CLOSED'] } }, select: { id: true }, orderBy: { name: 'asc' } });
    const scopes: (string | null)[] = [...(canHeadLetters(user.roleKey) ? [null] : []), ...projects.map((p) => p.id)];
    for (const projectId of scopes) for (const direction of ['IN', 'OUT'] as const) await this.ensureSeries(this.prisma, org, projectId, direction);
    const rows = await this.prisma.letterSeries.findMany({ where: { organizationId: org, OR: [{ projectId: { in: projects.map((p) => p.id) } }, ...(canHeadLetters(user.roleKey) ? [{ projectId: null }] : [])] }, include: { project: { select: { name: true } } } });
    rows.sort((a, b) => (a.projectId === null ? -1 : b.projectId === null ? 1 : (a.project?.name ?? '').localeCompare(b.project?.name ?? '')) || a.direction.localeCompare(b.direction));
    const today = todayIn();
    return { approval: await this.approvalRule(org), seal: await this.sealRule(org), series: await Promise.all(rows.map((r) => this.seriesDto(r, today))), pattern: LETTER_NUMBER_PATTERN, canManage: canHeadLetters(user.roleKey) };
  }

  async saveSettings(user: RequestUser, dto: LetterSettingsInput): Promise<LetterSettingsDto> {
    this.assertHead(user);
    const seal = dto.seal ?? (await this.sealRule(user.organizationId));
    const problem = letterRulesProblem(dto.approval, seal);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { letterApproval: dto.approval, letterSeal: seal } });
    await this.audit.log(user, 'ORGANIZATION', user.organizationId, 'UPDATED', `Letter approval: ${dto.approval}; seal at head office: ${seal}`);
    return this.settings(user);
  }

  async saveSeries(user: RequestUser, dto: LetterSeriesInput): Promise<LetterSeriesDto> {
    this.assertHead(user);
    if (dto.projectId) await this.access.assertCanAccessProject(user, dto.projectId);
    const s = await this.ensureSeries(this.prisma, user.organizationId, dto.projectId || null, dto.direction);
    return this.updateSeries(user, s.id, dto);
  }

  async updateSeries(user: RequestUser, id: string, dto: UpdateLetterSeriesDto): Promise<LetterSeriesDto> {
    this.assertHead(user);
    const cur = await this.prisma.letterSeries.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!cur) throw new NotFoundException('Series not found');
    const problem = (dto.pattern !== undefined ? letterPatternProblem(dto.pattern) : null) ?? (dto.prefix !== undefined ? letterPrefixProblem(dto.prefix) : null);
    if (problem) throw new BadRequestException(problem);
    const row = await this.prisma.letterSeries.update({ where: { id }, data: { prefix: dto.prefix?.trim(), pattern: dto.pattern?.trim() }, include: { project: { select: { name: true } } } });
    await this.audit.log(user, 'LETTER_SERIES', id, 'UPDATED', `${row.prefix} ${row.pattern}`);
    return this.seriesDto(row, todayIn());
  }

  /* ---------- address book ---------- */

  private contactDto(c: Prisma.LetterContactGetPayload<{ include: { client: { select: { name: true } }; _count: { select: { letters: true } } } }>): LetterContactDto {
    return { id: c.id, name: c.name, office: c.office, organisation: c.organisation, address: c.address, email: c.email, phone: c.phone, clientId: c.clientId, clientName: c.client?.name ?? null, isActive: c.isActive, letters: c._count.letters };
  }

  async contacts(user: RequestUser, q: ListLetterContactsQuery): Promise<Paginated<LetterContactDto>> {
    this.assertRegister(user);
    const and: Prisma.LetterContactWhereInput[] = [{ organizationId: user.organizationId }];
    if (!q.all) and.push({ isActive: true });
    for (const w of searchWords(q.q)) and.push({ OR: [{ name: ilike(w) }, { office: ilike(w) }, { organisation: ilike(w) }, { email: ilike(w) }] });
    const args = pageArgs(q);
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.letterContact.findMany({ where, include: { client: { select: { name: true } }, _count: { select: { letters: true } } }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { office: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.letterContact.count({ where }),
    ]);
    return paginated(rows.map((r) => this.contactDto(r)), total, args);
  }

  private async checkContact(user: RequestUser, dto: Partial<LetterContactInput>, selfId?: string) {
    if (dto.clientId && !(await this.prisma.client.count({ where: { id: dto.clientId, organizationId: user.organizationId } }))) throw new NotFoundException('Client not found');
    if (dto.name !== undefined || dto.office !== undefined) {
      const cur = selfId ? await this.prisma.letterContact.findUnique({ where: { id: selfId } }) : null;
      const name = (dto.name ?? cur?.name ?? '').trim();
      const office = (dto.office !== undefined ? dto.office : cur?.office) ?? null;
      const twin = await this.prisma.letterContact.findFirst({ where: { organizationId: user.organizationId, name: { equals: name, mode: 'insensitive' }, office: office ? { equals: office, mode: 'insensitive' } : null, id: selfId ? { not: selfId } : undefined } });
      if (twin) throw new BadRequestException(`${contactLine(twin)} is already in the address book`);
    }
  }

  async createContact(user: RequestUser, dto: LetterContactInput): Promise<LetterContactDto> {
    this.assertRegister(user);
    await this.checkContact(user, dto);
    const row = await this.prisma.letterContact.create({
      data: { organizationId: user.organizationId, name: dto.name, office: dto.office || null, organisation: dto.organisation || null, address: dto.address || null, email: dto.email || null, phone: dto.phone || null, clientId: dto.clientId || null, isActive: dto.isActive ?? true },
      include: { client: { select: { name: true } }, _count: { select: { letters: true } } },
    });
    await this.audit.log(user, 'LETTER_CONTACT', row.id, 'CREATED', contactLine(row));
    return this.contactDto(row);
  }

  async updateContact(user: RequestUser, id: string, dto: UpdateLetterContactDto): Promise<LetterContactDto> {
    this.assertRegister(user);
    if (!(await this.prisma.letterContact.count({ where: { id, organizationId: user.organizationId } }))) throw new NotFoundException('Address book entry not found');
    await this.checkContact(user, dto, id);
    const data: Prisma.LetterContactUncheckedUpdateInput = {};
    if (dto.name) data.name = dto.name;
    for (const k of ['office', 'organisation', 'address', 'email', 'phone', 'clientId'] as const) if (dto[k] !== undefined) data[k] = dto[k] || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const row = await this.prisma.letterContact.update({ where: { id }, data, include: { client: { select: { name: true } }, _count: { select: { letters: true } } } });
    await this.audit.log(user, 'LETTER_CONTACT', id, 'UPDATED', contactLine(row));
    return this.contactDto(row);
  }

  async removeContact(user: RequestUser, id: string) {
    this.assertRegister(user);
    const row = await this.prisma.letterContact.findFirst({ where: { id, organizationId: user.organizationId }, include: { _count: { select: { letters: true } } } });
    if (!row) throw new NotFoundException('Address book entry not found');
    if (row._count.letters) throw new BadRequestException(`${row._count.letters} letter${row._count.letters === 1 ? '' : 's'} name this entry; switch it off instead`);
    await this.prisma.letterContact.delete({ where: { id } });
    await this.audit.log(user, 'LETTER_CONTACT', id, 'DELETED', contactLine(row));
    return { ok: true };
  }

  /* ---------- templates ---------- */

  private templateDto(t: { id: string; name: string; category: string | null; subject: string; body: string; isActive: boolean }): LetterTemplateDto {
    return { id: t.id, name: t.name, category: t.category, subject: t.subject, body: t.body, isActive: t.isActive };
  }

  /** The company's templates; a company with none starts with the standard three. */
  async templates(user: RequestUser): Promise<LetterTemplateDto[]> {
    this.assertRegister(user);
    const org = user.organizationId;
    if (!(await this.prisma.letterTemplate.count({ where: { organizationId: org } })))
      await this.prisma.letterTemplate.createMany({ data: STANDARD_LETTER_TEMPLATES.map((t) => ({ organizationId: org, ...t })), skipDuplicates: true });
    const rows = await this.prisma.letterTemplate.findMany({ where: { organizationId: org }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return rows.map((r) => this.templateDto(r));
  }

  private async checkTemplate(user: RequestUser, dto: Partial<LetterTemplateInput>, selfId?: string) {
    if (dto.category && !(await this.masters.entriesFor(user.organizationId, 'letterCategory')).some((e) => e.code === dto.category)) throw new BadRequestException('Choose a category from the list (Masters › Letter categories)');
    if (dto.name && (await this.prisma.letterTemplate.count({ where: { organizationId: user.organizationId, name: { equals: dto.name, mode: 'insensitive' }, id: selfId ? { not: selfId } : undefined } }))) throw new BadRequestException(`A template is already called ${dto.name}`);
  }

  async createTemplate(user: RequestUser, dto: LetterTemplateInput): Promise<LetterTemplateDto> {
    this.assertRegister(user);
    await this.checkTemplate(user, dto);
    const row = await this.prisma.letterTemplate.create({ data: { organizationId: user.organizationId, name: dto.name, category: dto.category || null, subject: dto.subject, body: dto.body, isActive: dto.isActive ?? true } });
    await this.audit.log(user, 'LETTER_TEMPLATE', row.id, 'CREATED', row.name);
    return this.templateDto(row);
  }

  async updateTemplate(user: RequestUser, id: string, dto: UpdateLetterTemplateDto): Promise<LetterTemplateDto> {
    this.assertRegister(user);
    if (!(await this.prisma.letterTemplate.count({ where: { id, organizationId: user.organizationId } }))) throw new NotFoundException('Template not found');
    await this.checkTemplate(user, dto, id);
    const row = await this.prisma.letterTemplate.update({ where: { id }, data: { name: dto.name, category: dto.category !== undefined ? dto.category || null : undefined, subject: dto.subject, body: dto.body, isActive: dto.isActive } });
    await this.audit.log(user, 'LETTER_TEMPLATE', id, 'UPDATED', row.name);
    return this.templateDto(row);
  }

  async removeTemplate(user: RequestUser, id: string) {
    this.assertRegister(user);
    const row = await this.prisma.letterTemplate.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Template not found');
    await this.prisma.letterTemplate.delete({ where: { id } });
    await this.audit.log(user, 'LETTER_TEMPLATE', id, 'DELETED', row.name);
    return { ok: true };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canManageDocuments,
  commentState,
  commentsClosedBy,
  coveringLetter,
  designCodeProblem,
  designDaysOutstanding,
  designSubmitProblem,
  designSummary,
  isClientSide,
  isDesignApproved,
  isGuest,
  masterCode,
  replyByFor,
  reviewDaysLate,
  revisionStatusAfter,
  statusForCode,
  DESIGN_PURPOSE_LABELS,
  type DesignCode,
  type DesignCommentDto,
  type DesignPurpose,
  type DesignSubmissionDetailDto,
  type DesignSubmissionDto,
  type DesignSubmissionKind,
  type DesignSubmissionListDto,
  type DesignSubmissionStatus,
  type DocumentDiscipline,
  type DrawingSource,
  type RevisionStatus,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService } from '../common/attachments.service';
import { CorrespondenceService } from '../correspondence/correspondence.service';
import { DocumentsService } from '../documents/documents.service';
import { RisksService } from '../risks/risks.service';
import { EpcService } from '../epc/epc.service';
import { todayIn } from '../notifications/time';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { titleDate } from '../common/submission-titles';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, searchWords } from '../common/paging';
import { DesignSubmissionsQuery, RecordDesignCodeDto, ReplyCommentDto, SaveDesignSubmissionDto, SubmitDesignDto, WithdrawDesignDto } from './design-submissions.dto';

const listInclude = {
  project: { select: { code: true, name: true } },
  createdBy: { select: { fullName: true } },
  risk: { select: { riskNo: true } },
  rounds: { orderBy: { revision: 'desc' as const }, take: 1, select: { submittedOn: true, code: true } },
  comments: { select: { reply: true, closedOn: true } },
  _count: { select: { docs: true } },
} satisfies Prisma.DesignSubmissionInclude;
type ListRow = Prisma.DesignSubmissionGetPayload<{ include: typeof listInclude }>;

const detailInclude = {
  ...listInclude,
  attachments: true,
  docs: { orderBy: { sortOrder: 'asc' as const }, include: { document: { select: { id: true, docNo: true, title: true, discipline: true, currentRevision: { select: { id: true, revision: true, status: true } } } } } },
  rounds: {
    orderBy: { revision: 'desc' as const },
    include: {
      submittedBy: { select: { fullName: true } },
      letter: { select: { letterNo: true } },
      items: { include: { revision: { select: { revision: true, document: { select: { id: true, docNo: true } } } } } },
    },
  },
  comments: { orderBy: { commentNo: 'asc' as const }, include: { document: { select: { docNo: true } }, repliedBy: { select: { fullName: true } } } },
} satisfies Prisma.DesignSubmissionInclude;
type DetailRow = Prisma.DesignSubmissionGetPayload<{ include: typeof detailInclude }>;

const daysFrom = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
const plusDays = (day: string, n: number) => {
  const d = parseDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dateOnly(d);
};

/**
 * Design submissions (ARCHITECTURE "Design and drawings"): drawings or a design report sent for approval
 * or vetting, round by round, each coming back with a code and comments that we answer before resubmitting. A round's
 * covering letter is drafted through `CorrespondenceService.create`; a code moves the register's revisions sent for
 * approval through `DocumentsService.updateRevision` and the EPC deliverables through `EpcService.followDesignRound`; a
 * late review by the client's side is recorded as a delay through `RisksService.create`.
 */
@Injectable()
export class DesignSubmissionsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private letters: CorrespondenceService,
    private documents: DocumentsService,
    private risks: RisksService,
    private epc: EpcService,
  ) {}

  private assertView(user: RequestUser) {
    if (isGuest(user.roleKey)) throw new ForbiddenException('Design submissions are for the company’s own staff');
  }

  private toDto(r: ListRow, today: string): DesignSubmissionDto {
    const status = r.status as DesignSubmissionStatus;
    const last = r.rounds[0];
    const submittedOn = last ? dateOnly(last.submittedOn) : null;
    const replyBy = dateOnly(r.replyBy);
    return {
      id: r.id,
      submissionNo: r.submissionNo,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      title: r.title,
      kind: r.kind as DesignSubmissionKind,
      purpose: r.purpose as DesignPurpose,
      toParty: r.toParty,
      source: r.source as DrawingSource,
      replyBy,
      status,
      revision: r.revision,
      submittedOn,
      lastCode: (last?.code ?? null) as DesignCode | null,
      daysOutstanding: designDaysOutstanding(status, submittedOn, today),
      daysLate: reviewDaysLate(status, replyBy, today),
      documents: r._count.docs,
      openComments: r.comments.filter((c) => commentState({ reply: c.reply, closedOn: dateOnly(c.closedOn) }) === 'OPEN').length,
      riskId: r.riskId,
      riskNo: r.risk?.riskNo ?? null,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
    };
  }

  private detail(user: RequestUser, r: DetailRow, today: string): DesignSubmissionDetailDto {
    const base = this.toDto(r as unknown as ListRow, today);
    const may = canManageDocuments(user.roleKey);
    const comments: DesignCommentDto[] = r.comments.map((c) => ({
      id: c.id,
      commentNo: c.commentNo,
      round: c.round,
      documentId: c.documentId,
      docNo: c.document?.docNo ?? null,
      text: c.text,
      reply: c.reply,
      repliedOn: dateOnly(c.repliedOn),
      repliedByName: c.repliedBy?.fullName ?? null,
      closedOn: dateOnly(c.closedOn),
      state: commentState({ reply: c.reply, closedOn: dateOnly(c.closedOn) }),
    }));
    const s = base.status;
    return {
      ...base,
      note: r.note,
      fee: r.fee === null ? null : money(r.fee),
      certificateNo: r.certificateNo,
      docs: r.docs.map((d) => ({
        documentId: d.document.id,
        docNo: d.document.docNo,
        title: d.document.title,
        discipline: d.document.discipline as DocumentDiscipline,
        revision: d.document.currentRevision?.revision ?? null,
        revisionStatus: (d.document.currentRevision?.status ?? null) as RevisionStatus | null,
      })),
      rounds: r.rounds.map((x) => {
        const submittedOn = dateOnly(x.submittedOn);
        const reviewedOn = dateOnly(x.reviewedOn);
        return {
          id: x.id,
          revision: x.revision,
          submittedOn,
          submittedByName: x.submittedBy.fullName,
          submitNote: x.submitNote,
          sent: x.items.map((i) => ({ documentId: i.revision.document.id, docNo: i.revision.document.docNo, revision: i.revision.revision })).sort((a, b) => a.docNo.localeCompare(b.docNo)),
          letterId: x.letterId,
          letterNo: x.letter?.letterNo ?? null,
          code: (x.code ?? null) as DesignCode | null,
          reviewedOn,
          reviewerName: x.reviewerName,
          reviewRef: x.reviewRef,
          days: daysFrom(submittedOn, reviewedOn ?? today),
        };
      }),
      comments,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      canEdit: may && s === 'DRAFT',
      canSubmit: may && (s === 'DRAFT' || s === 'REVISE_RESUBMIT' || s === 'REJECTED'),
      canRecord: may && s === 'UNDER_REVIEW',
      canReply: may && comments.some((c) => c.state !== 'CLOSED'),
      canWithdraw: may && s !== 'WITHDRAWN' && !isDesignApproved(s),
      canRecordDelay: may && !r.riskId && base.daysLate !== null && isClientSide(r.source as DrawingSource),
    };
  }

  async list(user: RequestUser, q: DesignSubmissionsQuery): Promise<DesignSubmissionListDto> {
    this.assertView(user);
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const today = todayIn();
    const words = searchWords(q.q);
    const where: Prisma.DesignSubmissionWhereInput = {
      ...this.access.submissionWhere(user),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.purpose ? { purpose: q.purpose } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      AND: words.map((w) => ({ OR: [{ submissionNo: ilike(w) }, { title: ilike(w) }, { toParty: ilike(w) }, { docs: { some: { document: { OR: [{ docNo: ilike(w) }, { title: ilike(w) }] } } } }] })),
    };
    const rows = (await this.prisma.designSubmission.findMany({ where, include: listInclude, orderBy: [{ updatedAt: 'desc' }], take: 2000 })).map((r) => this.toDto(r, today));
    const reviews = await this.prisma.designSubmissionRound.findMany({
      where: { submission: where, reviewedOn: { gte: parseDate(plusDays(today, -90)) } },
      select: { submittedOn: true, reviewedOn: true },
    });
    const summary = designSummary(
      rows.map((r) => ({ status: r.status, late: r.daysLate !== null, openComments: r.openComments })),
      reviews.map((r) => ({ submittedOn: dateOnly(r.submittedOn), reviewedOn: dateOnly(r.reviewedOn)! })),
    );
    const f = q.status;
    const shown = rows
      .filter((r) => !f || (f === 'LATE' ? r.daysLate !== null : f === 'WITH_US' ? r.status === 'REVISE_RESUBMIT' || r.status === 'REJECTED' : r.status === f))
      .filter((r) => !q.toAnswer || r.openComments > 0)
      // Late first, then what waits on us, then the rest by how long they have waited.
      .sort((a, b) => (b.daysLate ?? -1) - (a.daysLate ?? -1) || b.openComments - a.openComments || (b.daysOutstanding ?? -1) - (a.daysOutstanding ?? -1));
    const args = pageArgs(q);
    return { items: shown.slice(args.skip, args.skip + args.take), total: shown.length, summary };
  }

  /** Reviews by the client's side past their reply-by date, for the watch list. */
  async lateReviews(user: RequestUser) {
    const today = todayIn();
    const rows = await this.prisma.designSubmission.findMany({
      where: { ...this.access.submissionWhere(user), status: 'UNDER_REVIEW', replyBy: { lt: parseDate(today) } },
      include: listInclude,
      take: 500,
    });
    return rows.map((r) => this.toDto(r, today)).filter((r) => r.daysLate !== null);
  }

  private async row(user: RequestUser, id: string) {
    const row = await this.prisma.designSubmission.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: detailInclude });
    if (!row) throw new NotFoundException('Design submission not found');
    return row;
  }

  async get(user: RequestUser, id: string): Promise<DesignSubmissionDetailDto> {
    this.assertView(user);
    return this.detail(user, await this.row(user, id), todayIn());
  }

  private async checkDocs(projectId: string, documentIds: string[]) {
    const ids = [...new Set(documentIds)];
    if (ids.length !== documentIds.length) throw new BadRequestException('A document is listed twice');
    if (ids.length && (await this.prisma.document.count({ where: { id: { in: ids }, projectId } })) !== ids.length) throw new BadRequestException('Choose documents of this project from the register');
  }

  async create(user: RequestUser, dto: SaveDesignSubmissionDto): Promise<DesignSubmissionDetailDto> {
    if (dto.id) {
      const existing = await this.prisma.designSubmission.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.get(user, existing.id);
    }
    await this.access.assertCanManageDocuments(user, dto.projectId);
    await this.checkDocs(dto.projectId, dto.documentIds);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const submissionNo = await nextDocNo(tx, user.organizationId, 'DSN', async (prefix) =>
          (await tx.designSubmission.findFirst({ where: { organizationId: user.organizationId, submissionNo: { startsWith: prefix } }, orderBy: { submissionNo: 'desc' }, select: { submissionNo: true } }))?.submissionNo ?? null,
        );
        const purpose = dto.purpose ?? 'APPROVAL';
        const row = await tx.designSubmission.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            submissionNo,
            title: dto.title,
            kind: dto.kind ?? 'DRAWINGS',
            purpose,
            toParty: dto.toParty,
            // An institution vetting the design is outside the contract: never the client's delay.
            source: purpose === 'VETTING' ? 'DESIGN_CONSULTANT' : (dto.source ?? 'CLIENT'),
            note: dto.note ?? null,
            fee: purpose === 'VETTING' && dto.fee ? new Prisma.Decimal(dto.fee) : null,
            createdById: user.id,
            docs: { create: dto.documentIds.map((documentId, i) => ({ documentId, sortOrder: i })) },
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) return this.get(user, dto.id);
      throw e;
    }
    await this.attachments.link(user, 'designSubmissionId', id, dto.attachmentIds);
    const out = await this.get(user, id);
    await this.audit.log(user, 'DESIGN_SUBMISSION', id, 'CREATED', `${out.submissionNo} ${out.title}`);
    return out;
  }

  /** Change the package. Its documents change only before it first goes; the fee and files any time. */
  async update(user: RequestUser, id: string, dto: SaveDesignSubmissionDto): Promise<DesignSubmissionDetailDto> {
    const row = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    if (dto.projectId !== row.projectId) throw new BadRequestException('A submission stays on its project');
    const sent = row.rounds.length > 0;
    const docsChanged = row.docs.map((d) => d.documentId).join() !== dto.documentIds.join();
    if (sent && docsChanged && row.status !== 'REVISE_RESUBMIT' && row.status !== 'REJECTED') throw new BadRequestException('The drawings change only while it is a draft or back with us');
    await this.checkDocs(row.projectId, dto.documentIds);
    const purpose = sent ? (row.purpose as DesignPurpose) : (dto.purpose ?? 'APPROVAL');
    await this.prisma.$transaction(async (tx) => {
      await tx.designSubmission.update({
        where: { id },
        data: {
          title: dto.title,
          kind: dto.kind ?? row.kind,
          purpose,
          toParty: dto.toParty,
          source: purpose === 'VETTING' ? 'DESIGN_CONSULTANT' : (dto.source ?? row.source),
          note: dto.note ?? null,
          fee: purpose === 'VETTING' && dto.fee ? new Prisma.Decimal(dto.fee) : null,
        },
      });
      if (docsChanged) {
        await tx.designSubmissionDoc.deleteMany({ where: { submissionId: id } });
        await tx.designSubmissionDoc.createMany({ data: dto.documentIds.map((documentId, i) => ({ submissionId: id, documentId, sortOrder: i })) });
      }
    });
    await this.attachments.sync(user, 'designSubmissionId', id, dto.attachmentIds);
    await this.audit.log(user, 'DESIGN_SUBMISSION', id, 'UPDATED');
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    if (row.rounds.length) throw new BadRequestException('This submission has gone to the reviewer and stays on record; withdraw it instead');
    await this.prisma.designSubmission.delete({ where: { id } });
    await this.audit.log(user, 'DESIGN_SUBMISSION', id, 'DELETED', row.submissionNo);
    return { ok: true };
  }

  /** Send the package (again): a new round of the register's current revisions, and its covering letter when asked. */
  async submit(user: RequestUser, id: string, dto: SubmitDesignDto): Promise<DesignSubmissionDetailDto> {
    const row = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    const today = todayIn();
    const me = this.detail(user, row, today);
    const last = row.rounds[0];
    const replyBy = dto.replyBy ?? replyByFor(dto.submittedOn);
    const problem = designSubmitProblem(me.status, {
      submittedOn: dto.submittedOn,
      today,
      documents: row.docs.length,
      lastReviewedOn: last ? dateOnly(last.reviewedOn) : null,
      replyBy,
      openComments: me.comments.filter((c) => c.state === 'OPEN').length,
    });
    if (problem) throw new BadRequestException(problem);
    const missing = row.docs.filter((d) => !d.document.currentRevision).map((d) => d.document.docNo);
    if (missing.length) throw new BadRequestException(`Add a revision to ${missing.join(', ')} in the register first`);
    const revision = last ? row.revision + 1 : 0;
    const sent = row.docs.map((d) => ({ documentId: d.document.id, docNo: d.document.docNo, title: d.document.title, revisionId: d.document.currentRevision!.id, revision: d.document.currentRevision!.revision }));
    if (last) {
      const before = new Set(last.items.map((i) => `${i.revision.document.id}:${i.revision.revision}`));
      if (sent.every((d) => before.has(`${d.documentId}:${d.revision}`))) throw new BadRequestException('Every drawing is at the revision sent last time; add the revised ones to the register first');
    }
    let letterId: string | null = null;
    if (dto.letter) {
      const { subject, body } = coveringLetter(
        { projectName: row.project.name, title: row.title, purpose: row.purpose as DesignPurpose, submissionNo: row.submissionNo },
        revision,
        sent,
        replyBy,
        me.comments.filter((c) => c.state === 'ANSWERED').length,
        (d) => titleDate(parseDate(d)),
      );
      const letter = await this.letters.create(user, {
        projectId: row.projectId,
        direction: 'OUT',
        letterDate: dto.submittedOn,
        party: row.toParty,
        subject: subject.slice(0, 300),
        body,
        category: masterCode('Drawing and design'),
        replyBy,
        riskId: row.riskId,
      });
      letterId = letter.id;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.designSubmissionRound.create({
        data: {
          organizationId: user.organizationId,
          submissionId: id,
          revision,
          submittedOn: parseDate(dto.submittedOn),
          submittedById: user.id,
          submitNote: dto.note ?? null,
          letterId,
          items: { create: sent.map((d) => ({ revisionId: d.revisionId })) },
        },
      });
      await tx.designSubmission.update({ where: { id }, data: { status: 'UNDER_REVIEW', revision, replyBy: parseDate(replyBy) } });
    });
    if (row.purpose === 'APPROVAL') await this.epc.followDesignRound(user, row.projectId, sent, { submittedOn: dto.submittedOn, code: null, reviewedOn: null });
    await this.audit.log(user, 'DESIGN_SUBMISSION', id, 'SUBMITTED', `R${revision} to ${row.toParty}`);
    return this.get(user, id);
  }

  /** The code it came back with and the reviewer's comments; the register and the deliverables follow an approval. */
  async recordCode(user: RequestUser, id: string, dto: RecordDesignCodeDto): Promise<DesignSubmissionDetailDto> {
    const row = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    const today = todayIn();
    const round = row.rounds[0];
    if (!round) throw new BadRequestException('Only a submission under review gets a code');
    const problem = designCodeProblem(row.status as DesignSubmissionStatus, { code: dto.code, reviewedOn: dto.reviewedOn, submittedOn: dateOnly(round.submittedOn), newComments: dto.comments.length, today });
    if (problem) throw new BadRequestException(problem);
    const docIds = new Set(row.docs.map((d) => d.documentId));
    if (dto.comments.some((c) => c.documentId && !docIds.has(c.documentId))) throw new BadRequestException('A comment is on a drawing this submission does not send');
    const purpose = row.purpose as DesignPurpose;
    const closing = commentsClosedBy(
      dto.code,
      row.comments.map((c) => ({ id: c.id, reply: c.reply, closedOn: dateOnly(c.closedOn) })),
    );
    const startNo = row.comments.reduce((m, c) => Math.max(m, c.commentNo), 0);
    await this.prisma.$transaction(async (tx) => {
      await tx.designSubmissionRound.update({ where: { id: round.id }, data: { code: dto.code, reviewedOn: parseDate(dto.reviewedOn), reviewerName: dto.reviewerName ?? null, reviewRef: dto.reviewRef ?? null } });
      await tx.designSubmission.update({
        where: { id },
        data: { status: statusForCode(dto.code), ...(purpose === 'VETTING' && (dto.code === 'A' || dto.code === 'B') ? { certificateNo: dto.certificateNo ?? null } : {}) },
      });
      if (closing.length) await tx.designComment.updateMany({ where: { id: { in: closing } }, data: { closedOn: parseDate(dto.reviewedOn) } });
      if (dto.comments.length)
        await tx.designComment.createMany({
          data: dto.comments.map((c, i) => ({ organizationId: user.organizationId, submissionId: id, commentNo: startNo + i + 1, round: round.revision, documentId: c.documentId ?? null, text: c.text })),
        });
    });
    // The register's revisions sent for approval take the code, through the register's own change.
    const sent = round.items.map((i) => ({ documentId: i.revision.document.id, revision: i.revision.revision, revisionId: i.revisionId }));
    const current = await this.prisma.documentRevision.findMany({ where: { id: { in: sent.map((s) => s.revisionId) } }, select: { id: true, documentId: true, status: true } });
    for (const r of current) {
      const next = revisionStatusAfter(dto.code, purpose, r.status as RevisionStatus);
      if (next) await this.documents.updateRevision(user, r.documentId, r.id, { status: next });
    }
    if (purpose === 'APPROVAL') await this.epc.followDesignRound(user, row.projectId, sent, { submittedOn: dateOnly(round.submittedOn), code: dto.code, reviewedOn: dto.reviewedOn });
    await this.audit.log(user, 'DESIGN_SUBMISSION', id, 'REVIEWED', `R${round.revision} code ${dto.code}${dto.comments.length ? `, ${dto.comments.length} comments` : ''}`);
    return this.get(user, id);
  }

  private async comment(user: RequestUser, id: string, commentId: string) {
    const row = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    const c = row.comments.find((x) => x.id === commentId);
    if (!c) throw new NotFoundException('Comment not found');
    return { row, c };
  }

  /** Our reply to a comment: what was changed, or why not. Kept until it is closed. */
  async reply(user: RequestUser, id: string, commentId: string, dto: ReplyCommentDto): Promise<DesignSubmissionDetailDto> {
    const { c } = await this.comment(user, id, commentId);
    if (c.closedOn) throw new BadRequestException('This comment is closed');
    await this.prisma.designComment.update({ where: { id: c.id }, data: { reply: dto.reply, repliedOn: parseDate(todayIn()), repliedById: user.id } });
    await this.audit.log(user, 'DESIGN_SUBMISSION', id, 'COMMENT_REPLIED', `Comment ${c.commentNo}`);
    return this.get(user, id);
  }

  /** The reviewer accepts the reply (closed), or a closed one is opened again. */
  async setClosed(user: RequestUser, id: string, commentId: string, closed: boolean): Promise<DesignSubmissionDetailDto> {
    const { c } = await this.comment(user, id, commentId);
    if (closed && !c.reply?.trim()) throw new BadRequestException('Reply to the comment before closing it');
    await this.prisma.designComment.update({ where: { id: c.id }, data: { closedOn: closed ? parseDate(todayIn()) : null } });
    await this.audit.log(user, 'DESIGN_SUBMISSION', id, closed ? 'COMMENT_CLOSED' : 'COMMENT_REOPENED', `Comment ${c.commentNo}`);
    return this.get(user, id);
  }

  async withdraw(user: RequestUser, id: string, dto: WithdrawDesignDto): Promise<DesignSubmissionDetailDto> {
    const row = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    const s = row.status as DesignSubmissionStatus;
    if (s === 'WITHDRAWN' || isDesignApproved(s)) throw new BadRequestException('Only a submission not yet approved can be withdrawn');
    await this.prisma.designSubmission.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    await this.audit.log(user, 'DESIGN_SUBMISSION', id, 'WITHDRAWN', dto.note);
    return this.get(user, id);
  }

  /** A review by the client's side past its reply-by date, as a delay (design, the client's) from the day after. */
  async recordDelay(user: RequestUser, id: string): Promise<DesignSubmissionDetailDto> {
    const row = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, row.projectId);
    const me = this.detail(user, row, todayIn());
    if (row.riskId) throw new BadRequestException(`Already recorded as delay ${me.riskNo}`);
    if (!isClientSide(row.source as DrawingSource)) throw new BadRequestException('Only a review by the client’s side is the client’s delay');
    if (me.daysLate === null || !me.replyBy) throw new BadRequestException('The review is not late yet');
    const risk = await this.risks.create(user, {
      projectId: row.projectId,
      kind: 'DELAY',
      category: 'DESIGN',
      title: `Design approval awaited: ${row.title}`.slice(0, 200),
      description: `${row.submissionNo} R${row.revision} (${DESIGN_PURPOSE_LABELS[me.purpose].toLowerCase()}) went to ${row.toParty} on ${titleDate(parseDate(me.submittedOn!))}; the reply was asked by ${titleDate(parseDate(me.replyBy))}. Sent: ${me.docs.map((d) => `${d.docNo} ${d.revision ?? ''}`.trim()).join(', ')}.`,
      impact: 3,
      delayStart: plusDays(me.replyBy, 1),
      responsibleParty: 'CLIENT',
    });
    await this.prisma.designSubmission.update({ where: { id }, data: { riskId: risk.id } });
    return this.get(user, id);
  }
}

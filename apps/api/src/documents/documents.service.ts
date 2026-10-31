import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  REVISION_STATUS_LABELS,
  canApprove,
  canViewLetters,
  type DocumentDetailDto,
  type DocumentDto,
  type DocumentRevisionDto,
  type DocumentSortField,
  type DocumentSummaryDto,
  type Paginated,
  type RevisionStatus,
  type SortOrder,
  type TransmittalDto,
  type TransmittalSortField,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentTextService } from './document-text.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { todayIn } from '../notifications/time';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import {
  AcknowledgeTransmittalDto,
  CreateDocumentDto,
  CreateRevisionDto,
  CreateTransmittalDto,
  ListDocumentsQuery,
  ListTransmittalsQuery,
  UpdateDocumentDto,
  UpdateRevisionDto,
  UpdateTransmittalDto,
} from './documents.dto';

const revisionInclude = {
  issuedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.DocumentRevisionInclude;
type RevisionRow = Prisma.DocumentRevisionGetPayload<{ include: typeof revisionInclude }>;

const documentInclude = {
  project: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  currentRevision: { include: revisionInclude },
  _count: { select: { revisions: true, markups: { where: { status: 'OPEN' } } } },
} satisfies Prisma.DocumentInclude;
type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

const transmittalInclude = {
  project: { select: { name: true, code: true } },
  sentBy: { select: { fullName: true } },
  items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { revision: { select: { revision: true, status: true, documentId: true, document: { select: { docNo: true, title: true } } } } } },
} satisfies Prisma.TransmittalInclude;
type TransmittalRow = Prisma.TransmittalGetPayload<{ include: typeof transmittalInclude }>;


const DOCUMENT_ORDER: Record<DocumentSortField, (o: SortOrder) => Prisma.DocumentOrderByWithRelationInput[]> = {
  docNo: (o) => [{ docNo: o }],
  title: (o) => [{ title: o }],
  kind: (o) => [{ kind: o }, { docNo: 'asc' }],
  discipline: (o) => [{ discipline: o }, { docNo: 'asc' }],
  issuedOn: (o) => [{ currentRevision: { issuedOn: o } }, { docNo: 'asc' }],
  status: (o) => [{ currentRevision: { status: o } }, { docNo: 'asc' }],
  project: (o) => [{ project: { name: o } }, { docNo: 'asc' }],
  updatedAt: (o) => [{ updatedAt: o }],
};
const TRANSMITTAL_ORDER: Record<TransmittalSortField, (o: SortOrder) => Prisma.TransmittalOrderByWithRelationInput[]> = {
  sentOn: (o) => [{ sentOn: o }, { transmittalNo: o }],
  transmittalNo: (o) => [{ transmittalNo: o }],
  toParty: (o) => [{ toParty: o }, { sentOn: 'desc' }],
  project: (o) => [{ project: { name: o } }, { sentOn: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['issuedOn', 'updatedAt', 'sentOn', 'transmittalNo', 'letterDate', 'letterNo', 'createdAt']);
const order = (sortBy: string, o: SortOrder | undefined): SortOrder => o ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');

/** Letters received that we owe a reply to (Correspondence, item 136, keeps the registers). */
const LETTERS_AWAITING = { direction: 'IN', status: 'OPEN', replyBy: { not: null }, replies: { none: { direction: 'OUT', status: 'ISSUED' } } } satisfies Prisma.LetterWhereInput;

/** Revisions in force order: the latest issued first (the one added last wins a tie). */
const REVISION_ORDER: Prisma.DocumentRevisionOrderByWithRelationInput[] = [{ issuedOn: 'desc' }, { createdAt: 'desc' }];

/**
 * Document register: drawings and documents with their revisions (files on each revision), transmittals that send
 * revisions to someone. Anyone on a project reads the register; document control roles change it. Letters are
 * Correspondence's (item 136, `CorrespondenceService`).
 * The current revision is the latest issued and is kept on `Document.currentRevisionId`.
 */
@Injectable()
export class DocumentsService {
  private readonly log = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
    private text: DocumentTextService,
  ) {}

  /** Reads newly filed PDFs of the project into searchable pages (Ask the contract), so they can be asked about at once. */
  private async readFiles(user: RequestUser, projectId: string) {
    await this.text.readPending(user.organizationId, [projectId], 3, 15_000).catch((e: Error) => this.log.warn(`reading files: ${e.message}`));
  }

  /* ---------- documents ---------- */

  private toRevisionDto(r: RevisionRow, currentId: string | null, transmittals: DocumentRevisionDto['transmittals'] = []): DocumentRevisionDto {
    return {
      id: r.id,
      documentId: r.documentId,
      revision: r.revision,
      issuedOn: dateOnly(r.issuedOn),
      status: r.status,
      receivedFrom: r.receivedFrom,
      remarks: r.remarks,
      issuedById: r.issuedById,
      issuedByName: r.issuedBy.fullName,
      current: r.id === currentId,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      transmittals,
      createdAt: iso(r.createdAt),
    };
  }

  private toDocumentDto(d: DocumentRow): DocumentDto {
    return {
      id: d.id,
      projectId: d.projectId,
      projectName: d.project.name,
      docNo: d.docNo,
      title: d.title,
      kind: d.kind,
      discipline: d.discipline,
      remarks: d.remarks,
      current: d.currentRevision ? this.toRevisionDto(d.currentRevision, d.currentRevisionId) : null,
      revisionCount: d._count.revisions,
      openMarkups: d._count.markups,
      createdById: d.createdById,
      createdByName: d.createdBy.fullName,
      createdAt: iso(d.createdAt),
      updatedAt: iso(d.updatedAt),
    };
  }

  private documentWhere(user: RequestUser, q: Pick<ListDocumentsQuery, 'projectId' | 'kind' | 'discipline' | 'status' | 'q'>): Prisma.DocumentWhereInput {
    const where: Prisma.DocumentWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.kind) where.kind = q.kind;
    if (q.discipline) where.discipline = q.discipline;
    if (q.status) where.currentRevision = { status: q.status };
    const and = searchWords(q.q).map((w) => ({ OR: [{ docNo: ilike(w) }, { title: ilike(w) }, { remarks: ilike(w) }, { project: { name: ilike(w) } }] }));
    if (and.length) where.AND = and;
    return where;
  }

  async listDocuments(user: RequestUser, q: ListDocumentsQuery): Promise<Paginated<DocumentDto>> {
    const where = this.documentWhere(user, q);
    const sortBy = q.sortBy ?? 'docNo';
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({ where, include: documentInclude, orderBy: [...DOCUMENT_ORDER[sortBy](order(sortBy, q.sortOrder)), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.document.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDocumentDto(r)), total, args);
  }

  /** Every document of a project with its current revision and files: what the site app keeps offline. */
  async siteDocuments(user: RequestUser, projectId: string): Promise<DocumentDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.document.findMany({
      where: { projectId, organizationId: user.organizationId, currentRevisionId: { not: null } },
      include: documentInclude,
      orderBy: [{ discipline: 'asc' }, { docNo: 'asc' }],
    });
    return rows.map((r) => this.toDocumentDto(r));
  }

  async getDocument(user: RequestUser, id: string): Promise<DocumentDetailDto> {
    const row = await this.prisma.document.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: documentInclude });
    if (!row) throw new NotFoundException('Document not found');
    const revisions = await this.prisma.documentRevision.findMany({
      where: { documentId: id },
      include: { ...revisionInclude, transmittals: { include: { transmittal: { select: { id: true, transmittalNo: true, toParty: true, sentOn: true } } } } },
      orderBy: REVISION_ORDER,
    });
    return {
      ...this.toDocumentDto(row),
      revisions: revisions.map((r) =>
        this.toRevisionDto(
          r,
          row.currentRevisionId,
          r.transmittals.map((t) => ({ id: t.transmittal.id, transmittalNo: t.transmittal.transmittalNo, toParty: t.transmittal.toParty, sentOn: dateOnly(t.transmittal.sentOn) })),
        ),
      ),
    };
  }

  private async loadDocument(user: RequestUser, id: string) {
    const row = await this.prisma.document.findFirst({ where: { id, ...this.access.submissionWhere(user) } });
    if (!row) throw new NotFoundException('Document not found');
    return row;
  }

  private checkIssuedOn(issuedOn: string) {
    if (issuedOn > todayIn()) throw new BadRequestException('The issue date cannot be in the future');
  }

  private duplicate(e: unknown, what: string): never {
    if (isUniqueViolation(e)) throw new BadRequestException(what);
    throw e;
  }

  /** Point the document at its latest issued revision. */
  private async refreshCurrent(tx: Prisma.TransactionClient, documentId: string) {
    const latest = await tx.documentRevision.findFirst({ where: { documentId }, orderBy: REVISION_ORDER, select: { id: true } });
    await tx.document.update({ where: { id: documentId }, data: { currentRevisionId: latest?.id ?? null, updatedAt: new Date() } });
    return latest?.id ?? null;
  }

  async createDocument(user: RequestUser, dto: CreateDocumentDto): Promise<DocumentDetailDto> {
    await this.access.assertCanManageDocuments(user, dto.projectId);
    if (dto.revision) this.checkIssuedOn(dto.revision.issuedOn);
    let created: { id: string; revisionId: string | null };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            organizationId: user.organizationId,
            projectId: dto.projectId,
            docNo: dto.docNo,
            title: dto.title,
            kind: dto.kind ?? 'DRAWING',
            discipline: dto.discipline ?? 'GENERAL',
            remarks: dto.remarks || null,
            createdById: user.id,
          },
          select: { id: true },
        });
        if (!dto.revision) return { id: doc.id, revisionId: null };
        const rev = await tx.documentRevision.create({ data: this.revisionData(user, doc.id, dto.revision), select: { id: true } });
        await tx.document.update({ where: { id: doc.id }, data: { currentRevisionId: rev.id } });
        return { id: doc.id, revisionId: rev.id };
      });
    } catch (e) {
      this.duplicate(e, `Document ${dto.docNo} is already in this project's register`);
    }
    if (created.revisionId) await this.attachments.link(user, 'revisionId', created.revisionId, dto.revision?.attachmentIds);
    if (dto.revision?.attachmentIds?.length) await this.readFiles(user, dto.projectId);
    await this.audit.log(user, 'DOCUMENT', created.id, 'CREATED', dto.revision ? `Rev ${dto.revision.revision} ${REVISION_STATUS_LABELS[dto.revision.status]}` : null);
    const doc = await this.getDocument(user, created.id);
    if (doc.current) await this.notifyIssued(user, doc, doc.current);
    return doc;
  }

  async updateDocument(user: RequestUser, id: string, dto: UpdateDocumentDto): Promise<DocumentDetailDto> {
    const cur = await this.loadDocument(user, id);
    await this.access.assertCanManageDocuments(user, cur.projectId);
    const data: Prisma.DocumentUncheckedUpdateInput = {};
    if (dto.docNo !== undefined) data.docNo = dto.docNo;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.discipline !== undefined) data.discipline = dto.discipline;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    try {
      await this.prisma.document.update({ where: { id }, data });
    } catch (e) {
      this.duplicate(e, `Document ${dto.docNo} is already in this project's register`);
    }
    await this.audit.log(user, 'DOCUMENT', id, 'UPDATED');
    return this.getDocument(user, id);
  }

  /** Only a document none of whose revisions went out on a transmittal (else withdraw it with a new revision). */
  async removeDocument(user: RequestUser, id: string) {
    const cur = await this.loadDocument(user, id);
    await this.access.assertCanManageDocuments(user, cur.projectId);
    if (await this.prisma.transmittalItem.count({ where: { revision: { documentId: id } } }))
      throw new BadRequestException('This document was sent on a transmittal; add a revision marked Withdrawn instead of deleting it');
    if (await this.prisma.designRoundItem.count({ where: { revision: { documentId: id } } }))
      throw new BadRequestException('This document was sent in a design submission; add a revision marked Withdrawn instead of deleting it');
    if (await this.prisma.controlledCopy.count({ where: { documentId: id } }))
      throw new BadRequestException('Controlled copies of this document were issued; add a revision marked Withdrawn instead of deleting it');
    await this.prisma.document.delete({ where: { id } });
    await this.audit.log(user, 'DOCUMENT', id, 'DELETED', cur.docNo);
    return { ok: true };
  }

  private revisionData(user: RequestUser, documentId: string, dto: CreateRevisionDto): Prisma.DocumentRevisionUncheckedCreateInput {
    return {
      documentId,
      revision: dto.revision,
      issuedOn: parseDate(dto.issuedOn),
      status: dto.status,
      receivedFrom: dto.receivedFrom || null,
      remarks: dto.remarks || null,
      issuedById: user.id,
    };
  }

  /** A new revision supersedes the current one when it is issued on or after it. */
  async addRevision(user: RequestUser, id: string, dto: CreateRevisionDto): Promise<DocumentDetailDto> {
    const cur = await this.loadDocument(user, id);
    await this.access.assertCanManageDocuments(user, cur.projectId);
    this.checkIssuedOn(dto.issuedOn);
    let revisionId: string;
    let currentId: string | null;
    try {
      ({ revisionId, currentId } = await this.prisma.$transaction(async (tx) => {
        const rev = await tx.documentRevision.create({ data: this.revisionData(user, id, dto), select: { id: true } });
        return { revisionId: rev.id, currentId: await this.refreshCurrent(tx, id) };
      }));
    } catch (e) {
      this.duplicate(e, `Revision ${dto.revision} of ${cur.docNo} is already recorded`);
    }
    await this.attachments.link(user, 'revisionId', revisionId, dto.attachmentIds);
    await this.readFiles(user, cur.projectId);
    await this.audit.log(user, 'DOCUMENT', id, 'REVISION_ADDED', `Rev ${dto.revision} ${REVISION_STATUS_LABELS[dto.status]}`);
    const doc = await this.getDocument(user, id);
    if (currentId === revisionId && doc.current) await this.notifyIssued(user, doc, doc.current);
    return doc;
  }

  private async loadRevision(user: RequestUser, id: string, revisionId: string) {
    const doc = await this.loadDocument(user, id);
    await this.access.assertCanManageDocuments(user, doc.projectId);
    const rev = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, documentId: id } });
    if (!rev) throw new NotFoundException('Revision not found on this document');
    return { doc, rev };
  }

  /** Correct a revision or record the consultant's decision on it (for approval → approved / rejected). */
  async updateRevision(user: RequestUser, id: string, revisionId: string, dto: UpdateRevisionDto): Promise<DocumentDetailDto> {
    const { doc, rev } = await this.loadRevision(user, id, revisionId);
    if (dto.issuedOn) this.checkIssuedOn(dto.issuedOn);
    const data: Prisma.DocumentRevisionUncheckedUpdateInput = {};
    if (dto.revision !== undefined) data.revision = dto.revision;
    if (dto.issuedOn !== undefined) data.issuedOn = parseDate(dto.issuedOn);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.receivedFrom !== undefined) data.receivedFrom = dto.receivedFrom || null;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    let currentId: string | null;
    try {
      currentId = await this.prisma.$transaction(async (tx) => {
        await tx.documentRevision.update({ where: { id: revisionId }, data });
        return this.refreshCurrent(tx, id);
      });
    } catch (e) {
      this.duplicate(e, `Revision ${dto.revision} of ${doc.docNo} is already recorded`);
    }
    await this.attachments.sync(user, 'revisionId', revisionId, dto.attachmentIds);
    await this.readFiles(user, doc.projectId);
    const statusChanged = dto.status !== undefined && dto.status !== rev.status;
    await this.audit.log(user, 'DOCUMENT', id, 'REVISION_UPDATED', `Rev ${dto.revision ?? rev.revision}${statusChanged ? ` ${REVISION_STATUS_LABELS[dto.status!]}` : ''}`);
    const updated = await this.getDocument(user, id);
    // Becoming good for construction (or becoming current) is an issue to site.
    if (currentId === revisionId && updated.current && (statusChanged || doc.currentRevisionId !== revisionId)) await this.notifyIssued(user, updated, updated.current);
    return updated;
  }

  async removeRevision(user: RequestUser, id: string, revisionId: string): Promise<DocumentDetailDto> {
    const { rev } = await this.loadRevision(user, id, revisionId);
    if (await this.prisma.transmittalItem.count({ where: { revisionId } })) throw new BadRequestException(`Revision ${rev.revision} was sent on a transmittal and stays on record`);
    if (await this.prisma.designRoundItem.count({ where: { revisionId } })) throw new BadRequestException(`Revision ${rev.revision} was sent in a design submission and stays on record`);
    if (await this.prisma.controlledCopy.count({ where: { revisionId } })) throw new BadRequestException(`Controlled copies of revision ${rev.revision} were issued, so it stays on record`);
    await this.prisma.$transaction(async (tx) => {
      await tx.document.updateMany({ where: { id, currentRevisionId: revisionId }, data: { currentRevisionId: null } });
      await tx.documentRevision.delete({ where: { id: revisionId } });
      await this.refreshCurrent(tx, id);
    });
    await this.audit.log(user, 'DOCUMENT', id, 'REVISION_DELETED', `Rev ${rev.revision}`);
    return this.getDocument(user, id);
  }

  async documentHistory(user: RequestUser, id: string) {
    await this.loadDocument(user, id);
    return this.audit.forEntity(user.organizationId, 'DOCUMENT', id);
  }

  /** A revision good for construction goes to everyone on the project, so site stops using the old one. */
  private async notifyIssued(user: RequestUser, d: DocumentDto, r: DocumentRevisionDto) {
    if (r.status !== 'FOR_CONSTRUCTION') return;
    try {
      const to = (await this.access.projectPeople(d.projectId)).filter((u) => u !== user.id);
      if (!to.length) return;
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: to,
        type: 'DOCUMENT_ISSUED',
        title: `${d.docNo} Rev ${r.revision} issued for construction`,
        body: `${d.title} at ${d.projectName}.${d.revisionCount > 1 ? ' Earlier revisions are superseded.' : ''}`,
        projectId: d.projectId,
        entityId: d.id,
        dedupeKey: `DOCUMENT_ISSUED:${r.id}`,
      });
    } catch (e) {
      this.log.warn(`Document notification failed: ${(e as Error).message}`);
    }
  }

  /* ---------- transmittals ---------- */

  private toTransmittalDto(t: TransmittalRow): TransmittalDto {
    return {
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      projectCode: t.project.code,
      transmittalNo: t.transmittalNo,
      toParty: t.toParty,
      attention: t.attention,
      purpose: t.purpose,
      sentOn: dateOnly(t.sentOn),
      remarks: t.remarks,
      acknowledgedOn: dateOnly(t.acknowledgedOn),
      acknowledgedBy: t.acknowledgedBy,
      sentById: t.sentById,
      sentByName: t.sentBy.fullName,
      items: t.items.map((i) => ({
        id: i.id,
        revisionId: i.revisionId,
        documentId: i.revision.documentId,
        docNo: i.revision.document.docNo,
        title: i.revision.document.title,
        revision: i.revision.revision,
        status: i.revision.status,
        copies: i.copies,
      })),
      createdAt: iso(t.createdAt),
      updatedAt: iso(t.updatedAt),
    };
  }

  async listTransmittals(user: RequestUser, q: ListTransmittalsQuery): Promise<Paginated<TransmittalDto>> {
    const where: Prisma.TransmittalWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.unacknowledged) where.acknowledgedOn = null;
    if (q.documentId) where.items = { some: { revision: { documentId: q.documentId } } };
    const and = searchWords(q.q).map((w) => ({
      OR: [{ transmittalNo: ilike(w) }, { toParty: ilike(w) }, { attention: ilike(w) }, { items: { some: { revision: { document: { OR: [{ docNo: ilike(w) }, { title: ilike(w) }] } } } } }],
    }));
    if (and.length) where.AND = and;
    const sortBy = q.sortBy ?? 'sentOn';
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.transmittal.findMany({ where, include: transmittalInclude, orderBy: [...TRANSMITTAL_ORDER[sortBy](order(sortBy, q.sortOrder)), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.transmittal.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toTransmittalDto(r)), total, args);
  }

  async getTransmittal(user: RequestUser, id: string): Promise<TransmittalDto> {
    const row = await this.prisma.transmittal.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: transmittalInclude });
    if (!row) throw new NotFoundException('Transmittal not found');
    return this.toTransmittalDto(row);
  }

  private async checkItems(projectId: string, items: { revisionId: string }[]) {
    const ids = items.map((i) => i.revisionId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A revision is listed twice');
    const found = await this.prisma.documentRevision.count({ where: { id: { in: ids }, document: { projectId } } });
    if (found !== ids.length) throw new NotFoundException('A revision listed is not in this project');
  }

  private checkSentOn(sentOn: string) {
    if (sentOn > todayIn()) throw new BadRequestException('The date sent cannot be in the future');
  }

  async createTransmittal(user: RequestUser, dto: CreateTransmittalDto): Promise<TransmittalDto> {
    await this.access.assertCanManageDocuments(user, dto.projectId);
    this.checkSentOn(dto.sentOn);
    await this.checkItems(dto.projectId, dto.items);
    const id = await this.prisma.$transaction(async (tx) => {
      const transmittalNo = await nextDocNo(tx, user.organizationId, 'TRN', async (prefix) =>
        (await tx.transmittal.findFirst({ where: { organizationId: user.organizationId, transmittalNo: { startsWith: prefix } }, orderBy: { transmittalNo: 'desc' }, select: { transmittalNo: true } }))?.transmittalNo ?? null,
      );
      const row = await tx.transmittal.create({
        data: {
          organizationId: user.organizationId,
          projectId: dto.projectId,
          transmittalNo,
          toParty: dto.toParty,
          attention: dto.attention || null,
          purpose: dto.purpose,
          sentOn: parseDate(dto.sentOn),
          remarks: dto.remarks || null,
          sentById: user.id,
          items: { create: dto.items.map((i, n) => ({ revisionId: i.revisionId, copies: i.copies ?? 1, sortOrder: n })) },
        },
        select: { id: true },
      });
      return row.id;
    });
    await this.audit.log(user, 'TRANSMITTAL', id, 'CREATED');
    return this.getTransmittal(user, id);
  }

  private async loadTransmittal(user: RequestUser, id: string) {
    const row = await this.prisma.transmittal.findFirst({ where: { id, ...this.access.submissionWhere(user) } });
    if (!row) throw new NotFoundException('Transmittal not found');
    await this.access.assertCanManageDocuments(user, row.projectId);
    return row;
  }

  async updateTransmittal(user: RequestUser, id: string, dto: UpdateTransmittalDto): Promise<TransmittalDto> {
    const cur = await this.loadTransmittal(user, id);
    if (cur.acknowledgedOn && dto.items) throw new BadRequestException('An acknowledged transmittal keeps its list of documents');
    if (dto.sentOn) this.checkSentOn(dto.sentOn);
    if (dto.items) await this.checkItems(cur.projectId, dto.items);
    const data: Prisma.TransmittalUncheckedUpdateInput = {};
    if (dto.toParty !== undefined) data.toParty = dto.toParty;
    if (dto.attention !== undefined) data.attention = dto.attention || null;
    if (dto.purpose !== undefined) data.purpose = dto.purpose;
    if (dto.sentOn !== undefined) data.sentOn = parseDate(dto.sentOn);
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.transmittal.update({ where: { id }, data });
      if (!dto.items) return;
      await tx.transmittalItem.deleteMany({ where: { transmittalId: id } });
      await tx.transmittalItem.createMany({ data: dto.items.map((i, n) => ({ transmittalId: id, revisionId: i.revisionId, copies: i.copies ?? 1, sortOrder: n })) });
    });
    await this.audit.log(user, 'TRANSMITTAL', id, 'UPDATED');
    return this.getTransmittal(user, id);
  }

  /** The receiver signed for it. */
  async acknowledgeTransmittal(user: RequestUser, id: string, dto: AcknowledgeTransmittalDto): Promise<TransmittalDto> {
    const cur = await this.loadTransmittal(user, id);
    if (dto.acknowledgedOn > todayIn()) throw new BadRequestException('The acknowledgement date cannot be in the future');
    if (dto.acknowledgedOn < dateOnly(cur.sentOn)) throw new BadRequestException('Acknowledged before it was sent');
    await this.prisma.transmittal.update({ where: { id }, data: { acknowledgedOn: parseDate(dto.acknowledgedOn), acknowledgedBy: dto.acknowledgedBy } });
    await this.audit.log(user, 'TRANSMITTAL', id, 'ACKNOWLEDGED', dto.acknowledgedBy);
    return this.getTransmittal(user, id);
  }

  async removeTransmittal(user: RequestUser, id: string) {
    const cur = await this.loadTransmittal(user, id);
    if (cur.acknowledgedOn) throw new BadRequestException('An acknowledged transmittal stays on record');
    await this.prisma.transmittal.delete({ where: { id } });
    await this.audit.log(user, 'TRANSMITTAL', id, 'DELETED', cur.transmittalNo);
    return { ok: true };
  }

  /* ---------- summary ---------- */

  async summary(user: RequestUser, projectId?: string): Promise<DocumentSummaryDto> {
    const base = { ...this.access.submissionWhere(user), ...(projectId ? { projectId } : {}) };
    const letters = canViewLetters(user.roleKey);
    const today = parseDate(todayIn());
    const [documents, awaitingApproval, unacknowledged, lettersAwaitingReply, lettersOverdue] = await Promise.all([
      this.prisma.document.count({ where: base }),
      this.prisma.document.count({ where: { ...base, currentRevision: { status: 'FOR_APPROVAL' satisfies RevisionStatus } } }),
      this.prisma.transmittal.count({ where: { ...base, acknowledgedOn: null } }),
      letters ? this.prisma.letter.count({ where: { ...base, ...LETTERS_AWAITING } }) : null,
      letters ? this.prisma.letter.count({ where: { ...base, ...LETTERS_AWAITING, replyBy: { lt: today } } }) : null,
    ]);
    return { documents, awaitingApproval, unacknowledged, lettersAwaitingReply, lettersOverdue };
  }
}

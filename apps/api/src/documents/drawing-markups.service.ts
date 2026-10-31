import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MARKUP_KIND_LABELS, canEditMarkup, markupProblem, roundPoint, type DrawingMarkupDto, type MarkupPoint } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { iso } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { CreateMarkupDto, LinkMarkupRfiDto, ResolveMarkupDto, UpdateMarkupDto } from './documents.dto';

const markupInclude = {
  revision: { select: { revision: true } },
  createdBy: { select: { fullName: true } },
  resolvedBy: { select: { fullName: true } },
  rfi: { select: { rfiNo: true } },
} satisfies Prisma.DrawingMarkupInclude;
type MarkupRow = Prisma.DrawingMarkupGetPayload<{ include: typeof markupInclude }>;

const clip = (note: string | null | undefined, n = 80) => (note && note.length > n ? `${note.slice(0, n - 1)}…` : note ?? '');

/**
 * Drawing markup: marks on one page of a revision's file, numbered M1, M2… per document. Anyone who can
 * open the document adds one; whoever made it and document control change, resolve or delete it. Marks are recorded
 * on the document's history. Open marks of earlier revisions are carried forward by the viewer (`marksForSheet`).
 */
@Injectable()
export class DrawingMarkupsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  private async loadDocument(user: RequestUser, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, ...this.access.submissionWhere(user) }, select: { id: true, projectId: true, docNo: true } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  private async loadMarkup(user: RequestUser, documentId: string, markupId: string, edit = true) {
    await this.loadDocument(user, documentId);
    const row = await this.prisma.drawingMarkup.findFirst({ where: { id: markupId, documentId, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Mark not found on this drawing');
    if (edit && !canEditMarkup(user.roleKey, row.createdById === user.id)) throw new ForbiddenException('Only whoever made this mark, or document control, can change it');
    return row;
  }

  /** Each file's place among its revision's files, in the order the register shows them. */
  private async fileIndexes(documentId: string) {
    const files = await this.prisma.attachment.findMany({ where: { revision: { documentId } }, select: { id: true, revisionId: true }, orderBy: { createdAt: 'asc' } });
    const index = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const f of files) {
      const n = seen.get(f.revisionId!) ?? 0;
      index.set(f.id, n);
      seen.set(f.revisionId!, n + 1);
    }
    return index;
  }

  private toDto(m: MarkupRow, fileIndex: Map<string, number>): DrawingMarkupDto {
    return {
      id: m.id,
      documentId: m.documentId,
      markupNo: m.markupNo,
      revisionId: m.revisionId,
      revision: m.revision.revision,
      attachmentId: m.attachmentId,
      fileIndex: fileIndex.get(m.attachmentId) ?? -1,
      page: m.page,
      kind: m.kind,
      points: m.points as unknown as MarkupPoint[],
      color: m.color,
      note: m.note,
      status: m.status,
      resolvedNote: m.resolvedNote,
      resolvedByName: m.resolvedBy?.fullName ?? null,
      resolvedAt: iso(m.resolvedAt),
      rfiId: m.rfiId,
      rfiNo: m.rfi?.rfiNo ?? null,
      createdById: m.createdById,
      createdByName: m.createdBy.fullName,
      createdAt: iso(m.createdAt),
      updatedAt: iso(m.updatedAt),
    };
  }

  private async one(documentId: string, id: string) {
    const [row, index] = await Promise.all([this.prisma.drawingMarkup.findUniqueOrThrow({ where: { id }, include: markupInclude }), this.fileIndexes(documentId)]);
    return this.toDto(row, index);
  }

  /** Every mark on the document's revisions, by number. */
  async list(user: RequestUser, documentId: string): Promise<DrawingMarkupDto[]> {
    await this.loadDocument(user, documentId);
    const [rows, index] = await Promise.all([
      this.prisma.drawingMarkup.findMany({ where: { documentId, organizationId: user.organizationId }, include: markupInclude, orderBy: { markupNo: 'asc' } }),
      this.fileIndexes(documentId),
    ]);
    return rows.map((r) => this.toDto(r, index));
  }

  private checkShape(kind: CreateMarkupDto['kind'], points: unknown, note: string | null | undefined) {
    const problem = markupProblem(kind, points, note);
    if (problem) throw new BadRequestException(problem);
    return (points as MarkupPoint[]).map(roundPoint) as unknown as Prisma.InputJsonValue;
  }

  async create(user: RequestUser, documentId: string, dto: CreateMarkupDto): Promise<DrawingMarkupDto> {
    const doc = await this.loadDocument(user, documentId);
    if (dto.id) {
      const existing = await this.prisma.drawingMarkup.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true, documentId: true } });
      if (existing) return this.one(existing.documentId, existing.id);
    }
    const file = await this.prisma.attachment.findFirst({ where: { id: dto.attachmentId, revisionId: dto.revisionId, revision: { documentId } }, select: { id: true } });
    if (!file) throw new BadRequestException("That file is not on this drawing's revision; open the drawing again");
    const points = this.checkShape(dto.kind, dto.points, dto.note);
    // Numbers are per document; two people marking at once retry on the clash.
    for (let attempt = 0; ; attempt++) {
      const last = await this.prisma.drawingMarkup.aggregate({ where: { documentId }, _max: { markupNo: true } });
      try {
        const row = await this.prisma.drawingMarkup.create({
          data: {
            ...(dto.id ? { id: dto.id } : {}),
            organizationId: user.organizationId,
            projectId: doc.projectId,
            documentId,
            markupNo: (last._max.markupNo ?? 0) + 1,
            revisionId: dto.revisionId,
            attachmentId: dto.attachmentId,
            page: dto.page ?? 1,
            kind: dto.kind,
            points,
            color: dto.color ?? 'RED',
            note: dto.note || null,
            createdById: user.id,
          },
          select: { id: true, markupNo: true },
        });
        await this.audit.log(user, 'DOCUMENT', documentId, 'MARKUP_ADDED', `M${row.markupNo} ${MARKUP_KIND_LABELS[dto.kind].toLowerCase()}${dto.note ? `: ${clip(dto.note)}` : ''}`);
        return this.one(documentId, row.id);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        if (dto.id) {
          const winner = await this.prisma.drawingMarkup.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
          if (winner) return this.one(documentId, winner.id);
        }
        if (attempt >= 4) throw new BadRequestException('Others are marking this drawing right now; save again');
      }
    }
  }

  async update(user: RequestUser, documentId: string, id: string, dto: UpdateMarkupDto): Promise<DrawingMarkupDto> {
    const cur = await this.loadMarkup(user, documentId, id);
    const note = dto.note !== undefined ? dto.note || null : cur.note;
    const data: Prisma.DrawingMarkupUpdateInput = {};
    if (dto.points !== undefined || dto.note !== undefined) data.points = this.checkShape(cur.kind, dto.points ?? cur.points, note);
    if (dto.note !== undefined) data.note = note;
    if (dto.color !== undefined) data.color = dto.color;
    await this.prisma.drawingMarkup.update({ where: { id }, data });
    return this.one(documentId, id);
  }

  async resolve(user: RequestUser, documentId: string, id: string, dto: ResolveMarkupDto): Promise<DrawingMarkupDto> {
    const cur = await this.loadMarkup(user, documentId, id);
    if (cur.status === 'RESOLVED') return this.one(documentId, id);
    await this.prisma.drawingMarkup.update({ where: { id }, data: { status: 'RESOLVED', resolvedNote: dto.note || null, resolvedById: user.id, resolvedAt: new Date() } });
    await this.audit.log(user, 'DOCUMENT', documentId, 'MARKUP_RESOLVED', `M${cur.markupNo}${dto.note ? `: ${clip(dto.note)}` : ''}`);
    return this.one(documentId, id);
  }

  async reopen(user: RequestUser, documentId: string, id: string): Promise<DrawingMarkupDto> {
    const cur = await this.loadMarkup(user, documentId, id);
    if (cur.status === 'OPEN') return this.one(documentId, id);
    await this.prisma.drawingMarkup.update({ where: { id }, data: { status: 'OPEN', resolvedNote: null, resolvedById: null, resolvedAt: null } });
    await this.audit.log(user, 'DOCUMENT', documentId, 'MARKUP_REOPENED', `M${cur.markupNo}`);
    return this.one(documentId, id);
  }

  /** Link the RFI raised from a mark (any project member who raised it), or unlink it. */
  async linkRfi(user: RequestUser, documentId: string, id: string, dto: LinkMarkupRfiDto): Promise<DrawingMarkupDto> {
    const cur = await this.loadMarkup(user, documentId, id, false);
    if (dto.rfiId) {
      const rfi = await this.prisma.rfi.findFirst({ where: { id: dto.rfiId, organizationId: user.organizationId, projectId: cur.projectId }, select: { id: true } });
      if (!rfi) throw new BadRequestException('That RFI is not on this project');
    } else if (!canEditMarkup(user.roleKey, cur.createdById === user.id)) throw new ForbiddenException('Only whoever made this mark, or document control, can change it');
    await this.prisma.drawingMarkup.update({ where: { id }, data: { rfiId: dto.rfiId ?? null } });
    return this.one(documentId, id);
  }

  async remove(user: RequestUser, documentId: string, id: string) {
    const cur = await this.loadMarkup(user, documentId, id);
    await this.prisma.drawingMarkup.delete({ where: { id } });
    await this.audit.log(user, 'DOCUMENT', documentId, 'MARKUP_DELETED', `M${cur.markupNo}${cur.note ? `: ${clip(cur.note)}` : ''}`);
    return { ok: true };
  }
}

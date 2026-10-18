import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canViewLetters, type DocumentPageViewDto, type DocumentSearchHitDto, type DocumentSearchResultDto } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { StorageService } from '../common/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnly } from '../common/serialize';
import { MAX_PDF_BYTES, excerpt, readPdfPages, tsQueryText } from './document-text';

/** Files read per search before answering; the rest are read by the next search or the nightly run. */
const READ_PER_SEARCH = 6;
/** Time spent reading files before a search, at most (ms). */
const READ_BUDGET_MS = 20_000;
const HITS = 6;
/** A file that could not be read is tried again after this long (ms), so a fixed reader or a passing fault heals it. */
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

/** Not read yet, or failed and due another try. */
const unreadFile = (): Prisma.AttachmentWhereInput => ({
  OR: [{ textIndexedAt: null }, { textError: { not: null }, textIndexedAt: { lt: new Date(Date.now() - RETRY_AFTER_MS) } }],
});

type PageRow = { attachmentId: string; page: number; text: string; projectId: string; rank: number };
type LetterRow = { id: string; rank: number };

/**
 * Ask the contract (AI item 75): the text of PDFs filed with document revisions and letters, a page per row in
 * `DocumentPage`, searched with Postgres full-text search. Files are read when first searched (and by the nightly
 * run), so nothing changes in how documents are filed. Who sees what is the documents register's own rule: the
 * projects the user can open, only the current revision of a document, and letters only for roles that see them.
 */
@Injectable()
export class DocumentTextService {
  private readonly log = new Logger(DocumentTextService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private storage: StorageService,
  ) {}

  /** PDFs on current document revisions and on letters, in these projects, whose text has not been read yet. */
  private pendingWhere(organizationId: string | null, projectIds: string[] | null): Prisma.AttachmentWhereInput {
    const inProjects = projectIds ? { projectId: { in: projectIds } } : {};
    return {
      ...(organizationId ? { organizationId } : {}),
      mimeType: 'application/pdf',
      AND: [unreadFile(), { OR: [{ revision: { currentOf: { isNot: null }, document: inProjects } }, { letter: projectIds ? { is: inProjects } : { isNot: null } }] }],
    };
  }

  /** Reads pending PDFs into pages, oldest first, until `limit` files or `budgetMs` is spent. Returns files read. */
  async readPending(organizationId: string, projectIds: string[] | null, limit = READ_PER_SEARCH, budgetMs = READ_BUDGET_MS): Promise<number> {
    const started = Date.now();
    const files = await this.prisma.attachment.findMany({
      where: this.pendingWhere(organizationId, projectIds),
      select: { id: true, size: true, storagePath: true, revision: { select: { document: { select: { projectId: true } } } }, letter: { select: { projectId: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let read = 0;
    for (const f of files) {
      if (Date.now() - started > budgetMs) break;
      const projectId = f.revision?.document.projectId ?? f.letter?.projectId;
      if (!projectId) continue;
      let pages: string[] = [];
      let error: string | null = null;
      try {
        if (f.size > MAX_PDF_BYTES) throw new Error(`too large (${f.size} bytes)`);
        const row = await this.prisma.attachment.findUniqueOrThrow({ where: { id: f.id }, select: { data: true } });
        pages = await readPdfPages(await this.storage.read(f.storagePath, row.data));
      } catch (e) {
        error = ((e as Error).message || String(e)).slice(0, 500);
        this.log.warn(`reading ${f.id}: ${error}`);
      }
      const rows = pages.map((text, i) => ({ organizationId, projectId, attachmentId: f.id, page: i + 1, text })).filter((r) => r.text.length > 0);
      await this.prisma.$transaction([
        this.prisma.documentPage.deleteMany({ where: { attachmentId: f.id } }),
        this.prisma.documentPage.createMany({ data: rows }),
        this.prisma.attachment.update({ where: { id: f.id }, data: { textIndexedAt: new Date(), textPages: rows.length, textError: error } }),
      ]);
      read++;
    }
    return read;
  }

  /** The nightly run: every company's pending files, within the time given. */
  async readAllPending(budgetMs = 120_000): Promise<number> {
    const started = Date.now();
    let read = 0;
    for (;;) {
      const next = await this.prisma.attachment.findFirst({ where: this.pendingWhere(null, null), select: { organizationId: true } });
      const left = budgetMs - (Date.now() - started);
      if (!next || left <= 0) break;
      const n = await this.readPending(next.organizationId, null, 20, left);
      if (!n) break;
      read += n;
    }
    return read;
  }

  /**
   * Pages and letters matching a question, best first, as `user` may see them. Reads the projects' pending files
   * first unless `read` is false (Ask's tool, which never writes; filing a file reads it straight away).
   */
  async search(user: RequestUser, q: { query: string; projectId?: string; limit?: number; read?: boolean }): Promise<DocumentSearchResultDto> {
    const visible = (await this.prisma.project.findMany({ where: { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}) }, select: { id: true } })).map((p) => p.id);
    if (q.projectId && !visible.length) throw new NotFoundException('Project not found or not accessible');
    const tsq = tsQueryText(q.query);
    if (!visible.length || !tsq) return { hits: [], unread: 0 };
    if (q.read !== false) await this.readPending(user.organizationId, visible);
    const letters = canViewLetters(user.roleKey);
    const limit = Math.min(q.limit ?? HITS, 10);

    const [pages, letterRows, unread] = await this.prisma.$transaction(async (tx) => [
      await tx.$queryRaw<PageRow[]>`
        SELECT p."attachmentId", p."page", p."text", p."projectId", ts_rank_cd(p."search", q, 1) AS rank
        FROM "DocumentPage" p
        JOIN "Attachment" a ON a."id" = p."attachmentId"
        LEFT JOIN "Document" d ON d."currentRevisionId" = a."revisionId"
        CROSS JOIN to_tsquery('english', ${tsq}) q
        WHERE p."organizationId" = ${user.organizationId} AND p."projectId" = ANY(${visible}::text[]) AND p."search" @@ q
          AND (d."id" IS NOT NULL OR (${letters} AND a."letterId" IS NOT NULL))
        ORDER BY rank DESC, p."page" ASC
        LIMIT ${limit}`,
      letters
        ? await tx.$queryRaw<LetterRow[]>`
            SELECT l."id", ts_rank_cd(to_tsvector('english', l."subject" || ' ' || coalesce(l."summary", '') || ' ' || l."party"), q, 1) AS rank
            FROM "Letter" l CROSS JOIN to_tsquery('english', ${tsq}) q
            WHERE l."organizationId" = ${user.organizationId} AND l."projectId" = ANY(${visible}::text[])
              AND to_tsvector('english', l."subject" || ' ' || coalesce(l."summary", '') || ' ' || l."party") @@ q
            ORDER BY rank DESC, l."letterDate" DESC
            LIMIT ${limit}`
        : [],
      await tx.attachment.count({ where: this.pendingWhere(user.organizationId, visible) }),
    ] as const);

    const files = await this.prisma.attachment.findMany({
      where: { id: { in: pages.map((p) => p.attachmentId) } },
      select: {
        id: true, fileName: true, textPages: true,
        revision: { select: { revision: true, issuedOn: true, document: { select: { docNo: true, title: true, kind: true } } } },
        letter: { select: { letterNo: true, letterDate: true, party: true, subject: true, direction: true } },
      },
    });
    const fileOf = new Map(files.map((f) => [f.id, f]));
    const pageHits: (DocumentSearchHitDto & { rank: number })[] = pages.flatMap((p) => {
      const f = fileOf.get(p.attachmentId);
      if (!f) return [];
      const r = f.revision;
      const l = f.letter;
      return [{
        source: r ? ('DOCUMENT' as const) : ('LETTER' as const),
        projectId: p.projectId,
        title: r ? `${r.document.docNo} ${r.document.title}, rev ${r.revision}` : `${l!.letterNo} ${l!.direction === 'IN' ? 'from' : 'to'} ${l!.party}: ${l!.subject}`,
        kind: r ? r.document.kind : 'LETTER',
        page: p.page,
        pages: f.textPages,
        date: dateOnly(r ? r.issuedOn : l!.letterDate),
        href: `/documents/view?file=${p.attachmentId}&page=${p.page}`,
        text: excerpt(p.text, q.query),
        rank: Number(p.rank),
      }];
    });
    const letterInfo = await this.prisma.letter.findMany({ where: { id: { in: letterRows.map((l) => l.id) } }, select: { id: true, projectId: true, letterNo: true, letterDate: true, direction: true, party: true, subject: true, summary: true, theirRef: true } });
    const infoOf = new Map(letterInfo.map((l) => [l.id, l]));
    const letterHits: (DocumentSearchHitDto & { rank: number })[] = letterRows.flatMap((row) => {
      const l = infoOf.get(row.id);
      if (!l) return [];
      return [{
        source: 'LETTER' as const,
        projectId: l.projectId,
        title: `${l.letterNo} ${l.direction === 'IN' ? 'from' : 'to'} ${l.party}`,
        kind: l.direction === 'IN' ? 'LETTER_RECEIVED' : 'LETTER_SENT',
        page: null,
        pages: null,
        date: dateOnly(l.letterDate),
        href: `/documents?tab=letters&letter=${l.id}`,
        text: [`Subject: ${l.subject}`, l.summary ? `Summary: ${l.summary}` : null, l.theirRef ? `Their ref: ${l.theirRef}` : null].filter(Boolean).join('\n'),
        rank: Number(row.rank),
      }];
    });
    const hits = [...pageHits, ...letterHits].sort((a, b) => b.rank - a.rank).slice(0, limit).map(({ rank: _rank, ...h }) => h);
    return { hits, unread };
  }

  /** One page of a filed PDF, for the viewer that answers link to: the file, its record and the page's text. */
  async page(user: RequestUser, attachmentId: string, page: number): Promise<DocumentPageViewDto> {
    const f = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, organizationId: user.organizationId, OR: [{ revision: { document: { project: this.access.projectWhere(user) } } }, ...(canViewLetters(user.roleKey) ? [{ letter: { project: this.access.projectWhere(user) } }] : [])] },
      select: {
        id: true, fileName: true, storagePath: true, textPages: true, textError: true,
        revision: { select: { revision: true, document: { select: { id: true, docNo: true, title: true } } } },
        letter: { select: { id: true, letterNo: true, subject: true } },
      },
    });
    if (!f) throw new NotFoundException('File not found');
    const row = await this.prisma.documentPage.findUnique({ where: { attachmentId_page: { attachmentId, page } }, select: { text: true } });
    const r = f.revision;
    return {
      attachmentId: f.id,
      fileName: f.fileName,
      url: this.storage.toUrl(f.id, f.storagePath),
      page,
      pages: f.textPages ?? 0,
      title: r ? `${r.document.docNo} ${r.document.title}, rev ${r.revision}` : `${f.letter!.letterNo} ${f.letter!.subject}`,
      recordHref: r ? `/documents?id=${r.document.id}` : `/documents?tab=letters&letter=${f.letter!.id}`,
      text: row?.text ?? null,
      readError: f.textError,
    };
  }
}

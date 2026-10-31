import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { COMMENT_KIND_LABELS, COMPANY_WIDE_ROLES, GUEST_ROLES, ROLE_LABELS, isGuest, type CommentDto, type CommentKind, type CommentThreadDto, type CommentThreadsDto, type MentionableDto, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommentTargetsService, type CommentTarget } from './comment-targets.service';
import { commentProblem, keptMentions, mayChange, noticeBody, noticeTitle, threadOrder, whoToTell, type Mention } from './comment-rules';
import type { CreateCommentDto, UpdateCommentDto } from './comments.dto';

const include = { author: { select: { fullName: true } }, resolvedBy: { select: { fullName: true } } } satisfies Prisma.CommentInclude;
type Row = Prisma.CommentGetPayload<{ include: typeof include }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Comments and mentions on a record. The record is loaded through its own service with the caller
 * (`CommentTargetsService`), so whoever may open it reads and writes its comments; guests and suppliers have none.
 * Someone mentioned must be able to open the record too. A mention, and a reply in a thread someone is in, is a notice.
 */
@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private targets: CommentTargetsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  private async target(user: RequestUser, kind: CommentKind, entityId: string): Promise<CommentTarget> {
    if (isGuest(user.roleKey)) throw new ForbiddenException('Comments are for your company’s staff');
    return this.targets.load(user, kind, entityId);
  }

  private assertWriter(user: RequestUser) {
    if (user.support) throw new ForbiddenException('A support session reads only');
    if (user.billingReadOnly) throw new ForbiddenException('Your company’s plan has ended, so comments are read only');
  }

  async list(user: RequestUser, kind: CommentKind, entityId: string): Promise<CommentThreadsDto> {
    await this.target(user, kind, entityId);
    const rows = await this.prisma.comment.findMany({
      where: { organizationId: user.organizationId, entityType: kind, entityId },
      include,
      orderBy: { createdAt: 'asc' },
    });
    const names = await this.names(user.organizationId, rows.flatMap((r) => r.mentions));
    const dto = (r: Row): CommentDto => ({
      id: r.id,
      parentId: r.parentId,
      authorId: r.authorId,
      authorName: r.author.fullName,
      body: r.removedAt ? '' : r.body,
      mentions: r.removedAt ? [] : r.mentions.flatMap((id) => (names.has(id) ? [{ id, name: names.get(id)! }] : [])),
      createdAt: r.createdAt.toISOString(),
      editedAt: iso(r.editedAt),
      removed: !!r.removedAt,
      mine: r.authorId === user.id,
    });
    const roots = rows.filter((r) => !r.parentId);
    const threads = roots.flatMap((root) => {
      const replies = rows.filter((r) => r.parentId === root.id && !r.removedAt);
      // A removed first comment stays only to hold its replies.
      if (root.removedAt && !replies.length) return [];
      const lastAt = [root, ...replies].reduce((t, r) => (r.createdAt > t ? r.createdAt : t), root.createdAt);
      return [{ root, replies, lastAt, resolvedAt: root.resolvedAt }];
    });
    const ordered = threadOrder(threads).map(
      (t): CommentThreadDto => ({ ...dto(t.root), replies: t.replies.map(dto), resolvedAt: iso(t.root.resolvedAt), resolvedByName: t.root.resolvedBy?.fullName ?? null }),
    );
    return {
      kind,
      entityId,
      threads: ordered,
      open: ordered.filter((t) => !t.resolvedAt).length,
      resolved: ordered.filter((t) => t.resolvedAt).length,
      canComment: !user.support && !user.billingReadOnly,
    };
  }

  /** Staff who see the record's project, for the @ list (whether each may open the record itself is checked on save). */
  async people(user: RequestUser, kind: CommentKind, entityId: string): Promise<MentionableDto[]> {
    const t = await this.target(user, kind, entityId);
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        id: { not: user.id },
        role: { key: { notIn: GUEST_ROLES } },
        ...(t.projectId
          ? { OR: [{ role: { key: { in: COMPANY_WIDE_ROLES } } }, { managedProjects: { some: { id: t.projectId } } }, { memberships: { some: { projectId: t.projectId } } }] }
          : {}),
      },
      select: { id: true, fullName: true, role: { select: { key: true } } },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({ id: u.id, name: u.fullName, role: ROLE_LABELS[u.role.key as RoleKey] ?? u.role.key }));
  }

  async create(user: RequestUser, dto: CreateCommentDto): Promise<CommentThreadsDto> {
    this.assertWriter(user);
    const t = await this.target(user, dto.kind, dto.entityId);
    let thread: { id: string; resolvedAt: Date | null } | null = null;
    if (dto.parentId) {
      thread = await this.prisma.comment.findFirst({
        where: { id: dto.parentId, organizationId: user.organizationId, entityType: dto.kind, entityId: dto.entityId, parentId: null },
        select: { id: true, resolvedAt: true },
      });
      if (!thread) throw new NotFoundException('That thread is not on this record');
    }
    const body = dto.body.trim();
    const mentions = await this.checkMentions(user, dto.kind, dto.entityId, body, dto.mentions ?? []);
    const people = thread ? await this.threadPeople(thread.id) : null;
    const row = await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: { organizationId: user.organizationId, entityType: dto.kind, entityId: dto.entityId, projectId: t.projectId, parentId: thread?.id ?? null, authorId: user.id, body, mentions: mentions.map((m) => m.id) },
      });
      // A reply to a resolved thread opens it again.
      if (thread?.resolvedAt) await tx.comment.update({ where: { id: thread.id }, data: { resolvedAt: null, resolvedById: null } });
      return c;
    });
    if (thread?.resolvedAt) await this.audit.log(user, 'COMMENT', thread.id, 'REOPENED', 'By a reply');
    await this.tell(user, dto.kind, dto.entityId, t, row.id, body, mentions.map((m) => m.id), people);
    return this.list(user, dto.kind, dto.entityId);
  }

  async update(user: RequestUser, id: string, dto: UpdateCommentDto): Promise<CommentThreadsDto> {
    this.assertWriter(user);
    const row = await this.row(user, id);
    const kind = row.entityType as CommentKind;
    const t = await this.target(user, kind, row.entityId);
    if (!mayChange(row, { id: user.id, isAdmin: user.roleKey === 'ADMIN' }, 'edit')) throw new ForbiddenException('Only its author can edit a comment');
    const body = dto.body.trim();
    const mentions = await this.checkMentions(user, kind, row.entityId, body, dto.mentions ?? row.mentions);
    await this.prisma.comment.update({ where: { id }, data: { body, mentions: mentions.map((m) => m.id), editedAt: new Date() } });
    await this.audit.log(user, 'COMMENT', id, 'EDITED');
    // Only those newly mentioned hear of it.
    const added = mentions.map((m) => m.id).filter((m) => !row.mentions.includes(m));
    if (added.length) await this.tell(user, kind, row.entityId, t, id, body, added, null);
    return this.list(user, kind, row.entityId);
  }

  async remove(user: RequestUser, id: string): Promise<CommentThreadsDto> {
    this.assertWriter(user);
    const row = await this.row(user, id);
    const kind = row.entityType as CommentKind;
    await this.target(user, kind, row.entityId);
    if (!mayChange(row, { id: user.id, isAdmin: user.roleKey === 'ADMIN' }, 'remove')) throw new ForbiddenException('Only its author or an admin can remove a comment');
    await this.prisma.comment.update({ where: { id }, data: { body: '', mentions: [], removedAt: new Date() } });
    await this.audit.log(user, 'COMMENT', id, 'REMOVED', row.body.slice(0, 200));
    return this.list(user, kind, row.entityId);
  }

  /** Resolve or reopen a thread: anyone who can see the record. */
  async resolve(user: RequestUser, id: string, resolved: boolean): Promise<CommentThreadsDto> {
    this.assertWriter(user);
    const row = await this.row(user, id);
    const kind = row.entityType as CommentKind;
    await this.target(user, kind, row.entityId);
    if (row.parentId) throw new BadRequestException('Resolve the thread from its first comment');
    if (!!row.resolvedAt === resolved) throw new BadRequestException(resolved ? 'This thread is already resolved' : 'This thread is already open');
    await this.prisma.comment.update({ where: { id }, data: resolved ? { resolvedAt: new Date(), resolvedById: user.id } : { resolvedAt: null, resolvedById: null } });
    await this.audit.log(user, 'COMMENT', id, resolved ? 'RESOLVED' : 'REOPENED');
    return this.list(user, kind, row.entityId);
  }

  private async row(user: RequestUser, id: string) {
    const row = await this.prisma.comment.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Comment not found');
    return row;
  }

  private async names(organizationId: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { organizationId, id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  /** The people mentioned: staff of the company, still written as @Full Name, who can open the record. */
  private async checkMentions(user: RequestUser, kind: CommentKind, entityId: string, body: string, ids: string[]): Promise<Mention[]> {
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { organizationId: user.organizationId, id: { in: [...new Set(ids)] }, isActive: true },
          select: { id: true, fullName: true, email: true, role: { select: { key: true } } },
        })
      : [];
    if (users.length !== new Set(ids).size) throw new BadRequestException('Mention only active people of your company');
    const asked: Mention[] = users.map((u) => ({ id: u.id, name: u.fullName }));
    const problem = commentProblem(body, keptMentions(body, asked));
    if (problem) throw new BadRequestException(problem);
    const mentions = keptMentions(body, asked);
    for (const m of mentions) {
      const u = users.find((x) => x.id === m.id)!;
      const roleKey = u.role.key as RoleKey;
      const sees = !isGuest(roleKey) && (await this.targets.canSee({ id: u.id, organizationId: user.organizationId, roleKey, email: u.email, fullName: u.fullName }, kind, entityId));
      if (!sees) throw new BadRequestException(`${u.fullName} cannot open this ${COMMENT_KIND_LABELS[kind].toLowerCase()}, so cannot be mentioned on it`);
    }
    return mentions;
  }

  private async threadPeople(threadId: string) {
    const rows = await this.prisma.comment.findMany({ where: { OR: [{ id: threadId }, { parentId: threadId }], removedAt: null }, select: { authorId: true, mentions: true }, orderBy: { createdAt: 'asc' } });
    return { writers: rows.map((r) => r.authorId), mentioned: rows.flatMap((r) => r.mentions) };
  }

  private async tell(user: RequestUser, kind: CommentKind, entityId: string, t: CommentTarget, commentId: string, body: string, mentioned: string[], thread: { writers: string[]; mentioned: string[] } | null) {
    const who = whoToTell(user.id, mentioned, thread);
    const base = { organizationId: user.organizationId, type: 'COMMENT' as const, body: noticeBody(body), projectId: t.projectId, entityType: kind, entityId };
    if (who.mentioned.length) await this.notifications.notify({ ...base, userIds: who.mentioned, title: noticeTitle(user.fullName, 'mentioned', t.title), dedupeKey: `COMMENT:${commentId}:mentioned` });
    if (who.replied.length) await this.notifications.notify({ ...base, userIds: who.replied, title: noticeTitle(user.fullName, 'replied', t.title), dedupeKey: `COMMENT:${commentId}:replied` });
  }
}

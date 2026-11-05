import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canViewAuditLog, type AuditLogEntryDto, type Paginated } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { pageArgs, paginated, searchWords } from '../common/paging';
import { ListAuditLogQuery } from './audit-log.dto';

/** A company day's first instant in India time, so a day filter reads as the office's day, not UTC's. */
const dayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);
const nextDay = (day: string) => new Date(dayStart(day).getTime() + 86_400_000);

/** The company's whole audit log, newest first: every line any module wrote, for the admin (`canViewAuditLog`). */
@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async list(user: RequestUser, q: ListAuditLogQuery): Promise<Paginated<AuditLogEntryDto> & { kinds: string[] }> {
    if (!canViewAuditLog(user.roleKey)) throw new ForbiddenException('Only an admin reads the audit log');
    const where: Prisma.AuditLogWhereInput = { organizationId: user.organizationId };
    if (q.kind) where.entityType = q.kind;
    if (q.action) where.action = q.action;
    if (q.actorId) where.actorId = q.actorId;
    if (q.entityId) where.entityId = q.entityId;
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: dayStart(q.from) } : {}), ...(q.to ? { lt: nextDay(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ note: { contains: w, mode: 'insensitive' as const } }, { action: { contains: w, mode: 'insensitive' as const } }, { actor: { fullName: { contains: w, mode: 'insensitive' as const } } }],
      }));
    const dir = q.sortOrder ?? 'desc';
    const orderBy: Prisma.AuditLogOrderByWithRelationInput[] =
      q.sortBy === 'kind' ? [{ entityType: dir }] : q.sortBy === 'action' ? [{ action: dir }] : q.sortBy === 'actor' ? [{ actor: { fullName: dir } }] : [];
    const args = pageArgs(q);
    const [rows, total, kinds] = await Promise.all([
      this.prisma.auditLog.findMany({ where, include: { actor: { select: { fullName: true } } }, orderBy: [...orderBy, { createdAt: dir }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where: { organizationId: user.organizationId }, distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
    ]);
    return {
      ...paginated(
        rows.map((r) => ({ id: r.id, entityType: r.entityType, entityId: r.entityId, action: r.action, actorId: r.actorId, actorName: r.actor.fullName, note: r.note, createdAt: r.createdAt.toISOString() })),
        total,
        args,
      ),
      kinds: kinds.map((k) => k.entityType),
    };
  }
}

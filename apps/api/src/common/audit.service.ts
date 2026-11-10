import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './current-user';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(user: RequestUser, entityType: string, entityId: string, action: string, note?: string | null) {
    return this.prisma.auditLog.create({
      data: { organizationId: user.organizationId, entityType, entityId, action, actorId: user.id, note: note ?? null },
    });
  }

  /** `log` for many entries at once (a bank file's payments), in one insert. */
  logMany(user: RequestUser, entries: { entityType: string; entityId: string; action: string; note?: string | null }[]) {
    if (!entries.length) return Promise.resolve({ count: 0 });
    return this.prisma.auditLog.createMany({
      data: entries.map((e) => ({ organizationId: user.organizationId, entityType: e.entityType, entityId: e.entityId, action: e.action, actorId: user.id, note: e.note ?? null })),
    });
  }

  async forEntity(organizationId: string, entityType: string, entityId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId, entityType, entityId },
      include: { actor: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      actorName: r.actor.fullName,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

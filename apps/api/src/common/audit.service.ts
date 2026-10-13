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

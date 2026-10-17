import { Prisma, PrismaClient } from '@prisma/client';
import { dateOnly, dec } from '../common/serialize';
import { serviceState, type ServiceStatusDto } from '@erp/shared';

const RANK = { OVERDUE: 0, DUE_SOON: 1, OK: 2, NOT_SET: 3 } as const;

/**
 * Service position of every active machine with a schedule that matches `where`: hours worked (logs that are not
 * rejected) and days since the last service, or since the machine was added when it was never serviced.
 * Shared by the maintenance summary and the daily machinery alert, which has no request user.
 */
export async function serviceStatuses(prisma: PrismaClient | Prisma.TransactionClient, where: Prisma.EquipmentWhereInput, today: string): Promise<ServiceStatusDto[]> {
  const machines = await prisma.equipment.findMany({
    // AND, not a spread: the caller's `where` may carry its own OR (the projects this user can see).
    where: { AND: [where, { isActive: true, OR: [{ serviceIntervalHours: { not: null } }, { serviceIntervalDays: { not: null } }] }] },
    select: {
      id: true,
      code: true,
      name: true,
      createdAt: true,
      projectId: true,
      serviceIntervalHours: true,
      serviceIntervalDays: true,
      lastServiceDate: true,
      project: { select: { name: true } },
      maintenanceJobs: { where: { kind: 'SERVICE', status: 'OPEN' }, select: { id: true }, take: 1 },
    },
  });
  const out: ServiceStatusDto[] = [];
  for (const m of machines) {
    const since = m.lastServiceDate ?? new Date(`${m.createdAt.toISOString().slice(0, 10)}T00:00:00Z`);
    const hours = await prisma.machineryLog.aggregate({
      where: { equipmentId: m.id, status: { not: 'REJECTED' }, date: m.lastServiceDate ? { gt: since } : { gte: since } },
      _sum: { hoursWorked: true },
    });
    const hoursSince = Number(hours._sum.hoursWorked ?? 0);
    const s = serviceState({ intervalHours: dec(m.serviceIntervalHours), intervalDays: m.serviceIntervalDays, since: dateOnly(since), hoursSince, today });
    out.push({
      equipmentId: m.id,
      equipmentCode: m.code,
      equipmentName: m.name,
      projectId: m.projectId,
      projectName: m.project?.name ?? null,
      intervalHours: dec(m.serviceIntervalHours),
      intervalDays: m.serviceIntervalDays,
      lastServiceDate: dateOnly(m.lastServiceDate),
      hoursSince: hoursSince.toFixed(1),
      ...s,
      openServiceJobId: m.maintenanceJobs[0]?.id ?? null,
    });
  }
  const urgency = (x: ServiceStatusDto) => Math.min(x.hoursLeft ?? Infinity, x.daysLeft === null ? Infinity : x.daysLeft * 8);
  return out.sort((a, b) => RANK[a.state] - RANK[b.state] || urgency(a) - urgency(b) || a.equipmentCode.localeCompare(b.equipmentCode));
}

/** Ids of the paper with the latest validity for each machine and type: a renewed insurance replaces the old one. */
export async function latestDocIds(prisma: PrismaClient | Prisma.TransactionClient, organizationId?: string): Promise<string[]> {
  const rows = organizationId
    ? await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT ON ("equipmentId", "type") "id" FROM "EquipmentDocument"
        WHERE "organizationId" = ${organizationId}
        ORDER BY "equipmentId", "type", "validTo" DESC, "createdAt" DESC`
    : await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT ON ("equipmentId", "type") "id" FROM "EquipmentDocument"
        ORDER BY "equipmentId", "type", "validTo" DESC, "createdAt" DESC`;
  return rows.map((r) => r.id);
}

import type { CheckLevel } from '@erp/shared';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * A person's check level on a project: kept on their place in the project's team (`ProjectMember.checkLevel`),
 * null when they are not on it or were given none. The one place the level is read.
 */
export async function checkLevelOf(prisma: PrismaService, projectId: string, userId: string): Promise<CheckLevel | null> {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { checkLevel: true } });
  return m?.checkLevel ?? null;
}

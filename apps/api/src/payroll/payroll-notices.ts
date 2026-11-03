import type { NotificationDto, RoleKey } from '@erp/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import type { NotificationsService } from '../notifications/notifications.service';

export interface PayrollNotice {
  /** The roles that act next, company-wide (admins only when nobody holds one) */
  roles?: RoleKey[];
  /** People told whatever their role: who prepared or approved it */
  users?: (string | null | undefined)[];
  title: string;
  body: string;
  projectId?: string | null;
  entityType: NotificationDto['entityType'];
  entityId: string;
  /** The email's link and button (ARCHITECTURE "An email for every action that waits on someone") */
  href: string;
  cta: string;
}

/**
 * Tells whoever acts next on a salary run or a settlement, never the person who acted. Payroll is company-wide, so the
 * role's holders are the company's, not a project team's. A notice that cannot be sent never holds up the step.
 */
export async function tellPayroll(prisma: PrismaService, notifications: NotificationsService, user: RequestUser, n: PayrollNotice): Promise<void> {
  try {
    const holders = n.roles?.length ? await prisma.user.findMany({ where: { organizationId: user.organizationId, isActive: true, role: { key: { in: n.roles } } }, select: { id: true } }) : [];
    const admins = n.roles?.length && !holders.length ? await prisma.user.findMany({ where: { organizationId: user.organizationId, isActive: true, role: { key: 'ADMIN' } }, select: { id: true } }) : [];
    const userIds = [...new Set([...holders, ...admins].map((u) => u.id).concat((n.users ?? []).filter((u): u is string => !!u)))].filter((id) => id !== user.id);
    if (!userIds.length) return;
    await notifications.notify({
      organizationId: user.organizationId,
      userIds,
      type: 'HANDOFF',
      title: n.title,
      body: n.body,
      projectId: n.projectId ?? null,
      entityType: n.entityType,
      entityId: n.entityId,
      email: { href: n.href, cta: n.cta },
    });
  } catch {
    // Nothing to undo: the step is saved and audited either way.
  }
}

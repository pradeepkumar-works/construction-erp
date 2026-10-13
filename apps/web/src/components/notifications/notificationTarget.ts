import type { NotificationDto } from '@erp/shared';

/** Where a notification leads when clicked: a submission drawer on the notifications page, or a page. */
export function notificationHref(n: NotificationDto): string {
  if (n.entityType && n.entityId) return `/notifications?type=${n.entityType}&id=${n.entityId}`;
  if (n.type === 'APPROVAL_DIGEST') return '/approvals';
  if (n.type === 'DPR_REMINDER' && n.projectId) return `/projects/${n.projectId}?tab=dpr`;
  return '/notifications';
}

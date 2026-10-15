import type { NotificationDto } from '@erp/shared';

/** Where a notification leads when clicked: a submission drawer on the notifications page, or a page. */
export function notificationHref(n: NotificationDto): string {
  if (n.type === 'SAFETY') return `/safety?tab=${n.entityType === 'WORK_PERMIT' ? 'permits' : 'incidents'}${n.entityId ? `&id=${n.entityId}` : ''}`;
  if (n.type === 'MACHINERY')
    return n.entityType === 'EQUIPMENT_DOCUMENT' || n.entityType === 'DRIVER' ? '/machinery?tab=papers' : `/machinery?tab=maintenance${n.entityType === 'MAINTENANCE_JOB' && n.entityId ? `&id=${n.entityId}` : ''}`;
  if (n.type === 'IMPREST') return `/imprest${n.entityId ? `?id=${n.entityId}` : ''}`;
  if (n.type === 'COMPLIANCE') return `/compliance${n.entityId ? `?id=${n.entityId}` : ''}`;
  if (n.entityType && n.entityId) return `/notifications?type=${n.entityType}&id=${n.entityId}`;
  if (n.type === 'APPROVAL_DIGEST') return '/approvals';
  if (n.type === 'DPR_REMINDER' && n.projectId) return `/projects/${n.projectId}?tab=dpr`;
  if (n.type === 'RISK_RAISED' && n.entityId) return `/risks?id=${n.entityId}`;
  if ((n.type === 'TEST_DUE' || n.type === 'TEST_FAILED') && n.entityId) return `/inspections?tab=tests&id=${n.entityId}`;
  if (n.type === 'NCR' && n.entityId) return `/inspections?tab=ncrs&id=${n.entityId}`;
  if (n.type === 'DOCUMENT_ISSUED' && n.entityId) return `/documents?id=${n.entityId}`;
  // A bill sent or an inspection requested, for the client's engineer or consultant: their portal opens it.
  if (n.type === 'PORTAL' && n.projectId) return `/portal/${n.projectId}${n.entityId ? `?open=${n.entityId}` : ''}`;
  if (n.type === 'LEAVE' && n.entityId) return `/staff?tab=leave&leave=${n.entityId}`;
  if (n.type === 'BILLS_DUE') return '/payables';
  if (n.type === 'LOW_STOCK' && n.projectId) return `/stock?projectId=${n.projectId}&low=1`;
  return '/notifications';
}

import { commentKindHref, COMMENT_KINDS, type CommentKind, type NotificationDto } from '@erp/shared';
import { COMMENTS_ANCHOR } from '@/components/comments/CommentsSection';

/** Where a notification leads when clicked: a submission drawer on the notifications page, or a page. */
export function notificationHref(n: NotificationDto): string {
  // A mention or a reply (v6 item 116): the record's own page, at its comments.
  if (n.type === 'COMMENT' && n.entityId && (COMMENT_KINDS as readonly string[]).includes(n.entityType ?? '')) return `${commentKindHref(n.entityType as CommentKind, n.entityId)}#${COMMENTS_ANCHOR}`;
  if (n.type === 'SAFETY') return `/safety?tab=${n.entityType === 'WORK_PERMIT' ? 'permits' : 'incidents'}${n.entityId ? `&id=${n.entityId}` : ''}`;
  if (n.type === 'MACHINERY')
    return n.entityType === 'EQUIPMENT_DOCUMENT' || n.entityType === 'DRIVER' ? '/machinery?tab=papers' : `/machinery?tab=maintenance${n.entityType === 'MAINTENANCE_JOB' && n.entityId ? `&id=${n.entityId}` : ''}`;
  if (n.type === 'IMPREST') return `/imprest${n.entityId ? `?id=${n.entityId}` : ''}`;
  if (n.type === 'COMPLIANCE') return `/compliance${n.entityId ? `?id=${n.entityId}` : ''}`;
  if (n.type === 'DEFECT' && n.projectId) return `/projects/${n.projectId}?tab=handover${n.entityType === 'DEFECT' && n.entityId ? `&defect=${n.entityId}` : ''}`;
  if (n.type === 'WATCH_LIST') return '/watch-list';
  // A request for access (launcher phase 3): admins answer it in Admin › Home tiles; the person's answer opens Home.
  if (n.entityType === 'ACCESS_REQUEST') return `/home-tiles${n.entityId ? `?request=${n.entityId}` : ''}`;
  if (n.entityType === 'ACCESS_DECISION') return '/';
  // An RFI: the client's engineer or consultant answers it in their portal; staff open it in Documents.
  if (n.entityType === 'RFI' && n.entityId) return n.type === 'PORTAL' && n.projectId ? `/portal/${n.projectId}?tab=rfis&open=${n.entityId}` : `/documents?tab=rfis&rfi=${n.entityId}`;
  if (n.type === 'MORNING_BRIEF') return '/';
  // The supplier portal (v6 item 105): the supplier's own notices open their pages; the company's open the inbox or the vendor.
  if (n.entityType === 'PORTAL_PO' || n.entityType === 'PORTAL_WO') return `/supplier/orders?open=${n.entityType === 'PORTAL_PO' ? 'po' : 'wo'}:${n.entityId}`;
  if (n.entityType === 'PORTAL_INVOICE') return '/supplier/invoices';
  if (n.entityType === 'PORTAL_CHANGE') return '/supplier/profile';
  if (n.entityType === 'PORTAL_ENQUIRY') return `/supplier/enquiries${n.entityId ? `?open=${n.entityId}` : ''}`;
  if (n.entityType === 'PORTAL_PAYMENT') return '/supplier/statement';
  if (n.entityType === 'SUPPLIER_INVOICE') return `/supplier-inbox${n.entityId ? `?id=${n.entityId}` : ''}`;
  if (n.entityType === 'SUPPLIER_CHANGE') return '/supplier-inbox?tab=changes';
  if (n.entityType === 'MEETING' && n.entityId) return `/meetings/${n.entityId}`;
  if (n.entityType === 'EQUIPMENT_LOAN' && n.entityId) return `/machine-loans/${n.entityId}`;
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
  if (n.type === 'OVERTIME') return '/staff?tab=overtime';
  if (n.type === 'BILLS_DUE') return '/payables';
  if (n.type === 'LOW_STOCK' && n.projectId) return `/stock?projectId=${n.projectId}&low=1`;
  return '/notifications';
}

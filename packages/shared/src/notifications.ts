import type { NotificationType } from './enums';
import { NOTIFICATION_TYPES } from './enums';

/** The notifications drawer's tabs (UI roadmap item 63): what happened to you, what waits on your decision, what falls due. */
export const NOTIFICATION_TABS = ['FOR_ME', 'APPROVALS', 'REMINDERS'] as const;
export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

export const NOTIFICATION_TAB_LABELS: Record<NotificationTab, string> = {
  FOR_ME: 'For me',
  APPROVALS: 'Approvals',
  REMINDERS: 'Reminders',
};

/** Which tab a notification type sits in. Anything not an approval ask or a due-date reminder is "for me". */
export const NOTIFICATION_TAB_OF: Record<NotificationType, NotificationTab> = {
  SUBMISSION_SUBMITTED: 'APPROVALS',
  APPROVAL_DIGEST: 'APPROVALS',
  SUBMISSION_APPROVED: 'FOR_ME',
  SUBMISSION_REJECTED: 'FOR_ME',
  SUBMISSION_CHANGES_REQUESTED: 'FOR_ME',
  RISK_RAISED: 'FOR_ME',
  TEST_FAILED: 'FOR_ME',
  NCR: 'FOR_ME',
  DOCUMENT_ISSUED: 'FOR_ME',
  LEAVE: 'FOR_ME',
  OVERTIME: 'FOR_ME',
  PORTAL: 'FOR_ME',
  SAFETY: 'FOR_ME',
  IMPREST: 'FOR_ME',
  DEFECT: 'FOR_ME',
  DPR_REMINDER: 'REMINDERS',
  LOW_STOCK: 'REMINDERS',
  TEST_DUE: 'REMINDERS',
  BILLS_DUE: 'REMINDERS',
  MACHINERY: 'REMINDERS',
  COMPLIANCE: 'REMINDERS',
  WATCH_LIST: 'REMINDERS',
  MORNING_BRIEF: 'FOR_ME',
};

/**
 * When each type was added, as the version of the type list a client must name (`typesVersion`) to be sent it.
 * Phone builds have no icon for a type newer than they are and crash on it, so `GET /notifications` lists a type
 * only to a client that knows it. Version 1 is what `allTypes` meant before; a new type goes in with the next
 * version, and the web and the phone send the latest.
 */
const NOTIFICATION_TYPE_VERSION: Partial<Record<NotificationType, number>> = { WATCH_LIST: 2, MORNING_BRIEF: 3 };
export const NOTIFICATION_TYPES_VERSION = 3;

/** The types a client that knows version `version` of the list can show. */
export function notificationTypesFor(version: number): NotificationType[] {
  return NOTIFICATION_TYPES.filter((t) => (NOTIFICATION_TYPE_VERSION[t] ?? 1) <= version);
}

/** The notification types in one tab. */
export function notificationTypesIn(tab: NotificationTab): NotificationType[] {
  return NOTIFICATION_TYPES.filter((t) => NOTIFICATION_TAB_OF[t] === tab);
}

import type { AuthUser, SubmissionType } from '@erp/shared';
import { mayApproveTypeAtAll } from '@erp/shared';
import { thisWeek } from '@/lib/listPage';
import type { BuiltInView } from './ListViews';

/**
 * The built-in views every submission list has: All; Waiting for me (approvers of this type, with how many wait in the
 * header's project); Mine; Sent back (to fix and resubmit); This week. Lists add their own after these.
 */
export function standardViews(user: AuthUser | null, type: SubmissionType, waiting?: number): BuiltInView[] {
  return [
    { key: 'all', label: 'All', filters: {} },
    ...(user && mayApproveTypeAtAll(user, type)
      ? [{ key: 'waiting', label: 'Waiting for me', filters: { status: 'SUBMITTED' }, count: waiting, countLabel: 'waiting for you', attention: true }]
      : []),
    { key: 'mine', label: 'Mine', filters: { mine: '1' } },
    { key: 'sent-back', label: 'Sent back', filters: { status: 'CHANGES_REQUESTED' } },
    { key: 'week', label: 'This week', filters: thisWeek() },
  ];
}

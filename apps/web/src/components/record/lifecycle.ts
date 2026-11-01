import type { SubmissionBase } from '@erp/shared';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Stage, StageBarProps } from './StageBar';

/** A stage after approval (sent, certified, paid; received), done or still to come. */
export interface LaterStage {
  title: string;
  done: boolean;
  /** When or how far, shown under the title. */
  content?: string;
}

/** The stage bar's props (`StageBar`): where the entry is, how that stage stands, and the stages. */
export interface Lifecycle {
  current: number;
  status: NonNullable<StageBarProps['status']>;
  items: Stage[];
}

const who = (name: string | null, at: string | null) => [name, at ? formatDateTime(at) : null].filter(Boolean).join(', ');

/**
 * Where a submission stands, for the stage bar on its page: drafted, submitted, the review, then
 * whatever comes after approval for its type. A rejected or sent-back entry stops, in red, at the review.
 */
export function submissionLifecycle(s: SubmissionBase, later: LaterStage[] = []): Lifecycle {
  const review =
    s.status === 'APPROVED'
      ? 'Approved'
      : s.status === 'REJECTED'
        ? 'Rejected'
        : s.status === 'CHANGES_REQUESTED'
          ? 'Changes requested'
          : 'Approval';
  const items: Lifecycle['items'] = [
    { title: 'Draft', content: !s.submittedAt || s.createdAt <= s.submittedAt ? `Created ${formatDate(s.createdAt)}` : undefined },
    { title: 'Submitted', content: s.submittedAt ? who(s.submittedByName, s.submittedAt) : undefined },
    {
      title: review,
      content: s.reviewedAt ? who(s.reviewedByName, s.reviewedAt) : s.status === 'SUBMITTED' ? 'Waiting' : undefined,
    },
    ...later.map((l) => ({ title: l.title, content: l.content })),
  ];
  if (s.status === 'DRAFT') return { current: 0, status: 'process', items };
  if (s.status === 'SUBMITTED') return { current: 2, status: 'process', items };
  if (s.status !== 'APPROVED') return { current: 2, status: 'error', items };
  const next = later.findIndex((l) => !l.done);
  return next === -1 ? { current: items.length - 1, status: 'finish', items } : { current: 3 + next, status: 'process', items };
}

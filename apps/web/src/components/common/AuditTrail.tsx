'use client';

import React from 'react';
import { Button, Timeline, Typography, Skeleton } from 'antd';
import { tk } from '@/ds';
import { auditActionLabel, type SubmissionBase } from '@erp/shared';
import { useAudit, type ApprovalTypeParam } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';

const COLORS: Record<string, string> = {
  CREATED: 'gray',
  SUBMITTED: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  CHANGES_REQUESTED: 'purple',
  RESUBMITTED: 'orange',
  UPDATED: 'blue',
  DELETED: 'red',
};

interface TrailEntry {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  note: string | null;
}

/**
 * What the submission's own columns say happened, newest first, for an entry with no audit log (one made before the log
 * existed, or seeded): a page that shows "Submitted" in its stage bar should not say there is no history.
 */
export function submissionTrail(s: SubmissionBase): TrailEntry[] {
  const out: TrailEntry[] = [];
  if (s.reviewedAt && (s.status === 'APPROVED' || s.status === 'REJECTED' || s.status === 'CHANGES_REQUESTED'))
    out.push({ id: 'reviewed', action: s.status, actorName: s.reviewedByName ?? 'the approver', createdAt: s.reviewedAt, note: s.reviewNote });
  if (s.submittedAt) out.push({ id: 'submitted', action: 'SUBMITTED', actorName: s.submittedByName, createdAt: s.submittedAt, note: null });
  else out.push({ id: 'created', action: 'CREATED', actorName: s.submittedByName, createdAt: s.createdAt, note: null });
  return out;
}

export function AuditTrail({ type, id, submission }: { type: ApprovalTypeParam; id: string | undefined; submission?: SubmissionBase }) {
  const { data, isLoading, error, refetch } = useAudit(type, id);
  if (isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
  // A history that failed to load is not "no history yet": say so, falling back to the entry's own dates when there are any.
  const failed = !!error && !data;
  if (failed && !submission) return <QueryError error={error} onRetry={() => void refetch()} />;
  const entries: TrailEntry[] = data && data.length > 0 ? data : submission ? submissionTrail(submission) : [];
  if (entries.length === 0) return <Typography.Text type="secondary">No history yet.</Typography.Text>;
  const timeline = (
    <Timeline
      items={entries.map((log) => ({
        key: log.id,
        color: COLORS[log.action] ?? 'blue',
        content: (
          <div>
            <div>
              <Typography.Text strong>{auditActionLabel(log.action)}</Typography.Text>{' '}
              <Typography.Text type="secondary">by {log.actorName}</Typography.Text>
            </div>
            <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
              {formatDateTime(log.createdAt)}
            </div>
            {log.note && <div style={{ marginTop: tk.space.half }}>&ldquo;{log.note}&rdquo;</div>}
          </div>
        ),
      }))}
    />
  );
  if (!failed) return timeline;
  return (
    <>
      <Typography.Paragraph type="secondary">
        The full history could not load; these are the entry&apos;s own dates.{' '}
        <Button type="link" size="small" onClick={() => void refetch()} style={{ padding: 0 }}>
          Try again
        </Button>
      </Typography.Paragraph>
      {timeline}
    </>
  );
}

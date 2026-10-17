'use client';

import React from 'react';
import { Timeline, Typography, Skeleton } from 'antd';
import type { SubmissionBase } from '@erp/shared';
import { useAudit, type ApprovalTypeParam } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';

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

/** "CHANGES_REQUESTED" reads "Changes requested". */
export const auditActionLabel = (action: string) => {
  const words = action.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
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
  const { data, isLoading } = useAudit(type, id);
  if (isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
  const entries: TrailEntry[] = data && data.length > 0 ? data : submission ? submissionTrail(submission) : [];
  if (entries.length === 0) return <Typography.Text type="secondary">No history yet.</Typography.Text>;
  return (
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
            <div className="text-muted" style={{ fontSize: 12 }}>
              {formatDateTime(log.createdAt)}
            </div>
            {log.note && <div style={{ marginTop: 2 }}>&ldquo;{log.note}&rdquo;</div>}
          </div>
        ),
      }))}
    />
  );
}

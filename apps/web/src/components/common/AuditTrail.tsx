'use client';

import React from 'react';
import { Timeline, Typography, Skeleton } from 'antd';
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

export function AuditTrail({ type, id }: { type: ApprovalTypeParam; id: string | undefined }) {
  const { data, isLoading } = useAudit(type, id);
  if (isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (!data || data.length === 0) return <Typography.Text type="secondary">No audit records.</Typography.Text>;
  return (
    <Timeline
      items={data.map((log) => ({
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

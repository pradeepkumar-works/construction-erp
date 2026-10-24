'use client';

import React from 'react';
import { Flex, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CheckOutlined, ClockCircleOutlined, RiseOutlined } from '@/components/common/icons';
import { formatDateTime } from '@/lib/format';
import { useApprovalStage, type ApprovalTypeParam } from '@/lib/queries';

/**
 * Under a record's stage bar (v5 item 94): the approval levels the entry needs, who approved each so far, whose queue
 * it is in and since when (Waiting with others), whether it was escalated, and why this user cannot decide it now.
 * Nothing shows for an entry with one level that is not waiting.
 */
export function ApprovalLevels({ type, id }: { type: ApprovalTypeParam; id: string }) {
  const { token } = theme.useToken();
  const { data } = useApprovalStage(type, id);
  if (!data) return null;
  const waiting = data.status === 'SUBMITTED';
  const approvedAt = new Map(data.steps.filter((s) => s.action === 'APPROVED').map((s) => [s.level, s]));
  if (data.levels <= 1 && !waiting) return null;
  const levels = Array.from({ length: data.levels }, (_, i) => i + 1);

  return (
    <Flex vertical gap={token.marginXXS} style={{ marginTop: token.marginXS }} data-testid="approval-levels">
      {data.levels > 1 && (
        <Flex wrap gap={token.marginXS} align="center" role="list" aria-label="Approval levels">
          {levels.map((l) => {
            const step = approvedAt.get(l);
            return (
              <span role="listitem" key={l}>
                {step ? (
                  <AppTag tone="success" icon={<CheckOutlined />} style={{ margin: 0 }}>
                    Level {l}: {step.byName ?? 'approved'}, {formatDateTime(step.at)}
                  </AppTag>
                ) : waiting && l === data.level ? (
                  <AppTag tone="pending" icon={<ClockCircleOutlined />} style={{ margin: 0 }}>
                    Level {l}: waiting
                  </AppTag>
                ) : (
                  <AppTag style={{ margin: 0 }}>Level {l}</AppTag>
                )}
              </span>
            );
          })}
        </Flex>
      )}
      {waiting && (
        <Typography.Text type="secondary">
          {data.waitingWith.length ? (
            <>
              Waiting with <span translate="no">{data.waitingWith.join(', ')}</span>
            </>
          ) : (
            'No role approves this level yet: set one on Approval rules'
          )}
          {data.waitingSince ? ` since ${formatDateTime(data.waitingSince)}` : ''}
          {data.escalated ? (
            <AppTag tone="pending" icon={<RiseOutlined />} style={{ marginInlineStart: token.marginXS }}>
              Escalated
            </AppTag>
          ) : null}
        </Typography.Text>
      )}
      {data.reason && <Typography.Text type="secondary">You cannot decide it now. {data.reason}</Typography.Text>}
    </Flex>
  );
}

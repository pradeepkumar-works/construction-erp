'use client';

import React from 'react';
import Link from 'next/link';
import { Badge, Button, Empty, Flex, Popover, Skeleton, Typography, theme } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import type { ReviewedItemDto } from '@erp/shared';
import { useReviewedToday } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { recordPage } from './queue';
import { RecordLink } from '@/components/record/RecordLink';

/** "Reviewed today": what this user approved, rejected or sent back since midnight, newest first. */
export function ReviewedToday({ onOpen }: { onOpen: (item: ReviewedItemDto) => void }) {
  const { token } = theme.useToken();
  const { data, isLoading } = useReviewedToday();
  const approved = (data ?? []).filter((r) => r.decision === 'APPROVED').length;

  const content = (
    <div style={{ width: 380, maxWidth: '80vw', maxHeight: 420, overflowY: 'auto' }}>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : !data?.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing reviewed yet today" />
      ) : (
        <ul aria-label="Reviewed today" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.map((r) => {
            const href = recordPage(r.type, r.id);
            return (
              <li key={`${r.type}:${r.id}:${r.reviewedAt}`} style={{ padding: `${token.paddingXS}px 0`, borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` }}>
                <Flex gap={token.marginXS} align="baseline" justify="space-between">
                  {href ? (
                    <Link href={href} className="text-link" style={{ minWidth: 0 }}>
                      <Typography.Text ellipsis style={{ color: 'inherit' }}>
                        {r.title}
                      </Typography.Text>
                    </Link>
                  ) : (
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <RecordLink onOpen={() => onOpen(r)}>{r.title}</RecordLink>
                    </span>
                  )}
                  <StatusTag status={r.decision} />
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {r.projectName} · {formatDateTime(r.reviewedAt)}
                  {r.note ? ` · "${r.note}"` : ''}
                </Typography.Text>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomRight" title="Reviewed today" content={content}>
      <Button icon={<HistoryOutlined />}>
        Approved today{' '}
        <Badge count={approved} showZero color={approved ? token.colorSuccess : token.colorTextQuaternary} style={{ boxShadow: 'none' }} />
      </Button>
    </Popover>
  );
}

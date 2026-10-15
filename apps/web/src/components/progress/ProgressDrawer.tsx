'use client';

import React from 'react';
import { Descriptions, Divider, Drawer, Skeleton, Space, Typography } from 'antd';
import type { ProgressEntryDto } from '@erp/shared';
import { sectorLocation } from '@erp/shared';
import { useProgressEntry } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';

export function ProgressDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (entry: ProgressEntryDto) => void }) {
  const { data, isLoading, error, refetch } = useProgressEntry(id ?? undefined);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={640}
      title={
        data ? (
          <span>
            Progress entry · {data.activityName} <StatusTag status={data.status} />
          </span>
        ) : (
          'Progress entry'
        )
      }
      extra={
        data ? (
          <Space wrap>
            <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
            <ReviewActions type="progress" id={data.id} status={data.status} size="small" />
          </Space>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'date', label: 'Date', children: formatDate(data.date) },
              { key: 'qty', label: 'Quantity', children: `${formatQty(data.quantity)} ${data.unit}` },
              { key: 'activity', label: 'Activity', children: data.activityName, span: 2 },
              { key: 'location', label: 'Location / Chainage', children: [data.location, sectorLocation(data)].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') || '-' },
              { key: 'manpower', label: 'Manpower', children: data.manpowerCount ?? '-' },
              { key: 'machinery', label: 'Machinery used', children: data.machineryUsed ?? '-', span: 2 },
              { key: 'remarks', label: 'Remarks', children: data.remarks ?? '-', span: 2 },
              ...submissionMetaItems(data).filter((i) => i.key !== 'status').map((i) => ({ ...i, span: 2 })),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Photos ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            Audit trail
          </Divider>
          <AuditTrail type="progress" id={data.id} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Entry ID: {data.id}
          </Typography.Text>
        </>
      )}
    </Drawer>
  );
}

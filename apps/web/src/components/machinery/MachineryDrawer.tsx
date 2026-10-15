'use client';

import React from 'react';
import { Descriptions, Divider, Drawer, Skeleton, Space, Typography } from 'antd';
import type { MachineryLogDto } from '@erp/shared';
import { EQUIPMENT_OWNERSHIP_LABELS } from '@erp/shared';
import { useMachineryLog } from '@/lib/queries';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';

const h = (v: string) => `${formatQty(v)} h`;

export function MachineryDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (log: MachineryLogDto) => void }) {
  const { data, isLoading, error, refetch } = useMachineryLog(id ?? undefined);
  const meterRun = data?.meterStart !== null && data?.meterEnd !== null && data ? toNumber(data.meterEnd) - toNumber(data.meterStart) : null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={640}
      title={
        data ? (
          <span>
            Machinery log · {data.equipmentCode} <StatusTag status={data.status} />
          </span>
        ) : (
          'Machinery log'
        )
      }
      extra={
        data ? (
          <Space wrap>
            <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
            <ReviewActions type="machinery" id={data.id} status={data.status} size="small" />
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
              { key: 'eq', label: 'Equipment', children: `${data.equipmentCode} ${data.equipmentName} (${EQUIPMENT_OWNERSHIP_LABELS[data.ownership].toLowerCase()})`, span: 2 },
              { key: 'date', label: 'Date', children: formatDate(data.date) },
              { key: 'op', label: 'Operator', children: data.operatorName ?? '-' },
              { key: 'worked', label: 'Hours worked', children: h(data.hoursWorked) },
              { key: 'idle', label: 'Idle', children: h(data.idleHours) },
              { key: 'down', label: 'Breakdown', children: h(data.breakdownHours) },
              { key: 'diesel', label: 'Diesel', children: data.dieselLitres === null ? '-' : `${formatQty(data.dieselLitres)} L` },
              {
                key: 'meter',
                label: 'Hour meter',
                children: data.meterStart === null && data.meterEnd === null ? '-' : `${data.meterStart ?? '?'} → ${data.meterEnd ?? '?'}${meterRun !== null ? ` (${formatQty(meterRun)})` : ''}`,
                span: 2,
              },
              { key: 'activity', label: 'Activity', children: data.activityName ?? '-', span: 2 },
              { key: 'work', label: 'Work done', children: data.workDone ?? '-', span: 2 },
              ...(data.breakdownNote ? [{ key: 'bn', label: 'Breakdown', children: data.breakdownNote, span: 2 }] : []),
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
          <AuditTrail type="machinery" id={data.id} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Log ID: {data.id}
          </Typography.Text>
        </>
      )}
    </Drawer>
  );
}

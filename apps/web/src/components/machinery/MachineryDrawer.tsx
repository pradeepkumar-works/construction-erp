'use client';

import React from 'react';
import { Typography } from 'antd';
import type { MachineryLogDto } from '@erp/shared';
import { EQUIPMENT_OWNERSHIP_LABELS } from '@erp/shared';
import { useMachineryLog } from '@/lib/queries';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';

const h = (v: string) => `${formatQty(v)} h`;

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (log: MachineryLogDto) => void;
}

/** A day's machinery log, in a drawer from a list or as its own page at `/machinery/<id>`. */
export function MachineryRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch } = useMachineryLog(id ?? undefined);
  const meterRun = data && data.meterStart !== null && data.meterEnd !== null ? toNumber(data.meterEnd) - toNumber(data.meterStart) : null;
  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={640}
      kind="Machinery log"
      list={{ href: '/machinery', label: 'Machinery' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/machinery/${data.id}`,
          title: `Machinery log · ${data.equipmentCode}`,
          tags: <StatusTag status={data.status} />,
          facts: [
            { key: 'eq', label: 'Equipment', children: `${data.equipmentCode} ${data.equipmentName} (${EQUIPMENT_OWNERSHIP_LABELS[data.ownership].toLowerCase()})` },
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
            },
            { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
            ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
          ],
          lifecycle: submissionLifecycle(data),
          sections: [
            ...(data.workDone ? [{ key: 'work', title: 'Work done', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.workDone}</div> }] : []),
            ...(data.breakdownNote ? [{ key: 'breakdown', title: 'Breakdown', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.breakdownNote}</div> }] : []),
            ...(data.remarks ? [{ key: 'remarks', title: 'Remarks', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</div> }] : []),
            {
              key: 'photos',
              title: 'Photos',
              count: data.attachments.length,
              children: (
                <>
                  <AttachmentGallery attachments={data.attachments} />
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    Log ID: {data.id}
                  </Typography.Text>
                </>
              ),
            },
          ],
          activity: { type: 'machinery', id: data.id },
          actions: (size) => (
            <>
              <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              <ReviewActions type="machinery" id={data.id} status={data.status} size={size} />
            </>
          ),
        }
      }
    />
  );
}

export function MachineryDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <MachineryRecord mode="drawer" {...props} />;
}

'use client';

import React from 'react';
import Link from 'next/link';
import { Typography } from 'antd';
import type { MachineryLogDto } from '@erp/shared';
import { EQUIPMENT_OWNERSHIP_LABELS, distanceText, hoursAboveEngine } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { useMachineryLog } from '@/lib/queries';
import { formatDate, formatQty, toNumber, inSentence, NO_VALUE } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { tk } from '@/ds';

const h = (v: string) => `${formatQty(v)} h`;

/** What the machine's tracker read that day, and a flag when the log's hours are above it. */
function EngineFact({ log }: { log: MachineryLogDto }) {
  const e = log.engine!;
  const above = hoursAboveEngine(toNumber(log.hoursWorked) + toNumber(log.idleHours), toNumber(e.engineHours));
  return (
    <span>
      {`${h(e.engineHours)}${e.idleHours !== null ? `, ${h(e.idleHours)} idle` : ''}${e.meterStart !== null ? `, meter ${formatQty(e.meterStart)} → ${formatQty(e.meterEnd ?? e.meterStart)}` : ''}`}
      {above !== null || (e.outsideSite && e.farthestM !== null) ? (
        <span style={{ display: 'flex', gap: tk.space[1], flexWrap: 'wrap', marginTop: tk.space[1] }}>
          {above !== null ? <AppTag meaning="failed">{`Log ${formatQty(above)} h above the engine`}</AppTag> : null}
          {e.outsideSite && e.farthestM !== null ? <AppTag meaning="waiting">{`${distanceText(e.farthestM)} from the site`}</AppTag> : null}
        </span>
      ) : null}
    </span>
  );
}

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
          title: `${formatDate(data.date)} · ${data.equipmentCode}`,
          tags: <StatusTag status={data.status} />,
          context: { label: data.projectName, href: `/projects/${data.projectId}` },
          facts: [
            { key: 'eq', label: 'Equipment', children: `${data.equipmentCode} ${data.equipmentName} (${inSentence(EQUIPMENT_OWNERSHIP_LABELS[data.ownership])})` },
            { key: 'worked', label: 'Hours worked', children: h(data.hoursWorked) },
            { key: 'idle', label: 'Idle', children: h(data.idleHours) },
            { key: 'down', label: 'Breakdown', children: h(data.breakdownHours) },
            { key: 'diesel', label: 'Fuel filled', children: data.dieselLitres === null ? NO_VALUE : `${formatQty(data.dieselLitres)} L` },
            ...(data.fuelIssuedLitres ? [{ key: 'fuel', label: 'Fuel issue', children: `${formatQty(data.fuelIssuedLitres)} L from the store` }] : []),
            {
              key: 'meter',
              label: 'Hour meter',
              children: data.meterStart === null && data.meterEnd === null ? NO_VALUE : `${data.meterStart ?? '?'} → ${data.meterEnd ?? '?'}${meterRun !== null ? ` (${formatQty(meterRun)})` : ''}`,
            },
            ...(data.engine ? [{ key: 'engine', label: 'Engine (tracker)', children: <EngineFact log={data} /> }] : []),
            ...(data.activityName ? [{ key: 'activity', label: 'Activity', children: data.activityName }] : []),
            ...(data.vendorBillId ? [{ key: 'bill', label: 'Billed on', children: <Link href={`/vendor-bills/${data.vendorBillId}`} className="mono">{data.vendorBillNo}</Link> }] : []),
            ...submissionMetaItems(data),
          ],
          details: data.operatorName ? [{ key: 'op', label: 'Operator', children: data.operatorName }] : [],
          lifecycle: submissionLifecycle(data),
          sections: [
            ...(data.workDone ? [{ key: 'work', title: 'Work done', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.workDone}</div> }] : []),
            ...(data.breakdownNote ? [{ key: 'breakdown', title: 'Breakdown', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.breakdownNote}</div> }] : []),
            ...(data.remarks ? [{ key: 'remarks', title: 'Remarks', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</div> }] : []),
            {
              key: 'photos',
              title: 'Photos',
              count: data.attachments.length,
              empty: data.attachments.length === 0,
              children: (
                <>
                  <AttachmentGallery attachments={data.attachments} />
                  <Typography.Text type="secondary" style={{ display: 'block', ...tk.type.caption }}>
                    Log ID: {data.id}
                  </Typography.Text>
                </>
              ),
            },
          ],
          activity: { type: 'machinery', id: data.id, submission: data },
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

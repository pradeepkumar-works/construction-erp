'use client';

import React from 'react';
import Link from 'next/link';
import type { ProgressEntryDto } from '@erp/shared';
import { sectorLocation, unitLabel } from '@erp/shared';
import { useProgressEntry } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { photosSection } from '@/components/photo-checks/PhotoChecksSection';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { LinkButton } from '@/components/common/LinkButton';

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (entry: ProgressEntryDto) => void;
}

/** A progress entry, in a drawer from a list or as its own page at `/progress/<id>`. */
export function ProgressRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch } = useProgressEntry(id ?? undefined);
  const where = data ? [data.location, sectorLocation(data)].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') : '';
  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={640}
      kind="Progress entry"
      list={{ href: '/progress', label: 'Progress entries' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/progress/${data.id}`,
          title: `Progress entry · ${data.activityName}`,
          tags: <StatusTag status={data.status} />,
          context: { label: data.projectName, href: `/projects/${data.projectId}` },
          facts: [
            { key: 'qty', label: 'Quantity', children: <span translate="no">{`${formatQty(data.quantity)} ${unitLabel(data.unit)}`}</span> },
            { key: 'date', label: 'Date', children: formatDate(data.date) },
            ...(data.dailyReportId ? [{ key: 'dpr', label: 'Daily report', children: <Link href={`/dpr/${data.dailyReportId}`}>DPR of {formatDate(data.date)}</Link> }] : []),
            ...(where ? [{ key: 'location', label: 'Location / chainage', children: where }] : []),
            ...(data.manpowerCount !== null ? [{ key: 'manpower', label: 'Labour', children: data.manpowerCount }] : []),
            ...(data.machineryUsed ? [{ key: 'machinery', label: 'Machines used', children: data.machineryUsed }] : []),
            ...submissionMetaItems(data),
          ],
          lifecycle: submissionLifecycle(data),
          sections: [
            ...(data.remarks ? [{ key: 'remarks', title: 'Remarks', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</div> }] : []),
            photosSection('progress', data.id, data.attachments),
          ],
          activity: { type: 'progress', id: data.id, submission: data },
          // A DPR's work line is changed and decided in its DPR.
          actions: (size) =>
            data.dailyReportId ? (
              <LinkButton href={`/dpr/${data.dailyReportId}`} size={size}>
                Open the DPR
              </LinkButton>
            ) : (
              <>
                <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
                <ReviewActions type="progress" id={data.id} status={data.status} size={size} />
              </>
            ),
        }
      }
    />
  );
}

export function ProgressDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <ProgressRecord mode="drawer" {...props} />;
}

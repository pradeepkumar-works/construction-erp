'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { theme } from 'antd';
import type { ProgressEntryDto, ProgressSortField } from '@erp/shared';
import { formatDate, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import type { ListColumn } from '@/components/list/DataTable';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';
import { unitLabel } from '@erp/shared';

function ActivityCell({ row, onOpen }: { row: ProgressEntryDto; onOpen: (id: string) => void }) {
  const { token } = theme.useToken();
  return (
    <div>
      <RecordLink href={`/progress/${row.id}`} onOpen={() => onOpen(row.id)}>{row.activityName}</RecordLink>
      {row.location && <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{row.location}</div>}
    </div>
  );
}

/** A DPR work line's menu: open it, or its DPR, where it is changed and decided. */
function DprLineActions({ row, onOpen }: { row: ProgressEntryDto; onOpen: (id: string) => void }) {
  const router = useRouter();
  return <RowActions type="progress" row={row} href={`/progress/${row.id}`} onOpen={onOpen} review={false} extra={[{ key: 'dpr', label: 'Open the DPR', onClick: () => router.push(`/dpr/${row.dailyReportId}`) }]} />;
}

/** The progress list's columns; keys of sortable ones are the API's sort fields. */
export function progressColumns({
  showProject,
  onOpen,
  onEdit,
  sortOrderFor,
}: {
  showProject?: boolean;
  onOpen: (id: string) => void;
  /** Opens the form in edit & resubmit mode; offered only for entries the user may resubmit. */
  onEdit?: (row: ProgressEntryDto) => void;
  sortOrderFor: (key: ProgressSortField) => 'ascend' | 'descend' | null;
}): ListColumn<ProgressEntryDto>[] {
  const sort = (key: ProgressSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { card: 'date', title: 'Date', dataIndex: 'date', width: 120, render: (v) => formatDate(v), ...sort('date') },
    ...(showProject
      ? [{ card: 'meta' as const, cardText: (r: ProgressEntryDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 220, ellipsis: true, render: (v: string, r: ProgressEntryDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    { card: 'title', cardText: (r) => r.activityName, title: 'Activity', locked: true, ...sort('activity'), render: (_, r) => <ActivityCell row={r} onOpen={onOpen} /> },
    { card: 'amount', title: 'Quantity', ...sort('quantity'), width: 130, align: 'right', className: 'mono', render: (_, r) => `${formatQty(r.quantity)} ${unitLabel(r.unit)}` },
    { defaultFrom: 1600, key: 'manpower', title: 'Labour', dataIndex: 'manpowerCount', width: 110, align: 'right', render: (v) => v ?? '-', total: (rows) => rows.reduce((n, r) => n + (r.manpowerCount ?? 0), 0) },
    { defaultFrom: 1600, key: 'photos', title: 'Photos', dataIndex: 'attachments', width: 130, render: (a) => <PhotoThumbs attachments={a} /> },
    { defaultFrom: 1400, card: 'meta', title: 'Submitted by', dataIndex: 'submittedByName', width: 150, ellipsis: true, ...sort('submittedBy') },
    { title: 'Submitted on', dataIndex: 'submittedAt', width: 130, defaultHidden: true, render: (v) => (v ? formatDate(v) : '-'), ...sort('submittedAt') },
    { card: 'status', title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 150, render: (s) => <StatusTag status={s} />, ...sort('status') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) =>
        // A DPR's work line is changed and decided in its DPR.
        r.dailyReportId ? (
          <DprLineActions row={r} onOpen={onOpen} />
        ) : (
          <RowActions type="progress" row={r} href={`/progress/${r.id}`} onOpen={onOpen} onEdit={onEdit} />
        ) },
  ];
}

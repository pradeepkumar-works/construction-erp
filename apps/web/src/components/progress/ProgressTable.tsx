'use client';

import React from 'react';
import Link from 'next/link';
import { Typography, theme } from 'antd';
import type { ProgressEntryDto, ProgressSortField } from '@erp/shared';
import { formatDate, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import type { ListColumn } from '@/components/list/DataTable';
import { RowActions } from '@/components/list/RowActions';

function ActivityCell({ row, onOpen }: { row: ProgressEntryDto; onOpen: (id: string) => void }) {
  const { token } = theme.useToken();
  return (
    <div>
      <Typography.Link onClick={() => onOpen(row.id)}>{row.activityName}</Typography.Link>
      {row.location && <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{row.location}</div>}
    </div>
  );
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
    { title: 'Date', dataIndex: 'date', width: 120, render: (v) => formatDate(v), ...sort('date') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 220, ellipsis: true, render: (v: string, r: ProgressEntryDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    { title: 'Activity', locked: true, ...sort('activity'), render: (_, r) => <ActivityCell row={r} onOpen={onOpen} /> },
    { title: 'Quantity', ...sort('quantity'), width: 130, align: 'right', className: 'mono', render: (_, r) => `${formatQty(r.quantity)} ${r.unit}` },
    { key: 'manpower', title: 'Manpower', dataIndex: 'manpowerCount', width: 110, align: 'right', render: (v) => v ?? '-', total: (rows) => rows.reduce((n, r) => n + (r.manpowerCount ?? 0), 0) },
    { key: 'photos', title: 'Photos', dataIndex: 'attachments', width: 130, render: (a) => <PhotoThumbs attachments={a} /> },
    { title: 'Submitted by', dataIndex: 'submittedByName', width: 150, ellipsis: true, ...sort('submittedBy') },
    { title: 'Submitted on', dataIndex: 'submittedAt', width: 130, defaultHidden: true, render: (v) => (v ? formatDate(v) : '-'), ...sort('submittedAt') },
    { title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 150, render: (s) => <StatusTag status={s} />, ...sort('status') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="progress" row={r} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}

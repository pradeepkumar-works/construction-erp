'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ProgressEntryDto, ProgressSortField } from '@erp/shared';
import { formatDate, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';

export function ProgressTable({
  data,
  loading,
  showProject,
  onOpen,
  onEdit,
  table,
  sortOrderFor,
}: {
  data: ProgressEntryDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (id: string) => void;
  /** Opens the form in edit & resubmit mode; the button shows only for entries the user may resubmit. */
  onEdit?: (row: ProgressEntryDto) => void;
  /** Server-side paging and sort (from useListState). */
  table: Pick<TableProps<ProgressEntryDto>, 'pagination' | 'onChange'>;
  sortOrderFor: (key: ProgressSortField) => 'ascend' | 'descend' | null;
}) {
  const sort = (key: ProgressSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<ProgressEntryDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 220, ellipsis: true, render: (v: string, r: ProgressEntryDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      title: 'Activity',
      dataIndex: 'activityName',
      ...sort('activity'),
      render: (v, r) => (
        <div>
          <Typography.Link onClick={() => onOpen(r.id)}>{v}</Typography.Link>
          {r.location && (
            <div className="text-muted" style={{ fontSize: 12 }}>
              {r.location}
            </div>
          )}
        </div>
      ),
    },
    { title: 'Quantity', ...sort('quantity'), width: 120, align: 'right', className: 'mono', render: (_, r) => `${formatQty(r.quantity)} ${r.unit}` },
    { title: 'Manpower', dataIndex: 'manpowerCount', width: 90, align: 'center', render: (v) => v ?? '-' },
    { title: 'Photos', dataIndex: 'attachments', width: 130, render: (a) => <PhotoThumbs attachments={a} /> },
    { title: 'Submitted by', dataIndex: 'submittedByName', width: 140, ...sort('submittedBy') },
    { title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 140, render: (s) => <StatusTag status={s} />, ...sort('status') },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 190,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" onClick={() => onOpen(r.id)}>
            View
          </Button>
          <ReviewActions type="progress" id={r.id} status={r.status} size="small" compact />
          <EditResubmitButton entry={r} onEdit={onEdit} size="small" compact />
        </div>
      ),
    },
  ];
  return (
    <Table<ProgressEntryDto>
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={data}
      size="middle"
      {...table}
      scroll={{ x: showProject ? 1400 : 1200 }}
    />
  );
}

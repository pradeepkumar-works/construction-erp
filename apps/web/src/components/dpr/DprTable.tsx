'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { DailyReportDto, DprSortField } from '@erp/shared';
import { WEATHER_LABELS } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';

export function DprTable({
  data,
  loading,
  showProject,
  onOpen,
  onEdit,
  table,
  sortOrderFor,
}: {
  data: DailyReportDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (id: string) => void;
  /** Opens the form in edit & resubmit mode; the button shows only for entries the user may resubmit. */
  onEdit?: (row: DailyReportDto) => void;
  /** Server-side paging and sort (from useListState). */
  table: Pick<TableProps<DailyReportDto>, 'pagination' | 'onChange'>;
  sortOrderFor: (key: DprSortField) => 'ascend' | 'descend' | null;
}) {
  const sort = (key: DprSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<DailyReportDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v, r) => <Typography.Link onClick={() => onOpen(r.id)}>{formatDate(v)}</Typography.Link>, ...sort('date') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 220, ellipsis: true, render: (v: string, r: DailyReportDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    { title: 'Weather', dataIndex: 'weather', width: 100, render: (w) => (w ? <Tag style={{ margin: 0 }}>{WEATHER_LABELS[w as keyof typeof WEATHER_LABELS] ?? w}</Tag> : '-') },
    { title: 'Work executed', dataIndex: 'workExecuted', ellipsis: true },
    { title: 'Manpower', dataIndex: 'totalManpower', width: 100, align: 'center' },
    { title: 'Machinery', key: 'mach', width: 100, align: 'center', render: (_, r) => r.machinery.length },
    { title: 'Photos', dataIndex: 'attachments', width: 140, render: (a) => <PhotoThumbs attachments={a} /> },
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
          <ReviewActions type="dpr" id={r.id} status={r.status} size="small" compact />
          <EditResubmitButton entry={r} onEdit={onEdit} size="small" compact />
        </div>
      ),
    },
  ];
  return (
    <Table<DailyReportDto>
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

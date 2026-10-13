'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ProgressEntryDto } from '@erp/shared';
import { formatDate, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';

export function ProgressTable({
  data,
  loading,
  showProject,
  onOpen,
}: {
  data: ProgressEntryDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (id: string) => void;
}) {
  const columns: TableProps<ProgressEntryDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v), sorter: (a, b) => a.date.localeCompare(b.date), defaultSortOrder: 'descend' },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', key: 'project', width: 220, ellipsis: true, render: (v: string, r: ProgressEntryDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      title: 'Activity',
      dataIndex: 'activityName',
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
    { title: 'Quantity', key: 'qty', width: 120, align: 'right', className: 'mono', render: (_, r) => `${formatQty(r.quantity)} ${r.unit}` },
    { title: 'Manpower', dataIndex: 'manpowerCount', width: 90, align: 'center', render: (v) => v ?? '-' },
    { title: 'Photos', dataIndex: 'attachments', width: 130, render: (a) => <PhotoThumbs attachments={a} /> },
    { title: 'Submitted by', dataIndex: 'submittedByName', width: 140 },
    { title: 'Status', dataIndex: 'status', width: 140, render: (s) => <StatusTag status={s} /> },
    {
      title: '',
      key: 'actions',
      width: 190,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" onClick={() => onOpen(r.id)}>
            View
          </Button>
          <ReviewActions type="progress" id={r.id} status={r.status} size="small" compact />
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
      pagination={{ pageSize: 15, hideOnSinglePage: true }}
      scroll={{ x: showProject ? 1250 : 1050 }}
    />
  );
}

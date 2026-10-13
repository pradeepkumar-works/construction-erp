'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { MaterialRequestDto } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { PriorityTag, StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';

export function MrTable({
  data,
  loading,
  showProject,
  onOpen,
  onEdit,
}: {
  data: MaterialRequestDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (id: string) => void;
  /** Opens the form in edit & resubmit mode; the button shows only for entries the user may resubmit. */
  onEdit?: (row: MaterialRequestDto) => void;
}) {
  const columns: TableProps<MaterialRequestDto>['columns'] = [
    { title: 'Request No.', dataIndex: 'requestNo', width: 140, render: (v, r) => <Typography.Link onClick={() => onOpen(r.id)}>{v}</Typography.Link> },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', key: 'project', width: 220, ellipsis: true, render: (v: string, r: MaterialRequestDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      title: 'Items',
      key: 'items',
      render: (_, r) => (
        <div>
          {r.items.slice(0, 3).map((i) => (
            <div key={i.id} style={{ fontSize: 13 }}>
              {i.itemName} <span className="text-muted">· {i.quantity} {i.unit}</span>
            </div>
          ))}
          {r.items.length > 3 && <span className="text-muted">+{r.items.length - 3} more</span>}
        </div>
      ),
    },
    { title: 'Priority', dataIndex: 'priority', width: 100, render: (p) => <PriorityTag priority={p} /> },
    { title: 'Required by', dataIndex: 'requiredDate', width: 120, render: (v) => formatDate(v), sorter: (a, b) => a.requiredDate.localeCompare(b.requiredDate) },
    { title: 'Requested by', dataIndex: 'submittedByName', width: 150 },
    { title: 'Status', dataIndex: 'status', width: 150, render: (s) => <StatusTag status={s} /> },
    {
      title: '',
      key: 'actions',
      width: 190,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" onClick={() => onOpen(r.id)}>
            View
          </Button>
          <ReviewActions type="material_request" id={r.id} status={r.status} size="small" compact />
          <EditResubmitButton entry={r} onEdit={onEdit} size="small" compact />
        </div>
      ),
    },
  ];
  return (
    <Table<MaterialRequestDto>
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={data}
      size="middle"
      pagination={{ pageSize: 15, hideOnSinglePage: true }}
      scroll={{ x: showProject ? 1200 : 1000 }}
    />
  );
}

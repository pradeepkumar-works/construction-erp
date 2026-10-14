'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { MachineryLogDto, MachineryLogSortField } from '@erp/shared';
import { formatDate, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { HoursCell, OwnershipTag } from './hours';

export function MachineryTable({
  data,
  loading,
  showProject,
  onOpen,
  onEdit,
  table,
  sortOrderFor,
}: {
  data: MachineryLogDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (id: string) => void;
  onEdit?: (row: MachineryLogDto) => void;
  table: Pick<TableProps<MachineryLogDto>, 'pagination' | 'onChange'>;
  sortOrderFor: (key: MachineryLogSortField) => 'ascend' | 'descend' | null;
}) {
  const sort = (key: MachineryLogSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<MachineryLogDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 220, ellipsis: true, render: (v: string, r: MachineryLogDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      title: 'Equipment',
      ...sort('equipment'),
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => onOpen(r.id)}>
            <span className="mono">{r.equipmentCode}</span> {r.equipmentName}
          </Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[r.operatorName, r.activityName ?? r.workDone].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>
      ),
    },
    { title: '', dataIndex: 'ownership', width: 80, render: (o) => <OwnershipTag ownership={o} /> },
    { title: 'Hours', width: 150, ...sort('hoursWorked'), render: (_, r) => <HoursCell log={r} /> },
    { title: 'Diesel', dataIndex: 'dieselLitres', width: 90, align: 'right', className: 'mono', render: (v) => (v === null ? '-' : `${formatQty(v)} L`) },
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
          <ReviewActions type="machinery" id={r.id} status={r.status} size="small" compact />
          <EditResubmitButton entry={r} onEdit={onEdit} size="small" compact />
        </div>
      ),
    },
  ];
  return <Table<MachineryLogDto> rowKey="id" loading={loading} columns={columns} dataSource={data} size="middle" {...table} scroll={{ x: showProject ? 1300 : 1080 }} />;
}

'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { MeasurementSheetDto, MeasurementSortField } from '@erp/shared';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';

export function MeasurementTable({
  data,
  loading,
  showProject,
  onOpen,
  onEdit,
  table,
  sortOrderFor,
}: {
  data: MeasurementSheetDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (id: string) => void;
  onEdit?: (row: MeasurementSheetDto) => void;
  table: Pick<TableProps<MeasurementSheetDto>, 'pagination' | 'onChange'>;
  sortOrderFor: (key: MeasurementSortField) => 'ascend' | 'descend' | null;
}) {
  const sort = (key: MeasurementSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<MeasurementSheetDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    { title: 'MB no.', dataIndex: 'mbNo', width: 130, className: 'mono', ...sort('mbNo') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: MeasurementSheetDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    {
      title: 'BOQ item',
      ...sort('boqItem'),
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => onOpen(r.id)}>
            <span className="mono">{r.boqItemNo}</span> {r.boqDescription}
          </Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.location}
          </div>
        </div>
      ),
    },
    { title: 'Lines', key: 'lines', width: 70, align: 'right', render: (_, r) => r.lines.length },
    {
      title: 'Quantity',
      dataIndex: 'totalQty',
      width: 130,
      align: 'right',
      ...sort('totalQty'),
      render: (v, r) => (
        <span className="mono">
          {formatQty(v)} {r.unit}
        </span>
      ),
    },
    { title: 'Value', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <span className="mono">{formatINR(v)}</span> },
    { title: 'Submitted by', dataIndex: 'submittedByName', width: 140, ...sort('submittedBy') },
    {
      title: 'Status',
      fixed: 'right' as const,
      dataIndex: 'status',
      width: 140,
      ...sort('status'),
      render: (s, r) => (
        <div>
          <StatusTag status={s} />
          {r.raBillNo !== null && (
            <div className="text-muted" style={{ fontSize: 12 }}>
              in RA bill {r.raBillNo}
            </div>
          )}
        </div>
      ),
    },
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
          <ReviewActions type="measurement" id={r.id} status={r.status} amount={r.amount} size="small" compact />
          <EditResubmitButton entry={r} onEdit={onEdit} size="small" compact />
        </div>
      ),
    },
  ];
  return <Table<MeasurementSheetDto> rowKey="id" loading={loading} columns={columns} dataSource={data} size="middle" {...table} scroll={{ x: showProject ? 1500 : 1300 }} />;
}

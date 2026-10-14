'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Table, Tag, Tooltip, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import type { AttendanceSheetDto, AttendanceSortField } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';

export function AttendanceTable({
  data,
  loading,
  showProject,
  onOpen,
  canEdit,
  table,
  sortOrderFor,
}: {
  data: AttendanceSheetDto[];
  loading?: boolean;
  showProject?: boolean;
  onOpen: (row: AttendanceSheetDto) => void;
  /** Whether the user may change sheets (the button reads Edit instead of View). */
  canEdit: boolean;
  table: Pick<TableProps<AttendanceSheetDto>, 'pagination' | 'onChange'>;
  sortOrderFor: (key: AttendanceSortField) => 'ascend' | 'descend' | null;
}) {
  const sort = (key: AttendanceSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<AttendanceSheetDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 120, render: (v, r) => <Typography.Link onClick={() => onOpen(r)}>{formatDate(v)}</Typography.Link>, ...sort('date') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 240, ellipsis: true, render: (v: string, r: AttendanceSheetDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]
      : []),
    { title: 'Workers', dataIndex: 'totalWorkers', width: 110, align: 'center', ...sort('totalWorkers') },
    {
      title: 'By trade',
      key: 'manpower',
      render: (_, r) =>
        r.manpower.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {r.manpower.map((m) => (
              <Tag key={m.category} style={{ margin: 0 }}>
                {m.category} {m.count}
              </Tag>
            ))}
          </div>
        ) : (
          <Typography.Text type="secondary">{r.remarks || 'No workers'}</Typography.Text>
        ),
    },
    {
      title: 'Contractors',
      key: 'contractors',
      width: 220,
      ellipsis: true,
      render: (_, r) => [...new Set(r.lines.map((l) => l.contractor))].join(', ') || '-',
    },
    { title: 'Recorded by', dataIndex: 'recordedByName', width: 150, ...sort('recordedBy') },
    {
      title: 'DPR',
      fixed: 'right' as const,
      key: 'dpr',
      width: 170,
      render: (_, r) => (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {r.dprStatus ? <StatusTag status={r.dprStatus} /> : <Typography.Text type="secondary">Not filed</Typography.Text>}
          {r.locked ? (
            <Tooltip title="The DPR for this day is approved, so the sheet is locked">
              <LockOutlined />
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 90,
      render: (_, r) => (
        <Button size="small" onClick={() => onOpen(r)}>
          {canEdit && !r.locked ? 'Edit' : 'View'}
        </Button>
      ),
    },
  ];
  return <Table<AttendanceSheetDto> rowKey="id" loading={loading} columns={columns} dataSource={data} size="middle" {...table} scroll={{ x: showProject ? 1250 : 1000 }} />;
}

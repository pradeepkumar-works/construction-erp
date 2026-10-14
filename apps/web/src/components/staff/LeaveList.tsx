'use client';

import React, { useState } from 'react';
import { Button, Checkbox, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { LeaveRequestDto, LeaveSortField, LeaveStatus, LeaveType } from '@erp/shared';
import { LEAVE_STATUSES, LEAVE_STATUS_LABELS, LEAVE_TYPES, LEAVE_TYPE_LABELS, canManageStaff } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useLeave } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { LeaveStatusTag, leaveSpan } from './staffUi';

/** Leave of the staff the user can see; "Waiting on me" shows what they can approve. */
export function LeaveList({ onOpen, onNew, toDecideFirst }: { onOpen: (id: string) => void; onNew: () => void; toDecideFirst: boolean }) {
  const { user } = useAuth();
  const list = useListState<LeaveSortField>({ sortBy: 'fromDate', sortOrder: 'desc' });
  const [projectId, setProjectId] = useState<string | undefined>();
  const [status, setStatus] = useState<LeaveStatus | undefined>();
  const [type, setType] = useState<LeaveType | undefined>();
  const [toDecide, setToDecide] = useState(toDecideFirst);
  const { data, isLoading, isFetching, error, refetch } = useLeave({ ...list.params, projectId, status, type, toDecide: toDecide || undefined });
  const sort = (key: LeaveSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<LeaveRequestDto>['columns'] = [
    { title: 'Employee', dataIndex: 'employeeName', width: 200, ...sort('employee'), render: (v: string, r) => <Typography.Link onClick={() => onOpen(r.id)}>{v}</Typography.Link> },
    { title: 'Posted at', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string | null) => v ?? 'Head office' },
    { title: 'Leave', dataIndex: 'type', width: 160, ...sort('type'), render: (v: LeaveType) => LEAVE_TYPE_LABELS[v] },
    { title: 'Dates', dataIndex: 'fromDate', width: 220, ...sort('fromDate'), render: (_, r) => leaveSpan(r) },
    { title: 'Days', dataIndex: 'days', width: 70, align: 'right' },
    { title: 'Reason', dataIndex: 'reason', ellipsis: true, width: 240 },
    { title: 'Status', dataIndex: 'status', width: 110, ...sort('status'), render: (v: LeaveStatus) => <LeaveStatusTag status={v} /> },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 90,
      render: (_, r) => (
        <Button size="small" type={r.canDecide ? 'primary' : 'default'} onClick={() => onOpen(r.id)}>
          {r.canDecide ? 'Decide' : 'Open'}
        </Button>
      ),
    },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectId}
        onProject={(v) => {
          setProjectId(v);
          list.resetPage();
        }}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search name, code, reason"
        extra={
          user && canManageStaff(user.roleKey) ? (
            <Button icon={<PlusOutlined />} onClick={onNew}>
              Apply for someone
            </Button>
          ) : null
        }
      >
        <Select<LeaveType> allowClear placeholder="Any leave" style={{ width: 170 }} value={type} onChange={(v) => { setType(v); list.resetPage(); }} options={LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABELS[t] }))} />
        <Select<LeaveStatus> allowClear placeholder="Any status" style={{ width: 140 }} value={status} onChange={(v) => { setStatus(v); list.resetPage(); }} options={LEAVE_STATUSES.map((s) => ({ value: s, label: LEAVE_STATUS_LABELS[s] }))} />
        <Checkbox
          checked={toDecide}
          onChange={(e) => {
            setToDecide(e.target.checked);
            list.resetPage();
          }}
        >
          Waiting on me
        </Checkbox>
      </ListToolbar>
      <Table<LeaveRequestDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<LeaveRequestDto>(data?.total)}
        scroll={{ x: 1300 }}
        locale={{ emptyText: toDecide ? 'Nothing waiting on you' : 'No leave' }}
      />
    </>
  );
}

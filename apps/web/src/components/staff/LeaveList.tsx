'use client';

import React from 'react';
import { Button, Checkbox, Select, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { LeaveRequestDto, LeaveSortField, LeaveStatus, LeaveType } from '@erp/shared';
import { LEAVE_STATUSES, LEAVE_STATUS_LABELS, LEAVE_TYPES, LEAVE_TYPE_LABELS, LIST_SORT_FIELDS, canManageStaff } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useLeave } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { LeaveStatusTag, leaveSpan } from './staffUi';

const KEYS = ['status', 'type', 'toDecide'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** Leave of the staff the user can see; "Waiting on me" shows what they can approve. */
export function LeaveList({ onOpen, onNew, toDecideFirst }: { onOpen: (id: string) => void; onNew: () => void; toDecideFirst: boolean }) {
  const { user } = useAuth();
  const frame = useListFrame<LeaveSortField, LeaveRequestDto>({
    list: 'leave',
    url: false,
    keys: KEYS,
    sortBy: 'fromDate',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.leave,
    initialFilters: toDecideFirst ? { toDecide: '1' } : undefined,
    statusLabels: LEAVE_STATUS_LABELS,
    chipLabels: { type: (v) => `Leave: ${LEAVE_TYPE_LABELS[v as LeaveType] ?? v}`, toDecide: () => 'Waiting on me' },
    columns: (sortOrderFor): ListColumn<LeaveRequestDto>[] => {
      const sort = (key: LeaveSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        {
          title: 'Employee',
          ...sort('employee'),
          locked: true,
          width: 220,
          render: (_, r) => (
            <div>
              <RecordLink onOpen={() => onOpen(r.id)} strong>
                {r.employeeName}
              </RecordLink>
              <Sub>{r.projectName ?? 'Head office'}</Sub>
            </div>
          ),
        },
        { title: 'Leave', dataIndex: 'type', width: 160, ...sort('type'), render: (v: LeaveType) => LEAVE_TYPE_LABELS[v] },
        { title: 'Dates', dataIndex: 'fromDate', width: 220, ...sort('fromDate'), render: (_, r) => leaveSpan(r) },
        { key: 'days', title: 'Days', dataIndex: 'days', width: 70, align: 'right' },
        { key: 'reason', title: 'Reason', dataIndex: 'reason', ellipsis: true, width: 240 },
        { title: 'Status', dataIndex: 'status', width: 110, ...sort('status'), render: (v: LeaveStatus) => <LeaveStatusTag status={v} /> },
        {
          key: 'actions',
          title: '',
          label: 'Decide',
          locked: true,
          fixed: 'right' as const,
          width: 90,
          render: (_, r) =>
            r.canDecide ? (
              <Button size="small" type="primary" onClick={() => onOpen(r.id)}>
                Decide
              </Button>
            ) : null,
        },
      ];
    },
  });
  const { page } = frame;
  const status = page.filters.status as LeaveStatus | undefined;
  const type = page.filters.type as LeaveType | undefined;
  const toDecide = page.filters.toDecide === '1';
  const { data, isLoading, isFetching, error, refetch } = useLeave({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, status, type, toDecide: toDecide || undefined });

  const newButton = user && canManageStaff(user.roleKey) ? (
    <Button icon={<PlusOutlined />} onClick={onNew}>
      Apply for someone
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search name, code, reason"
        extra={newButton}
      >
        <Select<LeaveType> allowClear placeholder="Any leave" aria-label="Leave type" style={{ width: 170 }} value={type} onChange={(v) => page.setFilter('type', v)} options={LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABELS[t] }))} />
        <Select<LeaveStatus> allowClear placeholder="Any status" aria-label="Status" style={{ width: 140 }} value={status} onChange={(v) => page.setFilter('status', v)} options={LEAVE_STATUSES.map((s) => ({ value: s, label: LEAVE_STATUS_LABELS[s] }))} />
        <Checkbox checked={toDecide} onChange={(e) => page.setFilter('toDecide', e.target.checked ? '1' : undefined)}>
          Waiting on me
        </Checkbox>
      </ListToolbar>
      <DataTable<LeaveRequestDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<LeaveRequestDto>(data?.total)}
        onOpen={onOpen}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1200}
        emptyText={<EmptyArt art="entries" title={toDecide ? 'Nothing waiting on you' : status || type || page.params.q ? 'No leave matches these filters' : 'No leave'} />}
        emptyAction={newButton}
      />
    </>
  );
}

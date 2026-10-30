'use client';

import React, { useState } from 'react';
import { App, Button, Input, Modal, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { StaffAttendanceDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useOvertimeToDecide } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { CheckInPlaceTag, clock } from './staffUi';

/**
 * Overtime waiting on the caller (v5 item 97): time past a standard day from staff check-outs, for the site manager or
 * HR to approve before payroll pays it. Overtime a decider marks in the register is approved as they save it.
 */
export function OvertimeList() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useOvertimeToDecide();
  const [rejecting, setRejecting] = useState<StaffAttendanceDto | null>(null);
  const [note, setNote] = useState('');

  const act = useMutation({
    mutationFn: async ({ row, decision }: { row: StaffAttendanceDto; decision: 'approve' | 'reject' }) =>
      (await api.post<StaffAttendanceDto>(`/staff/attendance/${row.id}/overtime/${decision}`, { note: decision === 'reject' ? note.trim() : undefined })).data,
    onSuccess: (r, { decision }) => {
      message.success(`${r.overtimeHours} h overtime ${decision === 'approve' ? 'approved' : 'rejected'} for ${r.employeeName}`);
      setRejecting(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const columns: TableProps<StaffAttendanceDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 120, render: (v: string) => <span translate="no">{formatDate(v)}</span> },
    {
      title: 'Employee',
      key: 'employee',
      width: 220,
      render: (_, r) => (
        <span translate="no">
          {r.employeeName} <Typography.Text type="secondary">{r.employeeCode}</Typography.Text>
        </span>
      ),
    },
    { title: 'Site', dataIndex: 'projectName', width: 220, ellipsis: true, render: (v: string | null) => v ?? '-' },
    {
      title: 'In and out',
      key: 'times',
      width: 150,
      render: (_, r) => (r.checkIn ? <span translate="no">{`${clock(r.checkIn)} to ${clock(r.checkOut)}`}</span> : <Typography.Text type="secondary">In the register</Typography.Text>),
    },
    { title: 'Overtime', dataIndex: 'overtimeHours', width: 100, align: 'right', render: (v: string) => <span translate="no">{v} h</span> },
    { title: 'Marked in', key: 'place', width: 200, render: (_, r) => (r.checkInPlace ? <CheckInPlaceTag place={r.checkInPlace} /> : '-') },
    {
      title: '',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, r) =>
        r.canDecideOvertime ? (
          <Space>
            <Button size="small" danger onClick={() => setRejecting(r)} aria-label={`Reject ${r.employeeName}'s overtime on ${formatDate(r.date)}`}>
              Reject
            </Button>
            <Button size="small" type="primary" loading={act.isPending && act.variables?.row.id === r.id} onClick={() => act.mutate({ row: r, decision: 'approve' })} aria-label={`Approve ${r.employeeName}'s overtime on ${formatDate(r.date)}`}>
              Approve
            </Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Typography.Paragraph type="secondary">Overtime from check-outs, and from the register when someone else marked it, at your sites. Payroll pays approved overtime only.</Typography.Paragraph>
      <Table<StaffAttendanceDto> rowKey="id" size="small" columns={columns} dataSource={data} pagination={false} scroll={{ x: 1210 }} locale={{ emptyText: 'No overtime waiting on you' }} />
      <Modal
        open={!!rejecting}
        title={rejecting ? `Reject ${rejecting.overtimeHours} h overtime for ${rejecting.employeeName}` : 'Reject overtime'}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !note.trim() }}
        confirmLoading={act.isPending}
        onOk={() => rejecting && act.mutate({ row: rejecting, decision: 'reject' })}
        onCancel={() => setRejecting(null)}
        destroyOnHidden
      >
        <Input.TextArea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, so they know what counts" aria-label="Reason for rejecting" />
      </Modal>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { App, Button, Form, Input, Modal, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { tk } from '@/ds';
import type { AttendanceCorrectionDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useCorrectionsToDecide } from '@/lib/queries';
import { formatDate, NO_VALUE } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { correctionAsked, correctionNow } from './staffUi';

/**
 * Attendance corrections waiting on the caller: their reports' first, which they recommend to HR, then (for HR) what
 * the managers recommended. HR's approval writes the day, unless payroll for the month is approved.
 */
export function CorrectionList() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useCorrectionsToDecide();
  const [rejecting, setRejecting] = useState<AttendanceCorrectionDto | null>(null);
  const [note, setNote] = useState('');

  const act = useMutation({
    mutationFn: async ({ row, decision }: { row: AttendanceCorrectionDto; decision: 'approve' | 'reject' }) =>
      (await api.post<AttendanceCorrectionDto>(`/staff/corrections/${row.id}/${decision}`, { note: decision === 'reject' ? note.trim() : undefined })).data,
    onSuccess: (c, { decision }) => {
      message.success(`${c.employeeName}'s correction for ${formatDate(c.date)} ${decision === 'reject' ? 'rejected' : c.status === 'APPROVED' ? 'approved; the day is changed' : 'recommended to HR'}`);
      setRejecting(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const columns: TableProps<AttendanceCorrectionDto>['columns'] = [
    { title: 'Day', dataIndex: 'date', width: 120, render: (v: string) => <span translate="no">{formatDate(v)}</span> },
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
    { title: 'Marked now', key: 'now', width: 200, render: (_, r) => correctionNow(r) },
    { title: 'Asks for', key: 'asked', width: 220, render: (_, r) => correctionAsked(r) },
    { title: 'Why', dataIndex: 'reason', width: 240, ellipsis: true },
    { title: 'Recommended by', key: 'recommended', width: 180, render: (_, r) => r.approval.recommendedByName ?? NO_VALUE },
    {
      title: '',
      key: 'actions',
      width: 190,
      fixed: 'right',
      render: (_, r) =>
        r.canDecide ? (
          <Space>
            <Button size="small" danger onClick={() => setRejecting(r)} aria-label={`Reject ${r.employeeName}'s correction for ${formatDate(r.date)}`}>
              Reject
            </Button>
            <Button
              size="small"
              loading={act.isPending && act.variables?.row.id === r.id}
              onClick={() => act.mutate({ row: r, decision: 'approve' })}
              aria-label={`${r.approval.callerRecommends ? 'Recommend' : 'Approve'} ${r.employeeName}'s correction for ${formatDate(r.date)}`}
            >
              {r.approval.callerRecommends ? 'Recommend' : 'Approve'}
            </Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <div style={{ padding: tk.space[4] }}>
      <Typography.Paragraph type="secondary">Days your staff asked to correct. You recommend your reports&apos; to HR; HR&apos;s approval changes the day.</Typography.Paragraph>
      <Table<AttendanceCorrectionDto> rowKey="id" size="small" columns={columns} dataSource={data} pagination={false} scroll={{ x: 1370 }} locale={{ emptyText: 'No corrections waiting on you' }} />
      <Modal
        open={!!rejecting}
        title={rejecting ? `Reject ${rejecting.employeeName}'s correction for ${formatDate(rejecting.date)}` : 'Reject correction'}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !note.trim() }}
        confirmLoading={act.isPending}
        onOk={() => rejecting && act.mutate({ row: rejecting, decision: 'reject' })}
        onCancel={() => setRejecting(null)}
        destroyOnHidden
      >
        <Form layout="vertical" component={false}>
          <Form.Item label="Reason for rejecting" htmlFor="correction-reject-reason" style={{ marginBottom: 0 }}>
            <Input.TextArea id="correction-reject-reason" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, so they know what the register shows" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

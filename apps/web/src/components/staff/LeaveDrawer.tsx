'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, Form, Input, Modal, Popconfirm, Space, Table, Timeline, Typography } from 'antd';
import type { LeaveRequestDto } from '@erp/shared';
import { LEAVE_ACTION_LABELS, LEAVE_TYPE_LABELS, auditActionLabel } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useLeaveBalances, useLeaveHistory, useLeaveRequest } from '@/lib/queries';
import { formatDateTime, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { LeaveStatusTag, days, leaveSpan } from './staffUi';
import { themeFontSize } from '@/lib/theme';

/** One leave request: details, the employee's balance for the year, approve / reject / cancel, and its history. */
export function LeaveDrawer({ id, open, onClose }: { id: string | null; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, error, refetch } = useLeaveRequest(id ?? undefined);
  const { data: history } = useLeaveHistory(id ?? undefined);
  const { data: balances } = useLeaveBalances(data?.employeeId, data ? Number(data.fromDate.slice(0, 4)) : undefined, !!data);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const act = useMutation({
    mutationFn: async (a: 'approve' | 'reject' | 'cancel') => (await api.post<LeaveRequestDto>(`/staff/leave/${id}/${a}`, a === 'cancel' ? undefined : { note: note.trim() || undefined })).data,
    onSuccess: (l, a) => {
      message.success(a === 'approve' ? `Leave approved for ${l.employeeName}` : a === 'reject' ? `Leave rejected for ${l.employeeName}` : 'Leave cancelled');
      setRejecting(false);
      setNote('');
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={620}
      title={data ? `${LEAVE_TYPE_LABELS[data.type]}: ${data.employeeName}` : 'Leave'}
      extra={
        data && (
          <Space>
            {data.canCancel && (
              <Popconfirm title="Cancel this leave?" okText="Cancel leave" cancelText="Keep" onConfirm={() => act.mutate('cancel')}>
                <Button>Cancel leave</Button>
              </Popconfirm>
            )}
            {data.canDecide && (
              <>
                <Button danger onClick={() => setRejecting(true)}>
                  Reject
                </Button>
                <Button type="primary" loading={act.isPending} onClick={() => act.mutate('approve')}>
                  Approve
                </Button>
              </>
            )}
          </Space>
        )
      }
    >
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Employee">
              {data.employeeName} <Typography.Text type="secondary">({data.employeeCode}, {data.designation})</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Posted at">{data.projectName ?? 'Head office'}</Descriptions.Item>
            <Descriptions.Item label="Dates">
              {leaveSpan(data)} · {days(data.days)}
            </Descriptions.Item>
            <Descriptions.Item label="Reason">{data.reason}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <LeaveStatusTag status={data.status} />
              {data.decidedByName && (
                <Typography.Text type="secondary">
                  {' '}
                  by {data.decidedByName}
                  {data.decisionNote ? `: ${data.decisionNote}` : ''}
                </Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Applied by">
              {data.appliedByName}, {formatDateTime(data.createdAt)}
            </Descriptions.Item>
          </Descriptions>
          <Divider titlePlacement="start" plain>
            Balance for {data.fromDate.slice(0, 4)}
          </Divider>
          <Table
            rowKey="type"
            size="small"
            pagination={false}
            dataSource={balances ?? []}
            columns={[
              { title: 'Leave', dataIndex: 'type', render: (v: LeaveRequestDto['type']) => LEAVE_TYPE_LABELS[v] },
              { title: 'For the year', dataIndex: 'entitled', align: 'right', render: (v: number | null) => v ?? 'No limit' },
              { title: 'Taken', dataIndex: 'taken', align: 'right' },
              { title: 'Waiting', dataIndex: 'pending', align: 'right' },
              { title: 'Left', dataIndex: 'left', align: 'right', render: (v: number | null) => (v === null ? NO_VALUE : <Typography.Text strong type={v < 0 ? 'danger' : undefined}>{v}</Typography.Text>) },
            ]}
          />
          <Divider titlePlacement="start" plain>
            History
          </Divider>
          <Timeline
            items={(history ?? []).map((h) => ({
              key: h.id,
              content: (
                <div>
                  <Typography.Text strong>{auditActionLabel(h.action, LEAVE_ACTION_LABELS)}</Typography.Text> <Typography.Text type="secondary">by {h.actorName}</Typography.Text>
                  {h.note ? <span> · {h.note}</span> : null}
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    {formatDateTime(h.createdAt)}
                  </div>
                </div>
              ),
            }))}
          />
        </>
      )}
      <Modal open={rejecting} title="Reject leave" okText="Reject" okButtonProps={{ danger: true, disabled: !note.trim() }} confirmLoading={act.isPending} onOk={() => act.mutate('reject')} onCancel={() => setRejecting(false)} destroyOnHidden>
        <Form layout="vertical" component={false}>
          <Form.Item label="Reason for rejecting" htmlFor="leave-reject-reason" style={{ marginBottom: 0 }}>
            <Input.TextArea id="leave-reject-reason" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, so they can plan again" />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Card, Col, Empty, List, Popconfirm, Row, Space, Statistic, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { LoginOutlined, LogoutOutlined, PlusOutlined } from '@ant-design/icons';
import type { LeaveRequestDto } from '@erp/shared';
import { LEAVE_TYPE_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useMyStaff } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { AttendanceTag, LeaveStatusTag, clock, days, leaveSpan } from './staffUi';
import { LeaveFormModal } from './LeaveFormModal';

/** The signed-in person's own record: check in and out, leave balances, their requests and coming holidays. */
export function MyStaff() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useMyStaff();
  const [apply, setApply] = useState(false);

  const act = useMutation({
    mutationFn: async (what: 'check-in' | 'check-out' | { cancel: string }) =>
      typeof what === 'string' ? (await api.post(`/staff/me/${what}`, {})).data : (await api.post(`/staff/leave/${what.cancel}/cancel`)).data,
    onSuccess: (_, what) => {
      message.success(what === 'check-in' ? 'Checked in' : what === 'check-out' ? 'Checked out' : 'Leave cancelled');
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data.employee)
    return (
      <div style={{ padding: 16 }}>
        <Alert type="info" showIcon message="Your login is not linked to a staff record" description="HR links logins to staff records under Staff. Once linked you can check in and apply for leave here." />
      </div>
    );

  const t = data.today;
  const columns: TableProps<LeaveRequestDto>['columns'] = [
    { title: 'Leave', dataIndex: 'type', width: 170, render: (v: LeaveRequestDto['type']) => LEAVE_TYPE_LABELS[v] },
    { title: 'Dates', key: 'dates', width: 220, render: (_, r) => leaveSpan(r) },
    { title: 'Days', dataIndex: 'days', width: 70, align: 'right' },
    { title: 'Reason', dataIndex: 'reason', ellipsis: true, width: 200 },
    { title: 'Status', dataIndex: 'status', width: 110, render: (v: LeaveRequestDto['status']) => <LeaveStatusTag status={v} /> },
    { title: 'Decided by', key: 'decided', width: 220, render: (_, r) => (r.decidedByName ? <span>{r.decidedByName}{r.decisionNote ? <Typography.Text type="secondary">: {r.decisionNote}</Typography.Text> : null}</span> : '-') },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_, r) =>
        r.canCancel ? (
          <Popconfirm title="Cancel this leave?" okText="Cancel leave" cancelText="Keep" onConfirm={() => act.mutate({ cancel: r.id })}>
            <Button size="small">Cancel</Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card size="small" title={`Today, ${formatDate(new Date().toISOString())}`}>
            {data.todayOff && !t ? (
              <Typography.Paragraph type="secondary">{data.todayOff === 'Sunday' ? 'Sunday, the weekly off.' : `Holiday: ${data.todayOff}.`} Working today counts towards a comp-off.</Typography.Paragraph>
            ) : null}
            {t ? (
              <Space direction="vertical" size={4}>
                <Space>
                  <AttendanceTag status={t.status} />
                  {t.projectName && <Typography.Text type="secondary">{t.projectName}</Typography.Text>}
                </Space>
                <Typography.Text>
                  In {clock(t.checkIn)} · Out {clock(t.checkOut)}
                  {t.overtimeHours && Number(t.overtimeHours) > 0 ? ` · Overtime ${t.overtimeHours} h` : ''}
                </Typography.Text>
                {!t.checkIn && <Typography.Text type="secondary">Marked by {t.markedByName}</Typography.Text>}
              </Space>
            ) : (
              <Typography.Text type="secondary">Not checked in yet.</Typography.Text>
            )}
            <div style={{ marginTop: 12 }}>
              {!t?.checkIn ? (
                <Button type="primary" icon={<LoginOutlined />} loading={act.isPending} onClick={() => act.mutate('check-in')}>
                  Check in
                </Button>
              ) : !t.checkOut ? (
                <Button icon={<LogoutOutlined />} loading={act.isPending} onClick={() => act.mutate('check-out')}>
                  Check out
                </Button>
              ) : null}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card
            size="small"
            title={`Leave left in ${data.year}`}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setApply(true)}>
                Apply for leave
              </Button>
            }
          >
            <Row gutter={16}>
              {data.balances
                .filter((b) => b.entitled !== null)
                .map((b) => (
                  <Col key={b.type} xs={12} md={6}>
                    <Statistic title={LEAVE_TYPE_LABELS[b.type]} value={b.left ?? 0} suffix={`/ ${b.entitled}`} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {b.taken} taken{b.pending ? `, ${b.pending} waiting` : ''}
                    </Typography.Text>
                  </Col>
                ))}
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card size="small" title="My leave" styles={{ body: { padding: 0 } }}>
            <Table<LeaveRequestDto> rowKey="id" size="small" columns={columns} dataSource={data.leave} pagination={false} scroll={{ x: 1080 }} locale={{ emptyText: 'No leave yet' }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="Coming holidays">
            {data.holidays.length ? (
              <List size="small" dataSource={data.holidays} renderItem={(h) => (
                  <List.Item>
                    <span>
                      {h.name}
                      {h.projectName ? <Typography.Text type="secondary"> ({h.projectName})</Typography.Text> : null}
                    </span>
                    <Typography.Text type="secondary">{formatDate(h.date)}</Typography.Text>
                  </List.Item>
                )} />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="None listed" />
            )}
          </Card>
        </Col>
      </Row>
      <LeaveFormModal open={apply} onClose={() => setApply(false)} employeeId={data.employee.id} />
    </div>
  );
}

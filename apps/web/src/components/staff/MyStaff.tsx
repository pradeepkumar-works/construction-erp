'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Col, Empty, Flex, Listy, Popconfirm, Row, Space, Statistic, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { LoginOutlined, LogoutOutlined, PlusOutlined } from '@/components/common/icons';
import type { LeaveRequestDto } from '@erp/shared';
import { LEAVE_TYPE_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useMyStaff } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { AttendanceTag, CheckInPlaceTag, FacePhotos, LeaveStatusTag, OvertimeTag, clock, currentPosition, leaveSpan, metres } from './staffUi';
import { LeaveFormModal } from './LeaveFormModal';
import { themeFontSize } from '@/lib/theme';
import { Section } from '@/components/common/Section';

/** The signed-in person's own record: mark in and out (the phone adds their photo, face attendance), leave balances, their requests and coming holidays. */
export function MyStaff() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useMyStaff();
  const [apply, setApply] = useState(false);

  const act = useMutation({
    mutationFn: async (what: 'check-in' | 'check-out' | { cancel: string }) => {
      if (typeof what !== 'string') return (await api.post(`/staff/leave/${what.cancel}/cancel`)).data;
      // Check-in sends where the browser is when the site has a location to measure from.
      const at = what === 'check-in' && data?.site ? await currentPosition() : null;
      return (await api.post(`/staff/me/${what}`, at ?? {})).data;
    },
    onSuccess: (_, what) => {
      message.success(what === 'check-in' ? 'Marked in' : what === 'check-out' ? 'Marked out' : 'Leave cancelled');
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data.employee)
    return (
      <div style={{ padding: 16 }}>
        <Alert type="info" showIcon title="Your login is not linked to a staff record" description="HR links logins to staff records under Staff. Once linked you can mark in and apply for leave here." />
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
          <Section title={`Today, ${formatDate(new Date().toISOString())}`}>
            {data.todayOff && !t ? (
              <Typography.Paragraph type="secondary">{data.todayOff === 'Sunday' ? 'Sunday, the weekly off.' : `Holiday: ${data.todayOff}.`} Working today counts towards a comp-off.</Typography.Paragraph>
            ) : null}
            {t ? (
              <Space orientation="vertical" size={4}>
                <Space>
                  <AttendanceTag status={t.status} />
                  {t.projectName && <Typography.Text type="secondary">{t.projectName}</Typography.Text>}
                </Space>
                <Typography.Text>
                  In {clock(t.checkIn)} · Out {clock(t.checkOut)}
                </Typography.Text>
                <CheckInPlaceTag place={t.checkInPlace} />
                <FacePhotos attendance={t} />
                {t.overtimeHours && Number(t.overtimeHours) > 0 ? (
                  <Space size={4} wrap>
                    <Typography.Text>Overtime {t.overtimeHours} h</Typography.Text>
                    {t.overtimeStatus && <OvertimeTag status={t.overtimeStatus} />}
                    {t.overtimeStatus === 'PENDING' && <Typography.Text type="secondary">Paid once your manager approves it</Typography.Text>}
                  </Space>
                ) : null}
                {!t.checkIn && <Typography.Text type="secondary">Marked by {t.markedByName}</Typography.Text>}
              </Space>
            ) : (
              <Typography.Text type="secondary">Not marked in yet.</Typography.Text>
            )}
            {!t?.checkIn && data.site ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                Mark in records your location: {data.site.strict ? 'it must be' : 'it is flagged unless'} within {metres(data.site.radiusM)} of {data.site.projectName}.
              </Typography.Paragraph>
            ) : null}
            <div style={{ marginTop: 12 }}>
              {!t?.checkIn ? (
                <Button type="primary" icon={<LoginOutlined />} loading={act.isPending} onClick={() => act.mutate('check-in')}>
                  Mark in
                </Button>
              ) : !t.checkOut ? (
                <Button icon={<LogoutOutlined />} loading={act.isPending} onClick={() => act.mutate('check-out')}>
                  Mark out
                </Button>
              ) : null}
            </div>
          </Section>
        </Col>
        <Col xs={24} lg={16}>
          <Section
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
                    <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                      {b.taken} taken{b.pending ? `, ${b.pending} waiting` : ''}
                    </Typography.Text>
                  </Col>
                ))}
            </Row>
          </Section>
        </Col>
        <Col xs={24} lg={16}>
          <Section title="My leave">
            <Table<LeaveRequestDto> rowKey="id" size="small" columns={columns} dataSource={data.leave} pagination={false} scroll={{ x: 1080 }} locale={{ emptyText: 'No leave yet' }} />
          </Section>
        </Col>
        <Col xs={24} lg={8}>
          <Section title="Coming holidays">
            {data.holidays.length ? (
              <Listy
                items={data.holidays}
                rowKey="id"
                styles={{ item: { padding: '8px 0', background: 'transparent' } }}
                itemRender={(h) => (
                  <Flex justify="space-between" align="center" gap="small">
                    <span>
                      {h.name}
                      {h.projectName ? <Typography.Text type="secondary"> ({h.projectName})</Typography.Text> : null}
                    </span>
                    <Typography.Text type="secondary">{formatDate(h.date)}</Typography.Text>
                  </Flex>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="None listed" />
            )}
          </Section>
        </Col>
      </Row>
      <LeaveFormModal open={apply} onClose={() => setApply(false)} employeeId={data.employee.id} />
    </div>
  );
}

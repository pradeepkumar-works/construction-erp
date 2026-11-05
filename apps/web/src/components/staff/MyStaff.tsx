'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Col, Empty, Flex, Listy, Popconfirm, Row, Space, Statistic, Table, Typography } from 'antd';
import { tk } from '@/ds';
import type { TableProps } from 'antd';
import { EditOutlined, LoginOutlined, LogoutOutlined, PlusOutlined } from '@/components/common/icons';
import type { AttendanceCorrectionDto, LeaveRequestDto } from '@erp/shared';
import { LEAVE_TYPE_LABELS, WEEKDAY_NAMES } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useMyStaff } from '@/lib/queries';
import { formatDate, NO_VALUE } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { AttendanceTag, CheckInPlaceTag, FacePhotos, LeaveStatusTag, OvertimeTag, clock, correctionAsked, correctionNow, currentPosition, leaveSpan, metres } from './staffUi';
import { LeaveFormModal } from './LeaveFormModal';
import { CorrectionFormModal } from './CorrectionFormModal';
import { Section } from '@/components/common/Section';

/** Who decided a request, or who it waits on while it waits. */
function decided(r: { decidedByName: string | null; decisionNote: string | null; approval: { waitingOn: string | null } }) {
  if (r.decidedByName)
    return (
      <span>
        {r.decidedByName}
        {r.decisionNote ? <Typography.Text type="secondary">: {r.decisionNote}</Typography.Text> : null}
      </span>
    );
  return r.approval.waitingOn ? <Typography.Text type="secondary">Waiting on {r.approval.waitingOn}</Typography.Text> : NO_VALUE;
}

/** The signed-in person's own record: mark in and out (the phone adds their photo, face attendance), leave balances, their requests and coming holidays. */
export function MyStaff() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useMyStaff();
  const [apply, setApply] = useState(false);
  const [correct, setCorrect] = useState(false);

  const act = useMutation({
    mutationFn: async (what: 'check-in' | 'check-out' | { cancel: string } | { withdraw: string }) => {
      if (typeof what !== 'string') return (await api.post('cancel' in what ? `/staff/leave/${what.cancel}/cancel` : `/staff/corrections/${what.withdraw}/cancel`)).data;
      // Check-in sends where the browser is when the site has a location to measure from.
      const at = what === 'check-in' && data?.site ? await currentPosition() : null;
      return (await api.post(`/staff/me/${what}`, at ?? {})).data;
    },
    onSuccess: (_, what) => {
      message.success(what === 'check-in' ? 'Marked in' : what === 'check-out' ? 'Marked out' : 'cancel' in what ? 'Leave cancelled' : 'Correction cancelled');
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data.employee)
    return (
      <div style={{ padding: tk.space[4] }}>
        <Alert type="info" showIcon title="Your login is not linked to a staff record" description="HR links logins to staff records under Staff. Once linked you can mark in and apply for leave here." />
      </div>
    );

  const t = data.today;
  const correctionColumns: TableProps<AttendanceCorrectionDto>['columns'] = [
    { title: 'Day', dataIndex: 'date', width: 120, render: (v: string) => <span translate="no">{formatDate(v)}</span> },
    { title: 'Marked', key: 'now', width: 190, render: (_, r) => correctionNow(r) },
    { title: 'Asked for', key: 'asked', width: 230, render: (_, r) => correctionAsked(r) },
    { title: 'Status', dataIndex: 'status', width: 110, render: (v: AttendanceCorrectionDto['status']) => <LeaveStatusTag status={v} /> },
    { title: 'Decided by', key: 'decided', width: 220, render: (_, r) => decided(r) },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_, r) =>
        r.canCancel ? (
          <Popconfirm title="Cancel this correction?" okText="Cancel correction" cancelText="Keep" onConfirm={() => act.mutate({ withdraw: r.id })}>
            <Button size="small">Cancel</Button>
          </Popconfirm>
        ) : null,
    },
  ];
  const columns: TableProps<LeaveRequestDto>['columns'] = [
    { title: 'Leave', dataIndex: 'type', width: 170, render: (v: LeaveRequestDto['type']) => LEAVE_TYPE_LABELS[v] },
    { title: 'Dates', key: 'dates', width: 220, render: (_, r) => leaveSpan(r) },
    { title: 'Days', dataIndex: 'days', width: 70, align: 'right' },
    { title: 'Reason', dataIndex: 'reason', ellipsis: true, width: 200 },
    { title: 'Status', dataIndex: 'status', width: 110, render: (v: LeaveRequestDto['status']) => <LeaveStatusTag status={v} /> },
    { title: 'Decided by', key: 'decided', width: 220, render: (_, r) => decided(r) },
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
    <div style={{ padding: tk.space[4] }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Section title={`Today, ${formatDate(new Date().toISOString())}`}>
            {data.todayOff && !t ? (
              <Typography.Paragraph type="secondary">{data.todayOff === WEEKDAY_NAMES[data.weeklyOff] ? `${data.todayOff}, the weekly off.` : `Holiday: ${data.todayOff}.`} Working today counts towards a comp-off.</Typography.Paragraph>
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
              <Typography.Paragraph type="secondary" style={{ marginTop: tk.space[2], marginBottom: 0 }}>
                Mark in records your location: {data.site.strict ? 'it must be' : 'it is flagged unless'} within {metres(data.site.radiusM)} of {data.site.projectName}.
              </Typography.Paragraph>
            ) : null}
            <div style={{ marginTop: tk.space[3] }}>
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
            title={`Leave left in ${data.yearLabel}`}
            extra={
              <Button icon={<PlusOutlined />} onClick={() => setApply(true)}>
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
                    <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
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
        <Col xs={24} lg={16}>
          <Section
            title="My attendance corrections"
            extra={
              <Button icon={<EditOutlined />} onClick={() => setCorrect(true)}>
                Ask to correct
              </Button>
            }
          >
            <Table<AttendanceCorrectionDto>
              rowKey="id"
              size="small"
              columns={correctionColumns}
              dataSource={data.corrections}
              pagination={false}
              scroll={{ x: 960 }}
              locale={{ emptyText: 'A missed mark-in or a wrong day: ask to correct it, and your manager and HR decide' }}
            />
          </Section>
        </Col>
        <Col xs={24} lg={8}>
          <Section title="Coming holidays">
            {data.holidays.length ? (
              <Listy
                items={data.holidays}
                rowKey="id"
                styles={{ item: { padding: `${tk.space[2]} 0`, background: 'transparent' } }}
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
      <CorrectionFormModal open={correct} onClose={() => setCorrect(false)} employeeId={data.employee.id} />
    </div>
  );
}

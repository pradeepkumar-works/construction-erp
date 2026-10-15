'use client';

import React, { useMemo, useState } from 'react';
import { Button, DatePicker, Descriptions, Divider, Drawer, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { LeaveRequestDto, StaffAttendanceDto } from '@erp/shared';
import { LEAVE_TYPE_LABELS, canManageStaff } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useEmployee, useLeave, useLeaveBalances, useStaffAttendance } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttendanceTag, LeaveStatusTag, clock, leaveSpan } from './staffUi';
import { EmployeeFormModal } from './EmployeeFormModal';

/** A staff member: their record, a month of attendance with its totals, leave balances and requests. */
export function EmployeeDrawer({ id, open, onClose, onOpenLeave }: { id: string | null; open: boolean; onClose: () => void; onOpenLeave: (id: string) => void }) {
  const { user } = useAuth();
  const admin = !!user && canManageStaff(user.roleKey);
  const { data, error, refetch } = useEmployee(id ?? undefined);
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [editing, setEditing] = useState(false);
  const from = month.format('YYYY-MM-DD');
  const to = month.endOf('month').format('YYYY-MM-DD');
  const { data: att } = useStaffAttendance(id ?? undefined, from, to);
  const { data: balances } = useLeaveBalances(id ?? undefined, month.year(), !!id);
  const { data: leave } = useLeave({ employeeId: id ?? undefined, pageSize: 20 }, !!id);
  const totals = useMemo(() => {
    const rows = att ?? [];
    return {
      present: rows.reduce((n, a) => n + (a.status === 'PRESENT' ? 1 : a.status === 'HALF_DAY' ? 0.5 : 0), 0),
      absent: rows.filter((a) => a.status === 'ABSENT').length,
      overtime: rows.reduce((n, a) => n + Number(a.overtimeHours ?? 0), 0),
    };
  }, [att]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={760}
      title={data ? `${data.fullName} (${data.employeeCode})` : 'Staff'}
      extra={admin && data ? <Button onClick={() => setEditing(true)}>Edit</Button> : null}
    >
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Designation">{data.designation}</Descriptions.Item>
            <Descriptions.Item label="Department">{data.department ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Posted at">{data.projectName ?? 'Head office'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{data.phone ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Login">{data.userEmail ?? <Typography.Text type="secondary">None</Typography.Text>}</Descriptions.Item>
            <Descriptions.Item label="Joined">
              {formatDate(data.joinedOn)}
              {!data.isActive && <Tag style={{ marginLeft: 8 }}>Left {formatDate(data.leftOn)}</Tag>}
            </Descriptions.Item>
          </Descriptions>
          <Divider titlePlacement="start" plain>
            Attendance
          </Divider>
          <Space style={{ marginBottom: 8 }} wrap>
            <DatePicker picker="month" format="MMM YYYY" allowClear={false} value={month} onChange={(d) => d && setMonth(d.startOf('month'))} disabledDate={(d) => d.isAfter(dayjs(), 'month')} />
            <Typography.Text>
              {totals.present} days present, {totals.absent} absent{totals.overtime ? `, ${totals.overtime} h overtime` : ''}
            </Typography.Text>
          </Space>
          <Table<StaffAttendanceDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={att ?? []}
            scroll={{ y: 260 }}
            locale={{ emptyText: 'Nothing marked this month' }}
            columns={[
              { title: 'Date', dataIndex: 'date', width: 130, render: (v: string) => dayjs(v).format('ddd DD MMM') },
              { title: 'Status', dataIndex: 'status', width: 100, render: (v: StaffAttendanceDto['status']) => <AttendanceTag status={v} /> },
              { title: 'In / out', key: 'io', width: 110, render: (_, r) => (r.checkIn ? `${clock(r.checkIn)} - ${clock(r.checkOut)}` : '-') },
              { title: 'OT h', dataIndex: 'overtimeHours', width: 60, align: 'right', render: (v: string | null) => (v && Number(v) ? v : '') },
              { title: 'Site', dataIndex: 'projectName', ellipsis: true, render: (v: string | null) => v ?? 'Head office' },
              { title: 'Note', dataIndex: 'note', ellipsis: true },
            ]}
          />
          <Divider titlePlacement="start" plain>
            Leave in {month.year()}
          </Divider>
          <Space wrap size={[16, 4]} style={{ marginBottom: 8 }}>
            {(balances ?? [])
              .filter((b) => b.entitled !== null || b.taken)
              .map((b) => (
                <Typography.Text key={b.type}>
                  {LEAVE_TYPE_LABELS[b.type]}: <strong>{b.left ?? b.taken}</strong> {b.left === null ? 'taken' : `left of ${b.entitled}`}
                </Typography.Text>
              ))}
          </Space>
          <Table<LeaveRequestDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={leave?.items ?? []}
            locale={{ emptyText: 'No leave' }}
            onRow={(r) => ({ onClick: () => onOpenLeave(r.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Leave', dataIndex: 'type', render: (v: LeaveRequestDto['type']) => LEAVE_TYPE_LABELS[v] },
              { title: 'Dates', key: 'd', render: (_, r) => leaveSpan(r) },
              { title: 'Days', dataIndex: 'days', align: 'right', width: 60 },
              { title: 'Status', dataIndex: 'status', width: 110, render: (v: LeaveRequestDto['status']) => <LeaveStatusTag status={v} /> },
            ]}
          />
        </>
      )}
      <EmployeeFormModal open={editing} onClose={() => setEditing(false)} employee={data} />
    </Drawer>
  );
}

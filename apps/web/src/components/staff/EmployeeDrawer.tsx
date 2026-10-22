'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, DatePicker, Descriptions, Divider, Drawer, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, EmployeeDto, LeaveRequestDto, StaffAttendanceDto } from '@erp/shared';
import { EMPLOYMENT_TYPE_LABELS, GENDER_LABELS, LEAVE_TYPE_LABELS, canManageStaff, canViewEmployeePrivate } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useEmployee, useEmployeeDocuments, useLeave, useLeaveBalances, useSetEmployeeDocuments, useStaffAttendance } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { AttendanceTag, LeaveStatusTag, clock, leaveSpan } from './staffUi';
import { EmployeeFormModal } from './EmployeeFormModal';
import { EmployeeService } from './EmployeeService';

const none = <Typography.Text type="secondary">-</Typography.Text>;
const val = (x: string | number | null | undefined) => (x === null || x === undefined || x === '' ? none : x);

/** Job and terms for everyone who sees the record; personal, statutory and bank details for HR, payroll and the person. */
function EmployeeDetails({ data }: { data: EmployeeDto }) {
  const p = data.private;
  return (
    <>
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
        <Descriptions.Item label="Designation">{data.designation}</Descriptions.Item>
        <Descriptions.Item label="Department">{val(data.department)}</Descriptions.Item>
        <Descriptions.Item label="Posted at">{data.projectName ?? 'Head office'}</Descriptions.Item>
        <Descriptions.Item label="Reports to">{val(data.reportingToName)}</Descriptions.Item>
        <Descriptions.Item label="Employment">{data.employmentType ? EMPLOYMENT_TYPE_LABELS[data.employmentType] : none}</Descriptions.Item>
        <Descriptions.Item label="Grade">{val(data.grade)}</Descriptions.Item>
        <Descriptions.Item label="Joined">
          {formatDate(data.joinedOn)}
          {!data.isActive && <Tag style={{ marginLeft: 8 }}>Left {formatDate(data.leftOn)}</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label={data.confirmedOn ? 'Confirmed' : 'Probation until'}>{formatDate(data.confirmedOn ?? data.probationEndsOn)}</Descriptions.Item>
        <Descriptions.Item label="Notice period">{data.noticeDays ? `${data.noticeDays} days` : none}</Descriptions.Item>
        <Descriptions.Item label="Phone">{val(data.phone)}</Descriptions.Item>
        <Descriptions.Item label="Login">{data.userEmail ?? <Typography.Text type="secondary">None</Typography.Text>}</Descriptions.Item>
        {p && <Descriptions.Item label="Cost to company">{p.ctcAnnual ? `${formatINR(p.ctcAnnual)} a year` : none}</Descriptions.Item>}
        {p?.exitReason && <Descriptions.Item label="Reason for leaving">{p.exitReason}</Descriptions.Item>}
      </Descriptions>
      {p && (
        <>
          <Divider titlePlacement="start" plain>
            Personal
          </Divider>
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="Date of birth">{formatDate(p.dateOfBirth)}</Descriptions.Item>
            <Descriptions.Item label="Gender">{p.gender ? GENDER_LABELS[p.gender] : none}</Descriptions.Item>
            <Descriptions.Item label="Father or spouse">{val(p.fatherOrSpouseName)}</Descriptions.Item>
            <Descriptions.Item label="Blood group">{val(p.bloodGroup)}</Descriptions.Item>
            <Descriptions.Item label="Email">{val(p.email)}</Descriptions.Item>
            <Descriptions.Item label="In an emergency">{p.emergencyContact ? `${p.emergencyContact}${p.emergencyPhone ? `, ${p.emergencyPhone}` : ''}` : none}</Descriptions.Item>
            <Descriptions.Item label="Address" span={2}>
              {val(p.address)}
            </Descriptions.Item>
          </Descriptions>
          <Divider titlePlacement="start" plain>
            Statutory and bank
          </Divider>
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="PAN">
              <span translate="no">{val(p.pan)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Aadhaar">{p.aadhaarLast4 ? <span translate="no">XXXX-XXXX-{p.aadhaarLast4}</span> : none}</Descriptions.Item>
            <Descriptions.Item label="UAN">
              <span translate="no">{val(p.uan)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="PF number">
              <span translate="no">{val(p.pfNumber)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="ESI number">
              <span translate="no">{val(p.esiNumber)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Bank">{val(p.bankName)}</Descriptions.Item>
            <Descriptions.Item label="Account">
              <span translate="no">{val(p.bankAccountNo)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="IFSC">
              <span translate="no">{val(p.bankIfsc)}</span>
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
    </>
  );
}

/** Copies of ID, certificates and signed letters. HR files them; the person and payroll see them. */
function EmployeeDocuments({ employeeId, admin }: { employeeId: string; admin: boolean }) {
  const { message } = App.useApp();
  const { data } = useEmployeeDocuments(employeeId);
  const save = useSetEmployeeDocuments(employeeId);
  // What was just picked, until the saved list comes back.
  const [files, setFiles] = useState<AttachmentDto[] | null>(null);
  if (!admin) return <AttachmentGallery attachments={data ?? []} />;
  return (
    <>
      <Typography.Paragraph type="secondary">ID proof, certificates, the signed appointment letter: photos or PDFs, up to 20.</Typography.Paragraph>
      <PhotoUpload
        value={files ?? data ?? []}
        max={20}
        onChange={(next) => {
          setFiles(next);
          save.mutateAsync(next.map((a) => a.id)).catch((err) => message.error(errorMessage(err, 'Could not save the documents. Try again.')));
        }}
      />
    </>
  );
}

/** A staff member: their record, service and letters, a month of attendance with leave, and their documents. */
export function EmployeeDrawer({ id, open, onClose, onOpenLeave }: { id: string | null; open: boolean; onClose: () => void; onOpenLeave: (id: string) => void }) {
  const { user } = useAuth();
  const admin = !!user && canManageStaff(user.roleKey);
  const hr = admin || (!!user && canViewEmployeePrivate(user.roleKey));
  const { data, error, refetch } = useEmployee(id ?? undefined);
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const [editing, setEditing] = useState(false);
  // Each record opens on Details.
  const [picked, setPicked] = useState<{ id: string | null; tab: string }>({ id, tab: 'details' });
  const tab = picked.id === id ? picked.tab : 'details';
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
        <Tabs
          activeKey={tab}
          onChange={(t) => setPicked({ id, tab: t })}
          items={[
            { key: 'details', label: 'Details', children: <EmployeeDetails data={data} /> },
            {
              key: 'attendance',
              label: 'Attendance and leave',
              children: (
                <>
                  <Space style={{ marginBottom: 8 }} wrap>
                    <DatePicker picker="month" format="MMM YYYY" allowClear={false} aria-label="Month" value={month} onChange={(d) => d && setMonth(d.startOf('month'))} disabledDate={(d) => d.isAfter(dayjs(), 'month')} />
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
              ),
            },
            ...(hr || data.userId === user?.id
              ? [
                  { key: 'service', label: 'Service and letters', children: <EmployeeService employee={data} /> },
                  { key: 'documents', label: 'Documents', children: <EmployeeDocuments employeeId={data.id} admin={admin} /> },
                ]
              : []),
          ]}
        />
      )}
      <EmployeeFormModal open={editing} onClose={() => setEditing(false)} employee={data} />
    </Drawer>
  );
}

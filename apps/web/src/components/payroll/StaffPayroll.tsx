'use client';

import React from 'react';
import { Alert, Button, Table, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { DownloadOutlined } from '@/components/common/icons';
import type { LeaveType, PayrollRowDto } from '@erp/shared';
import { LEAVE_TYPES, LEAVE_TYPE_LABELS } from '@erp/shared';
import { usePayroll } from '@/lib/queries';
import { downloadXlsx, type ExportColumn } from '@/lib/exportExcel';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { themeFontSize } from '@/lib/theme';

const SHORT: Record<LeaveType, string> = { CASUAL: 'CL', SICK: 'SL', EARNED: 'EL', COMP_OFF: 'Comp-off', UNPAID: 'LWP', ON_DUTY: 'OD', TOUR: 'Tour' };
const n = (v: number) => (v ? v : '');

/** The month's sheet for the payroll provider: one row per employee, exported as Excel. */
export function StaffPayroll({ month, projectId }: { month: string; projectId?: string }) {
  const { data, isLoading, isFetching, error, refetch } = usePayroll(month, projectId);
  const rows = data?.rows ?? [];
  const unmarked = rows.filter((r) => r.notMarked > 0).length;

  const exportColumns: ExportColumn<PayrollRowDto>[] = [
    { header: 'Code', value: (r) => r.employeeCode, width: 10 },
    { header: 'Name', value: (r) => r.fullName, width: 24 },
    { header: 'Designation', value: (r) => r.designation, width: 20 },
    { header: 'Department', value: (r) => r.department, width: 16 },
    { header: 'Posted at', value: (r) => r.projectName ?? 'Head office', width: 30 },
    { header: 'Joined', value: (r) => r.joinedOn, width: 12 },
    { header: 'Left', value: (r) => r.leftOn, width: 12 },
    { header: 'Days on rolls', value: (r) => r.calendarDays },
    { header: 'Sundays and holidays', value: (r) => r.offDays },
    { header: 'Working days', value: (r) => r.workingDays },
    { header: 'Present', value: (r) => r.present },
    ...LEAVE_TYPES.map((t) => ({ header: LEAVE_TYPE_LABELS[t], value: (r: PayrollRowDto) => r.leave[t] })),
    { header: 'Absent', value: (r) => r.absent },
    { header: 'Not marked', value: (r) => r.notMarked },
    { header: 'Loss of pay days', value: (r) => r.lopDays },
    { header: 'Paid days', value: (r) => r.paidDays },
    { header: 'Overtime hours', value: (r) => r.overtimeHours },
    { header: 'Overtime waiting approval', value: (r) => r.overtimePendingHours },
    { header: 'Off days worked', value: (r) => r.offDaysWorked },
  ];

  const columns: TableProps<PayrollRowDto>['columns'] = [
    { title: 'Code', dataIndex: 'employeeCode', width: 100, fixed: 'left', className: 'mono' },
    {
      title: 'Name',
      dataIndex: 'fullName',
      width: 200,
      fixed: 'left',
      render: (v: string, r) => (
        <div>
          <div>{v}</div>
          <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.designation}
          </Typography.Text>
        </div>
      ),
    },
    { title: 'Posted at', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string | null) => v ?? 'Head office' },
    { title: <Tooltip title="Days on the rolls this month">Days</Tooltip>, dataIndex: 'calendarDays', width: 70, align: 'right' },
    { title: <Tooltip title="Sundays and holidays">Off</Tooltip>, dataIndex: 'offDays', width: 60, align: 'right' },
    { title: 'Present', dataIndex: 'present', width: 80, align: 'right' },
    ...LEAVE_TYPES.map((t) => ({ title: <Tooltip title={LEAVE_TYPE_LABELS[t]}>{SHORT[t]}</Tooltip>, key: t, width: 80, align: 'right' as const, render: (_: unknown, r: PayrollRowDto) => n(r.leave[t]) })),
    { title: 'Absent', dataIndex: 'absent', width: 75, align: 'right', render: n },
    { title: <Tooltip title="Working days with no attendance or leave; not deducted">Not marked</Tooltip>, dataIndex: 'notMarked', width: 100, align: 'right', render: (v: number) => (v ? <Typography.Text type="warning">{v}</Typography.Text> : '') },
    { title: <Tooltip title="Loss of pay: absent, leave without pay, the other half of half days">LOP</Tooltip>, dataIndex: 'lopDays', width: 65, align: 'right', render: n },
    { title: 'Paid days', dataIndex: 'paidDays', width: 90, align: 'right', render: (v: number) => <strong>{v}</strong> },
    { title: <Tooltip title="Approved overtime hours">OT h</Tooltip>, dataIndex: 'overtimeHours', width: 70, align: 'right', render: n },
    { title: <Tooltip title="Overtime hours still waiting for the site manager or HR; not paid until approved">OT waiting</Tooltip>, dataIndex: 'overtimePendingHours', width: 90, align: 'right', render: n },
    { title: <Tooltip title="Sundays and holidays worked: comp-off earned">Off worked</Tooltip>, dataIndex: 'offDaysWorked', width: 95, align: 'right', render: n },
    { title: 'On rolls', key: 'rolls', width: 200, render: (_, r) => (r.leftOn ? `Left ${formatDate(r.leftOn)}` : r.joinedOn && r.joinedOn >= (data?.from ?? '') ? `Joined ${formatDate(r.joinedOn)}` : '') },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography.Text type="secondary">Days present, leave and overtime for each person this month. Salary runs use these figures; export them if an outside firm runs your payroll.</Typography.Text>
        <div style={{ flex: 1 }} />
        <Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => downloadXlsx(`payroll-inputs-${month}`, `Staff ${month}`, exportColumns, rows)}>
          Export to Excel
        </Button>
      </div>
      {unmarked > 0 && (
        <Alert type="warning" showIcon style={{ margin: '0 12px 12px' }} title={`${unmarked} ${unmarked === 1 ? 'person has' : 'people have'} working days with no attendance or leave. Those days are not deducted; check them before sending.`} />
      )}
      <Table<PayrollRowDto>
        rowKey="employeeId"
        size="small"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1890 }}
        locale={{ emptyText: 'No staff on the rolls this month' }}
      />
    </>
  );
}

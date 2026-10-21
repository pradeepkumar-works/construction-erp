'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, DatePicker, Input, InputNumber, Segmented, Space, Table, Tag, Typography } from 'antd';
import { formatDayMonth } from '@/lib/format';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import type { StaffAttendanceStatus, StaffRegisterDto, StaffRegisterRowDto } from '@erp/shared';
import { LEAVE_TYPE_LABELS, STAFF_ATTENDANCE_LABELS, STAFF_ATTENDANCE_STATUSES } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useProjectScope } from '@/lib/project-scope';
import { useProjects, useStaffRegister } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { CheckInPlaceTag, OvertimeTag, clock } from './staffUi';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeFontSize } from '@/lib/theme';

type Mark = { status: StaffAttendanceStatus | null; overtimeHours: number | null; note: string };
const NONE = 'NONE';

const fromRow = (r: StaffRegisterRowDto): Mark => ({ status: r.attendance?.status ?? null, overtimeHours: Number(r.attendance?.overtimeHours ?? 0) || null, note: r.attendance?.note ?? '' });
const same = (a: Mark, b: Mark) => a.status === b.status && (a.overtimeHours ?? 0) === (b.overtimeHours ?? 0) && a.note.trim() === b.note.trim();

/** A site's staff for one day: mark present, half day or absent, with overtime; leave and holidays are shown. */
export function StaffRegister() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  // The header's project (UX item 84), else the first: picking one here picks it for every list.
  const [scope, setProjectId] = useProjectScope();
  const projectId = scope ?? projects?.[0]?.id;
  const [date, setDate] = useState(dayjs());
  const day = date.format('YYYY-MM-DD');
  const { data, isLoading, isFetching, error, refetch } = useStaffRegister(projectId, day);
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  useEffect(() => {
    setMarks(Object.fromEntries((data?.rows ?? []).map((r) => [r.employee.id, fromRow(r)])));
  }, [data]);

  const changed = useMemo(() => (data?.rows ?? []).filter((r) => marks[r.employee.id] && !same(marks[r.employee.id], fromRow(r))), [data, marks]);
  const set = (id: string, patch: Partial<Mark>) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<StaffRegisterDto>('/staff/register', {
          projectId,
          date: day,
          entries: changed.map((r) => {
            const m = marks[r.employee.id];
            return { employeeId: r.employee.id, status: m.status, overtimeHours: m.status === 'ABSENT' ? null : m.overtimeHours, note: m.note.trim() || null };
          }),
        })
      ).data,
    onSuccess: (d) => {
      message.success(`Register saved for ${formatDayMonth(d.date)}`);
      qc.setQueryData(['staff', 'register', projectId, day], d);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });

  const markAllPresent = () =>
    setMarks((m) => {
      const next = { ...m };
      for (const r of data?.rows ?? []) {
        const onLeave = r.leave?.status === 'APPROVED' && !r.leave.halfDay;
        if (!next[r.employee.id]?.status && !onLeave) next[r.employee.id] = { ...next[r.employee.id], status: 'PRESENT' };
      }
      return next;
    });

  const columns: TableProps<StaffRegisterRowDto>['columns'] = [
    {
      title: 'Name',
      key: 'name',
      width: 220,
      render: (_, r) => (
        <div>
          <div>{r.employee.fullName}</div>
          <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.employee.employeeCode} · {r.employee.designation}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Leave',
      key: 'leave',
      width: 170,
      render: (_, r) =>
        r.leave ? (
          <Tag color={r.leave.status === 'APPROVED' ? 'blue' : 'orange'}>
            {LEAVE_TYPE_LABELS[r.leave.type]}
            {r.leave.halfDay ? ', half day' : ''}
            {r.leave.status === 'PENDING' ? ' (waiting)' : ''}
          </Tag>
        ) : null,
    },
    {
      title: 'Attendance',
      key: 'status',
      width: 330,
      render: (_, r) => (
        <Segmented
          size="small"
          aria-label={`Attendance for ${r.employee.fullName}`}
          value={marks[r.employee.id]?.status ?? NONE}
          onChange={(v) => set(r.employee.id, { status: v === NONE ? null : (v as StaffAttendanceStatus) })}
          options={[...STAFF_ATTENDANCE_STATUSES.map((s) => ({ value: s, label: STAFF_ATTENDANCE_LABELS[s] })), { value: NONE, label: 'Not marked' }]}
        />
      ),
    },
    {
      title: 'In / out',
      key: 'io',
      width: 180,
      render: (_, r) =>
        r.attendance?.checkIn ? (
          <Space orientation="vertical" size={2}>
            <span translate="no">{`${clock(r.attendance.checkIn)} - ${clock(r.attendance.checkOut)}`}</span>
            <CheckInPlaceTag place={r.attendance.checkInPlace} />
          </Space>
        ) : (
          ''
        ),
    },
    {
      title: 'OT h',
      key: 'ot',
      width: 110,
      render: (_, r) => (
        <Space orientation="vertical" size={2}>
          <InputNumber
            size="small"
            min={0}
            max={16}
            step={0.5}
            style={{ width: 70 }}
            aria-label={`Overtime for ${r.employee.fullName}`}
            disabled={!marks[r.employee.id]?.status || marks[r.employee.id]?.status === 'ABSENT'}
            value={marks[r.employee.id]?.overtimeHours ?? null}
            onChange={(v) => set(r.employee.id, { overtimeHours: v })}
          />
          {/* Overtime from a check-out waits for a decision (v5 item 97); a decider's own entry is approved as saved. */}
          {r.attendance?.overtimeStatus && r.attendance.overtimeStatus !== 'APPROVED' ? <OvertimeTag status={r.attendance.overtimeStatus} /> : null}
        </Space>
      ),
    },
    {
      title: 'Note',
      key: 'note',
      render: (_, r) => <Input size="small" maxLength={300} value={marks[r.employee.id]?.note ?? ''} disabled={!marks[r.employee.id]?.status} onChange={(e) => set(r.employee.id, { note: e.target.value })} />,
    },
  ];

  return (
    <>
      <CardToolbar wrap gap={8} align="center">
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} allowClear={false} placeholder="Select project" />
        <DatePicker value={date} allowClear={false} format="ddd DD MMM YYYY" aria-label="Date" onChange={(d) => d && setDate(d)} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        <div style={{ flex: 1 }} />
        <Space>
          <Button onClick={markAllPresent} disabled={!data?.rows.length}>
            Mark the rest present
          </Button>
          <Button type="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!changed.length}>
            Save{changed.length ? ` (${changed.length})` : ''}
          </Button>
        </Space>
      </CardToolbar>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (data.holiday || data.weeklyOff) && (
        <Alert type="info" showIcon style={{ margin: 12 }} title={`${data.holiday ? `Holiday: ${data.holiday}` : 'Sunday, the weekly off'}. Anyone marked present earns a comp-off.`} />
      )}
      <Table<StaffRegisterRowDto>
        rowKey={(r) => r.employee.id}
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.rows ?? []}
        size="small"
        pagination={false}
        scroll={{ x: 1260 }}
        locale={{ emptyText: projectId ? 'No staff posted at this site' : 'Select a project' }}
      />
    </>
  );
}

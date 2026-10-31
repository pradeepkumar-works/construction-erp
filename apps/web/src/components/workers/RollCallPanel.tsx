'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Input, InputNumber, Radio, Select, Space, Table, Tooltip } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import type { TableProps } from 'antd';
import { CheckOutlined, SaveOutlined } from '@/components/common/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RollCallDto, RollCallRowDto, StaffAttendanceStatus } from '@erp/shared';
import { TIME_HHMM, WORKER_SKILL_LABELS, canManageWorkers, manDays, workerOvertime } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useActivities, useRollCall } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { CardToolbar } from '@/components/common/CardToolbar';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { useProjectScope } from '@/lib/project-scope';
import { themeFontSize } from '@/lib/theme';
import { formatMonthLong } from '@/lib/format';

interface Mark {
  status: StaffAttendanceStatus | null;
  inTime: string;
  outTime: string;
  otHours: number | null;
  activityId: string | null;
  note: string;
}

const fromRow = (r: RollCallRowDto): Mark => ({
  status: r.status,
  inTime: r.inTime ?? '',
  outTime: r.outTime ?? '',
  otHours: r.otHours === null ? null : Number(r.otHours),
  activityId: r.activityId,
  note: r.note ?? '',
});
const same = (a: Mark, b: Mark) =>
  a.status === b.status && a.inTime === b.inTime && a.outTime === b.outTime && a.otHours === b.otHours && a.activityId === b.activityId && a.note === b.note;

/**
 * The day's roll call of a project (v4 item 44): mark each named worker present, on a half day or absent, with in and
 * out times, overtime and the activity they worked on. Saving brings the day's head count in step.
 */
export function RollCallPanel({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  // The header's project (UX item 84): picking one here picks it for every list.
  const [projectPick, setProjectPick] = useProjectScope();
  const projectId = fixedProject ?? projectPick;
  const [date, setDate] = useState<Dayjs>(dayjs());
  const dateStr = date.format('YYYY-MM-DD');
  const { data, isLoading, error, refetch } = useRollCall(projectId, dateStr);
  const { data: activities } = useActivities(projectId);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    setMarks(Object.fromEntries((data?.rows ?? []).map((r) => [r.workerId, fromRow(r)])));
  }, [data]);

  const readOnly = !user || !canManageWorkers(user.roleKey) || !!data?.locked;
  const changed = useMemo(() => (data?.rows ?? []).filter((r) => marks[r.workerId] && !same(marks[r.workerId], fromRow(r))), [data, marks]);
  const set = (id: string, patch: Partial<Mark>) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<RollCallDto>('/workers/roll-call', {
          projectId,
          date: dateStr,
          entries: changed.map((r) => {
            const m = marks[r.workerId];
            return { workerId: r.workerId, status: m.status, inTime: m.inTime || null, outTime: m.outTime || null, otHours: m.otHours, activityId: m.activityId, note: m.note || null };
          }),
        })
      ).data,
    onSuccess: (saved) => {
      const head = (saved.headCount ?? []).reduce((s, l) => s + l.count, 0);
      message.success(`Roll call saved. Head count for the day: ${head}`);
      qc.setQueryData(['workers', 'roll-call', projectId, dateStr], saved);
      qc.invalidateQueries({ queryKey: ['workers'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    meta: FAIL_NOTICE,
  });

  const badTime = changed.some((r) => {
    const m = marks[r.workerId];
    return (m.inTime && !TIME_HHMM.test(m.inTime)) || (m.outTime && !TIME_HHMM.test(m.outTime));
  });

  const live = (data?.rows ?? []).map((r) => marks[r.workerId]?.status ?? null);
  const count = (s: StaffAttendanceStatus | null) => live.filter((x) => x === s).length;
  const words = search.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((r) => !words || `${r.name} ${r.workerNo} ${r.trade} ${r.contractor}`.toLowerCase().includes(words));

  const columns: TableProps<RollCallRowDto>['columns'] = [
    {
      title: 'Worker',
      dataIndex: 'name',
      render: (v, r) => (
        <div>
          <b>{v}</b>
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.workerNo} · {r.trade} · {WORKER_SKILL_LABELS[r.skill]}
          </div>
        </div>
      ),
    },
    { title: 'Contractor', dataIndex: 'contractor', width: 180, responsive: ['lg'] },
    {
      title: 'Mark',
      key: 'status',
      width: 150,
      render: (_, r) => (
        <Radio.Group
          className="roll-mark"
          size="small"
          optionType="button"
          buttonStyle="solid"
          disabled={readOnly}
          value={marks[r.workerId]?.status ?? undefined}
          onChange={(e) => set(r.workerId, { status: e.target.value })}
          options={[
            { value: 'PRESENT', label: <Tooltip title="Present">P</Tooltip> },
            { value: 'HALF_DAY', label: <Tooltip title="Half day">H</Tooltip> },
            { value: 'ABSENT', label: <Tooltip title="Absent">A</Tooltip> },
          ]}
        />
      ),
    },
    {
      title: 'In and out',
      key: 'time',
      width: 150,
      render: (_, r) => {
        const m = marks[r.workerId];
        const off = readOnly || !m || m.status === 'ABSENT';
        return (
          <Space.Compact size="small">
            <Input aria-label="In" placeholder="08:00" maxLength={5} style={{ width: 62 }} disabled={off} value={m?.inTime} onChange={(e) => set(r.workerId, { inTime: e.target.value })} status={m?.inTime && !TIME_HHMM.test(m.inTime) ? 'error' : undefined} />
            <Input aria-label="Out" placeholder="17:00" maxLength={5} style={{ width: 62 }} disabled={off} value={m?.outTime} onChange={(e) => set(r.workerId, { outTime: e.target.value })} status={m?.outTime && !TIME_HHMM.test(m.outTime) ? 'error' : undefined} />
          </Space.Compact>
        );
      },
    },
    {
      title: <Tooltip title="Overtime hours; left empty, it is worked out from in and out (time past 9 hours on site)">OT h</Tooltip>,
      key: 'ot',
      width: 80,
      render: (_, r) => {
        const m = marks[r.workerId];
        const auto = m ? workerOvertime(m.inTime, m.outTime) : null;
        return (
          <InputNumber
            aria-label="OT hours"
            size="small"
            min={0}
            max={16}
            step={0.5}
            style={{ width: 64 }}
            disabled={readOnly || !m || m.status === 'ABSENT'}
            value={m?.otHours}
            placeholder={auto ? String(auto) : undefined}
            onChange={(v) => set(r.workerId, { otHours: v === null || v === undefined ? null : Number(v) })}
          />
        );
      },
    },
    {
      title: 'Activity',
      key: 'activity',
      width: 200,
      render: (_, r) => {
        const m = marks[r.workerId];
        return (
          <Select
            aria-label="Activity"
            size="small"
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            style={{ width: '100%' }}
            placeholder="Activity"
            disabled={readOnly || !m || m.status === 'ABSENT'}
            value={m?.activityId ?? undefined}
            onChange={(v) => set(r.workerId, { activityId: v ?? null })}
            options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))}
          />
        );
      },
    },
    {
      title: 'Note',
      key: 'note',
      width: 170,
      render: (_, r) => <Input size="small" aria-label="Note" disabled={readOnly} value={marks[r.workerId]?.note} onChange={(e) => set(r.workerId, { note: e.target.value })} />,
    },
  ];

  return (
    <div className="roll-call">
      <CardToolbar wrap gap={8} align="center">
        {!fixedProject ? <ProjectSelect value={projectPick} onChange={setProjectPick} placeholder="Choose the project" allowClear={false} /> : null}
        <DatePicker value={date} onChange={(v) => v && setDate(v)} allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), 'day')} aria-label="Date" />
        <Input.Search allowClear placeholder="Search name, trade" aria-label="Search workers" style={{ width: 200 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ flex: 1 }} />
        {!readOnly && data?.rows.length ? (
          <>
            <Button
              icon={<CheckOutlined />}
              onClick={() => setMarks((m) => Object.fromEntries(Object.entries(m).map(([id, x]) => [id, x.status ? x : { ...x, status: 'PRESENT' as const }])))}
              disabled={!count(null)}
            >
              Mark the rest present
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={save.isPending} disabled={!changed.length || badTime} onClick={() => save.mutate()}>
              Save roll call{changed.length ? ` (${changed.length})` : ''}
            </Button>
          </>
        ) : null}
      </CardToolbar>
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      {!projectId ? (
        <div className="text-muted" style={{ padding: 16 }}>
          Choose a project to see its roll call.
        </div>
      ) : (
        <>
          {data?.locked ? (
            <Alert type="info" showIcon style={{ margin: 12 }} title={`Payroll for ${formatMonthLong(dateStr)} is approved (${data.lockedByRun}), so this roll call can no longer change.`} />
          ) : null}
          {data ? (
            <div className="roll-call-summary text-muted" style={{ padding: '8px 12px', fontSize: themeFontSize('fontSizeSM') }}>
              {data.rows.length} on the roll · {count('PRESENT')} present · {count('HALF_DAY')} half day · {count('ABSENT')} absent · {count(null)} not marked ·{' '}
              {live.reduce((s, x) => s + manDays(x), 0)} man-days
              {data.headCount ? (
                <span className="roll-call-headcount">
                  {' '}
                  · Head count sheet: {data.headCount.map((l) => `${l.contractor} ${l.category} ${l.count}`).join(', ') || 'none'}
                </span>
              ) : null}
            </div>
          ) : null}
          <Table<RollCallRowDto>
            rowKey="workerId"
            size="small"
            loading={isLoading}
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1000 }}
            locale={{ emptyText: 'No workers are posted to this project. Add them under Workers.' }}
          />
        </>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Drawer, Flex, Form, Input, Switch, Table, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import type { CalendarBreakDto, WorkingCalendarDto } from '@erp/shared';
import { WEEKDAY_NAMES, type Weekday } from '@erp/shared';
import { tk } from '@/ds';
import { useNotify } from '@/lib/notify';
import { useScheduleAction, useWorkingCalendar } from '@/lib/queries';
import { formatDate, plural } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { DatePicker } from '@/components/common/DatePicker';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import { Loading, QueryError } from '@/components/common/QueryState';
import { Section, SectionStack } from '@/components/common/Section';
import { FormShell } from '@/components/form/FormShell';

/** The week from Monday, as a site plans it. */
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

interface BreakValues {
  range: [Dayjs, Dayjs];
  reason: string;
}

/** Add a break: days the site stops, such as the monsoon. */
function BreakFormModal({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<BreakValues>();
  const action = useScheduleAction<WorkingCalendarDto>(projectId);
  const notify = useNotify();
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      title="New break"
      okText="Add break"
      onSubmit={async (v) => {
        await action.mutateAsync({ path: '/working-calendar/breaks', body: { from: v.range[0].format('YYYY-MM-DD'), to: v.range[1].format('YYYY-MM-DD'), reason: v.reason.trim() } });
        notify.saved(`${v.reason.trim()} added to the calendar`);
      }}
    >
      <Form.Item name="range" label="Site stops" rules={[{ required: true, message: 'Choose the first and last day' }]}>
        <DatePicker.RangePicker style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="reason" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why the site stops, such as Monsoon' }]}>
        <Input maxLength={120} placeholder="Monsoon" />
      </Form.Item>
    </FormShell>
  );
}

/**
 * A project's working calendar (ARCHITECTURE "Working calendar"): whether the schedule counts working days, its weekly days
 * off, its breaks and the holidays it takes from Staff. Each change saves as it is made and moves the Gantt.
 */
export function WorkingCalendarDrawer({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useWorkingCalendar(projectId, open);
  const action = useScheduleAction<WorkingCalendarDto>(projectId);
  const notify = useNotify();
  const [adding, setAdding] = useState(false);

  const set = (body: { on?: boolean; daysOff?: number[] }, done: string) =>
    action.mutate({ method: 'patch', path: '/working-calendar', body }, { onSuccess: () => notify.saved(done), onError: (e) => notify.failed(e) });

  const body = () => {
    if (isLoading) return <Loading />;
    if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
    const edit = data.canEdit;
    const breakCols = [
      { title: 'Why', dataIndex: 'reason', key: 'reason' },
      { title: 'From', dataIndex: 'from', key: 'from', width: 120, render: (v: string) => formatDate(v) },
      { title: 'To', dataIndex: 'to', key: 'to', width: 120, render: (v: string) => formatDate(v) },
      { title: 'Working days', dataIndex: 'days', key: 'days', width: 110, align: 'right' as const, render: (v: number) => <span className="mono">{v}</span> },
      ...(edit
        ? [
            {
              title: '',
              key: 'x',
              width: 48,
              render: (_: unknown, b: CalendarBreakDto) => (
                <ConfirmDelete what={`the break “${b.reason}”`} verb="Remove" onConfirm={() => action.mutateAsync({ method: 'delete', path: `/working-calendar/breaks/${b.id}` })}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${b.reason}`} />
                </ConfirmDelete>
              ),
            },
          ]
        : []),
    ];
    return (
      <SectionStack>
        <Section title="Working days" help="With it on, the critical path, float, lags and the look-ahead count only working days. Off, every day counts.">
          <Flex align="center" gap={tk.space[3]} style={{ marginBottom: tk.space[3] }}>
            <Switch
              checked={data.on}
              disabled={!edit || action.isPending}
              aria-label="Count the schedule in working days"
              onChange={(on) => set(on && !data.daysOff.length ? { on, daysOff: [data.staffWeeklyOff] } : { on }, on ? 'The schedule counts working days' : 'The schedule counts every day')}
            />
            <span>{data.on ? `Counts working days, ${data.workWeek}` : 'Counts every day'}</span>
          </Flex>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: tk.space[2] }}>
            Days off each week
          </Typography.Text>
          <Checkbox.Group
            aria-label="Days off each week"
            value={data.daysOff}
            disabled={!edit || !data.on || action.isPending}
            options={WEEK.map((d) => ({ value: d, label: WEEKDAY_NAMES[d].slice(0, 3) }))}
            onChange={(v) => set({ daysOff: v as number[] }, 'Days off saved')}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: tk.space[2], fontSize: tk.type.caption.fontSize }}>
            Staff at this site have {WEEKDAY_NAMES[data.staffWeeklyOff as Weekday]} off
          </Typography.Text>
        </Section>
        <Section
          title="Breaks"
          help="Days the whole site stops, such as the monsoon or a festival closure. Nothing is scheduled on them."
          extra={
            edit ? (
              <Button size="small" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
                New break
              </Button>
            ) : null
          }
        >
          <Table<CalendarBreakDto> size="small" rowKey="id" pagination={false} dataSource={data.breaks} columns={breakCols} scroll={{ x: 520 }} locale={{ emptyText: 'No breaks' }} />
        </Section>
        <Section title="Holidays">
          <p className="text-muted" style={{ marginTop: 0 }}>
            {plural(data.holidays.length, 'holiday')} from the company&apos;s and this site&apos;s list, kept in <Link href="/staff?tab=holidays">Holidays</Link>.
          </p>
          <Table
            size="small"
            rowKey={(h) => `${h.date}-${h.name}`}
            pagination={false}
            dataSource={data.holidays}
            scroll={{ y: 280 }}
            locale={{ emptyText: 'No holidays' }}
            columns={[
              { title: 'Date', dataIndex: 'date', key: 'date', width: 130, render: (v: string) => formatDate(v) },
              { title: 'Holiday', dataIndex: 'name', key: 'name', render: (v: string, h) => (h.siteOnly ? <span>{v} <AppTag variant="kind">This site</AppTag></span> : v) },
            ]}
          />
        </Section>
      </SectionStack>
    );
  };

  return (
    <Drawer open={open} onClose={onClose} title="Working calendar" size="large" destroyOnHidden>
      {body()}
      {adding ? <BreakFormModal projectId={projectId} open onClose={() => setAdding(false)} /> : null}
    </Drawer>
  );
}

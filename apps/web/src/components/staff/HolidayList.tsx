'use client';

import React, { useState } from 'react';
import { HelpLink } from '@/components/common/Help';
import { App, Button, Form, Input, Select, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { HolidayDto, StaffCalendarDto, Weekday } from '@erp/shared';
import { WEEKDAYS, WEEKDAY_NAMES, canManageStaff, weeklyOffWords } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useHolidays, useProjects, useSaveStaffCalendar, useStaffCalendar } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { CardToolbar } from '@/components/common/CardToolbar';
import { FormShell } from '@/components/form/FormShell';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { tk } from '@/ds';

const WEEKDAY_OPTIONS = WEEKDAYS.map((d) => ({ value: d, label: WEEKDAY_NAMES[d] }));

/** The weekly off in a line: the company's, and the sites that keep another day. */
function weeklyOffLine(cal: StaffCalendarDto): string {
  const own = cal.sites.filter((x) => x.weeklyOff !== null && x.weeklyOff !== cal.weeklyOff);
  const rest = own.map((x) => `${WEEKDAY_NAMES[x.weeklyOff as Weekday]} at ${x.projectName}`);
  return `${weeklyOffWords(cal.weeklyOff)} are the weekly off${own.length ? `; ${rest.join(', ')}` : ' at every site'}.`;
}

type CalendarValues = { weeklyOff: Weekday } & Record<string, Weekday | null | undefined>;

/** HR sets the company's weekly off and any site that keeps another day. */
function WeeklyOffsModal({ open, onClose, cal }: { open: boolean; onClose: () => void; cal: StaffCalendarDto }) {
  const [form] = Form.useForm<CalendarValues>();
  const { message } = App.useApp();
  const save = useSaveStaffCalendar();
  const company = Form.useWatch('weeklyOff', form) ?? cal.weeklyOff;
  const initial: CalendarValues = { weeklyOff: cal.weeklyOff, ...Object.fromEntries(cal.sites.map((x) => [`site_${x.projectId}`, x.weeklyOff])) };
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      title="Weekly offs"
      okText="Save"
      projectDefault={false}
      onSubmit={async (v) => {
        await save.mutateAsync({ weeklyOff: v.weeklyOff, sites: cal.sites.map((x) => ({ projectId: x.projectId, weeklyOff: v[`site_${x.projectId}`] ?? null })) });
        message.success('Weekly offs saved');
      }}
    >
      <Form form={form} layout="vertical" initialValues={initial}>
        <HelpLink>Leave does not count the weekly off, and working on it earns a comp-off. A change counts for every date, so leave already approved keeps the days it was given; salary runs already paid keep their figures.</HelpLink>
        <Form.Item name="weeklyOff" label="Company's weekly off" rules={[{ required: true, message: 'Choose the day' }]}>
          <Select options={WEEKDAY_OPTIONS} />
        </Form.Item>
        {cal.sites.length > 0 && (
          <Typography.Text strong style={{ display: 'block', marginBottom: tk.space[2] }}>
            Sites that keep another day
          </Typography.Text>
        )}
        {cal.sites.map((x) => (
          <Form.Item key={x.projectId} name={`site_${x.projectId}`} label={x.projectName}>
            <Select allowClear placeholder={`The company's (${WEEKDAY_NAMES[company]})`} options={WEEKDAY_OPTIONS} />
          </Form.Item>
        ))}
      </Form>
    </FormShell>
  );
}

/** Holidays for the year: for every site or one site. Leave does not count them; working one earns a comp-off. */
export function HolidayList() {
  const { user } = useAuth();
  const admin = !!user && canManageStaff(user.roleKey);
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [year, setYear] = useState(dayjs().year());
  const { data, isLoading, error, refetch } = useHolidays(year);
  const { data: projects } = useProjects();
  const [adding, setAdding] = useState(false);
  const [offs, setOffs] = useState(false);
  const { data: cal } = useStaffCalendar();
  const [form] = Form.useForm<{ date: dayjs.Dayjs; name: string; projectId?: string }>();

  const add = useMutation({
    mutationFn: async (v: { date: dayjs.Dayjs; name: string; projectId?: string }) => (await api.post<HolidayDto>('/staff/holidays', { date: v.date.format('YYYY-MM-DD'), name: v.name.trim(), projectId: v.projectId ?? null })).data,
    onSuccess: (h) => {
      message.success(`${h.name} added`);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/staff/holidays/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <>
      <CardToolbar gap={8} align="center">
        <Select value={year} onChange={setYear} style={{ width: 100 }} aria-label="Year" options={[-1, 0, 1].map((d) => ({ value: dayjs().year() + d, label: String(dayjs().year() + d) }))} />
        {cal && <Typography.Text type="secondary">{weeklyOffLine(cal)}</Typography.Text>}
        <div style={{ flex: 1 }} />
        {admin && cal && <Button onClick={() => setOffs(true)}>Weekly offs</Button>}
        {admin && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setAdding(true);
            }}
          >
            New holiday
          </Button>
        )}
      </CardToolbar>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<HolidayDto>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={false}
        locale={{ emptyText: 'No holidays listed for this year' }}
        columns={[
          { title: 'Date', dataIndex: 'date', width: 180, render: (v: string) => dayjs(v).format('ddd DD MMM YYYY') },
          { title: 'Holiday', dataIndex: 'name' },
          { title: 'Site', dataIndex: 'projectName', render: (v: string | null) => v ?? 'Every site' },
          ...(admin
            ? [
                {
                  title: '',
                  key: 'actions',
                  width: 90,
                  render: (_: unknown, h: HolidayDto) => (
                    <ConfirmDelete verb="Remove" what={h.name} description="It comes off the holiday calendar." onConfirm={() => remove.mutateAsync(h.id)}>
                      <Button size="small" danger>
                        Remove
                      </Button>
                    </ConfirmDelete>
                  ),
                },
              ]
            : []),
        ]}
      />
      {admin && cal && offs && <WeeklyOffsModal open onClose={() => setOffs(false)} cal={cal} />}
      {/* Blank Where is every site, so the header's project is not put in. */}
      <FormShell open={adding} onClose={() => setAdding(false)} form={form} layout="modal" title="New holiday" okText="Save" onSubmit={(v) => add.mutateAsync(v)} projectDefault={false}>
        <Form form={form} layout="vertical">
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Choose the date' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="name" label="Holiday" rules={[{ required: true, whitespace: true, message: 'Name the holiday' }]}>
            <Input maxLength={100} placeholder="Ratha Yatra" />
          </Form.Item>
          <Form.Item name="projectId" label="Where" extra="Blank for every site">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Every site" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
          </Form.Item>
        </Form>
      </FormShell>
    </>
  );
}

'use client';

import React, { useState } from 'react';
import { App, Button, DatePicker, Form, Input, Popconfirm, Select, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { HolidayDto } from '@erp/shared';
import { canManageStaff } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useHolidays, useProjects } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { CardToolbar } from '@/components/common/CardToolbar';
import { FormShell } from '@/components/form/FormShell';

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
  const [form] = Form.useForm<{ date: dayjs.Dayjs; name: string; projectId?: string }>();

  const add = useMutation({
    mutationFn: async (v: { date: dayjs.Dayjs; name: string; projectId?: string }) => (await api.post<HolidayDto>('/staff/holidays', { date: v.date.format('YYYY-MM-DD'), name: v.name.trim(), projectId: v.projectId ?? null })).data,
    onSuccess: (h) => {
      message.success(`${h.name} added`);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/staff/holidays/${id}`)).data,
    onSuccess: () => {
      message.success('Holiday removed');
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <>
      <CardToolbar gap={8} align="center">
        <Select value={year} onChange={setYear} style={{ width: 100 }} aria-label="Year" options={[-1, 0, 1].map((d) => ({ value: dayjs().year() + d, label: String(dayjs().year() + d) }))} />
        <Typography.Text type="secondary">Sundays are the weekly off at every site.</Typography.Text>
        <div style={{ flex: 1 }} />
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
          { title: 'Where', dataIndex: 'projectName', render: (v: string | null) => v ?? 'Every site' },
          ...(admin
            ? [
                {
                  title: '',
                  key: 'actions',
                  width: 90,
                  render: (_: unknown, h: HolidayDto) => (
                    <Popconfirm title={`Remove ${h.name}?`} okText="Remove" onConfirm={() => remove.mutate(h.id)}>
                      <Button size="small" danger>
                        Remove
                      </Button>
                    </Popconfirm>
                  ),
                },
              ]
            : []),
        ]}
      />
      {/* Blank Where is every site, so the header's project is not put in. */}
      <FormShell open={adding} onClose={() => setAdding(false)} form={form} layout="modal" title="New holiday" okText="Save" onSubmit={(v) => add.mutateAsync(v)} projectDefault={false}>
        <Form form={form} layout="vertical">
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="name" label="Holiday" rules={[{ required: true, whitespace: true, message: 'Name the holiday' }]}>
            <Input maxLength={100} placeholder="Ratha Yatra" />
          </Form.Item>
          <Form.Item name="projectId" label="Where" extra="Blank for every site">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Every site" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
          </Form.Item>
        </Form>
      </FormShell>
    </>
  );
}

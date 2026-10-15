'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Input, InputNumber, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ActivityTemplateDto, ActivityTemplateItem } from '@erp/shared';
import { MAX_TEMPLATE_DAYS, MAX_TEMPLATE_ITEMS, PROJECT_TYPE_LABELS, templateSpan } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { TimelineBar } from './TimelineBar';
import { UnitInput } from '@/components/common/UnitInput';

type Row = ActivityTemplateItem & { key: number };
let seq = 0;
const withKeys = (items: ActivityTemplateItem[]): Row[] => items.map((i) => ({ ...i, key: ++seq }));

/** Edit one project type's standard activities: name, unit, start day and duration, in order. */
export function TemplateEditor({ template, editable }: { template: ActivityTemplateDto; editable: boolean }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => withKeys(template.items));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setRows(withKeys(template.items));
    setDirty(false);
  }, [template]);

  const span = templateSpan(rows);
  const update = (key: number, patch: Partial<ActivityTemplateItem>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const move = (idx: number, by: number) => {
    setRows((rs) => {
      const next = [...rs];
      const [r] = next.splice(idx, 1);
      next.splice(idx + by, 0, r);
      return next;
    });
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: async (items: ActivityTemplateItem[]) => (await api.put<ActivityTemplateDto>(`/activity-templates/${template.projectType}`, { items })).data,
    onSuccess: (t) => {
      message.success(t.isDefault ? 'Back to the standard list' : 'Template saved');
      qc.invalidateQueries({ queryKey: ['activity-templates'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const names = rows.map((r) => r.name.trim().toLowerCase());
  const problems = [
    ...(rows.some((r) => !r.name.trim() || !r.unit.trim()) ? ['Every activity needs a name and a unit.'] : []),
    ...(new Set(names).size !== names.length ? ['Two activities have the same name.'] : []),
  ];

  const columns: TableProps<Row>['columns'] = [
    { title: '#', key: 'n', width: 44, render: (_, __, i) => i + 1 },
    {
      title: 'Activity',
      dataIndex: 'name',
      render: (v, r) => (editable ? <Input value={v} maxLength={120} onChange={(e) => update(r.key, { name: e.target.value })} status={!v.trim() ? 'error' : undefined} /> : v),
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      width: 110,
      render: (v, r) => (editable ? <UnitInput value={v} onChange={(u) => update(r.key, { unit: u })} style={{ width: '100%' }} /> : v),
    },
    {
      title: 'Starts on day',
      dataIndex: 'startDay',
      width: 120,
      render: (v, r) => (editable ? <InputNumber min={0} max={MAX_TEMPLATE_DAYS} precision={0} value={v} onChange={(n) => update(r.key, { startDay: n ?? 0 })} style={{ width: '100%' }} /> : v),
    },
    {
      title: 'Days',
      dataIndex: 'durationDays',
      width: 100,
      render: (v, r) => (editable ? <InputNumber min={1} max={MAX_TEMPLATE_DAYS} precision={0} value={v} onChange={(n) => update(r.key, { durationDays: n ?? 1 })} style={{ width: '100%' }} /> : v),
    },
    { title: `Schedule (${span} days)`, key: 'bar', width: 260, render: (_, r) => <TimelineBar start={r.startDay} length={r.durationDays} span={span} /> },
    ...(editable
      ? [
          {
            title: '',
            key: 'actions',
            width: 120,
            render: (_: unknown, r: Row, i: number) => (
              <Space size={0}>
                <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    setRows((rs) => rs.filter((x) => x.key !== r.key));
                    setDirty(true);
                  }}
                />
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Typography.Text type="secondary">
          {template.isDefault ? <Tag color="blue">Standard list</Tag> : <Tag color="green">Your list</Tag>}
          {rows.length} activities for a {PROJECT_TYPE_LABELS[template.projectType].toLowerCase()} project. When a project has start and end dates the schedule is stretched or squeezed to fit them.
        </Typography.Text>
        {editable ? (
          <Space>
            {!template.isDefault ? (
              <Popconfirm title="Go back to the standard list?" description="Your changes to this type are removed." onConfirm={() => save.mutate([])}>
                <Button>Reset to standard</Button>
              </Popconfirm>
            ) : null}
            <Button
              icon={<PlusOutlined />}
              disabled={rows.length >= MAX_TEMPLATE_ITEMS}
              onClick={() => {
                const last = rows[rows.length - 1];
                setRows((rs) => [...rs, { key: ++seq, name: '', unit: 'Cum', startDay: last ? last.startDay + last.durationDays : 0, durationDays: 30 }]);
                setDirty(true);
              }}
            >
              Add activity
            </Button>
            <Button type="primary" disabled={!dirty || problems.length > 0} loading={save.isPending} onClick={() => save.mutate(rows.map(({ key: _k, ...i }) => ({ ...i, name: i.name.trim(), unit: i.unit.trim() })))}>
              Save
            </Button>
          </Space>
        ) : null}
      </div>
      {problems.length && dirty ? <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problems.join(' ')} /> : null}
      <Table<Row> rowKey="key" columns={columns} dataSource={rows} size="small" pagination={false} scroll={{ x: 900 }} />
    </div>
  );
}

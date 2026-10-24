'use client';

import React, { useState } from 'react';
import { App, Button, Form, Input, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChecklistTemplateDto } from '@erp/shared';
import { canManageChecklists } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useChecklists } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { CardToolbar } from '@/components/common/CardToolbar';
import { FormShell } from '@/components/form/FormShell';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

const lines = (v: string) =>
  v
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** The organisation's inspection checklists: the points an inspector checks for a kind of work. */
export function ChecklistsPanel() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useChecklists();
  const [editing, setEditing] = useState<ChecklistTemplateDto | 'new' | null>(null);
  const [form] = Form.useForm<{ name: string; items: string }>();
  const mayEdit = !!user && canManageChecklists(user.roleKey);

  const save = useMutation({
    mutationFn: async (v: { name: string; items: string }) => {
      const body = { name: v.name.trim(), items: lines(v.items) };
      return editing && editing !== 'new' ? (await api.patch(`/inspections/checklists/${editing.id}`, body)).data : (await api.post('/inspections/checklists', body)).data;
    },
    onSuccess: () => {
      message.success('Checklist saved');
      qc.invalidateQueries({ queryKey: ['inspections', 'checklists'] });
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/inspections/checklists/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries();
    },
    meta: FAIL_NOTICE,
  });
  const standard = useMutation({
    mutationFn: async () => (await api.post<ChecklistTemplateDto[]>('/inspections/checklists/standard')).data,
    onSuccess: () => {
      message.success('Standard checklists added');
      qc.invalidateQueries({ queryKey: ['inspections', 'checklists'] });
    },
    meta: FAIL_NOTICE,
  });

  const open = (t: ChecklistTemplateDto | 'new') => {
    setEditing(t);
    form.setFieldsValue(t === 'new' ? { name: '', items: '' } : { name: t.name, items: t.items.join('\n') });
  };

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <CardToolbar wrap gap={8} align="center">
        <Typography.Text type="secondary">Pick a checklist for each activity on the project&apos;s Activities tab; its inspections start from it.</Typography.Text>
        {mayEdit && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button onClick={() => standard.mutate()} loading={standard.isPending}>
              Add standard checklists
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
              New checklist
            </Button>
          </div>
        )}
      </CardToolbar>
      <Table<ChecklistTemplateDto>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={false}
        expandable={{
          expandedRowRender: (t) => (
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {t.items.map((i, n) => (
                <li key={n}>{i}</li>
              ))}
            </ol>
          ),
        }}
        locale={{ emptyText: mayEdit ? 'No checklist yet. Add the standard ones or make your own.' : 'No checklist yet' }}
        columns={[
          { title: 'Checklist', dataIndex: 'name' },
          { title: 'Points', key: 'points', width: 90, align: 'right', render: (_, t) => t.items.length },
          { title: 'Activities', dataIndex: 'activityCount', width: 100, align: 'right' },
          ...(mayEdit
            ? [
                {
                  title: '',
                  key: 'a',
                  width: 100,
                  render: (_: unknown, t: ChecklistTemplateDto) => (
                    <Space size={4}>
                      <Button size="small" icon={<EditOutlined />} onClick={() => open(t)} aria-label={`Edit ${t.name}`} />
                      <ConfirmDelete what={`the checklist “${t.name}”`} description="Inspections already requested keep their points." onConfirm={() => remove.mutateAsync(t.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${t.name}`} />
                      </ConfirmDelete>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <FormShell open={!!editing} onClose={() => setEditing(null)} form={form} layout="modal" title={editing === 'new' ? 'New checklist' : 'Edit checklist'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the checklist' }]}>
            <Input maxLength={120} placeholder="e.g. Waterproofing before tiling" />
          </Form.Item>
          <Form.Item
            name="items"
            label="Points to check"
            extra="One per line."
            rules={[{ validator: async (_, v: string | undefined) => (lines(v ?? '').length ? undefined : Promise.reject(new Error('Add at least one point'))) }]}
          >
            <Input.TextArea rows={8} />
          </Form.Item>
        </Form>
      </FormShell>
    </>
  );
}

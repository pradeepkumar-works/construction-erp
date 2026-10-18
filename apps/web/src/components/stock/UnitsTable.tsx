'use client';

import React, { useState } from 'react';
import { App, Button, Form, Input, Popconfirm, Space, Switch, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UnitDto } from '@erp/shared';
import { canManageStore } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useUnits } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { CardToolbar } from '@/components/common/CardToolbar';
import { FormShell } from '@/components/form/FormShell';

interface UnitForm {
  code: string;
  name: string;
}

/** Unit master (v4 item 48): the units every quantity field suggests. Units in use can be switched off but not removed. */
export function UnitsTable() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const mayManage = !!user && canManageStore(user.roleKey);
  const { data, isLoading, isFetching, error, refetch } = useUnits();
  const [editing, setEditing] = useState<UnitDto | 'new' | null>(null);
  const [form] = Form.useForm<UnitForm>();

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['units'] });
  };
  const save = useMutation({
    mutationFn: async (v: UnitForm) => {
      const body = { code: v.code.trim(), name: v.name.trim() };
      return editing && editing !== 'new' ? (await api.patch<UnitDto>(`/units/${editing.id}`, body)).data : (await api.post<UnitDto>('/units', body)).data;
    },
    onSuccess: (u) => done(`${u.code} saved`),
    onError: (e) => message.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: async (u: UnitDto) => (await api.patch<UnitDto>(`/units/${u.id}`, { isActive: !u.isActive })).data,
    onSuccess: (u) => done(`${u.code} ${u.isActive ? 'switched on' : 'switched off'}`),
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (u: UnitDto) => (await api.delete(`/units/${u.id}`)).data,
    onSuccess: () => done('Unit removed'),
    onError: (e) => message.error(errorMessage(e)),
  });

  const open = (u: UnitDto | 'new') => {
    setEditing(u);
    form.resetFields();
    if (u !== 'new') form.setFieldsValue({ code: u.code, name: u.name });
  };

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <CardToolbar gap={8} wrap align="center">
        <Typography.Text type="secondary">Quantity fields across the app suggest these units. Switch off the ones your company does not use.</Typography.Text>
        {mayManage ? (
          <Button icon={<PlusOutlined />} onClick={() => open('new')} style={{ marginLeft: 'auto' }}>
            New unit
          </Button>
        ) : null}
      </CardToolbar>
      <Table<UnitDto>
        className="units-table"
        size="middle"
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data ?? []}
        pagination={false}
        columns={[
          { title: 'Unit', dataIndex: 'code', width: 120, render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
          { title: 'Name', dataIndex: 'name' },
          { title: 'Items', dataIndex: 'itemCount', width: 100, align: 'right', render: (v: number) => v || '-' },
          {
            title: 'In use',
            key: 'active',
            width: 100,
            render: (_, u) => <Switch size="small" checked={u.isActive} disabled={!mayManage || toggle.isPending} onChange={() => toggle.mutate(u)} aria-label={`${u.code} in use`} />,
          },
          ...(mayManage
            ? [
                {
                  title: '',
                  key: 'actions',
                  width: 96,
                  render: (_: unknown, u: UnitDto) => (
                    <Space size={4}>
                      <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${u.code}`} onClick={() => open(u)} />
                      {u.itemCount === 0 ? (
                        <Popconfirm title={`Remove ${u.code}?`} okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(u)}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${u.code}`} />
                        </Popconfirm>
                      ) : null}
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <FormShell open={!!editing} onClose={() => setEditing(null)} form={form} layout="modal" width={520} title={editing === 'new' ? 'New unit' : 'Edit unit'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
        <Form form={form} layout="vertical" className="unit-form">
          <Form.Item
            name="code"
            label="Unit"
            rules={[{ required: true, whitespace: true, message: 'Enter the unit, e.g. Cum' }]}
            extra={editing && editing !== 'new' && editing.itemCount > 0 ? 'Items use this unit, so it cannot be renamed.' : 'As it is written on quantities, e.g. Cum'}
          >
            <Input maxLength={20} disabled={!!editing && editing !== 'new' && editing.itemCount > 0} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name, e.g. Cubic metre' }]}>
            <Input maxLength={60} placeholder="Cubic metre" />
          </Form.Item>
        </Form>
      </FormShell>
    </>
  );
}

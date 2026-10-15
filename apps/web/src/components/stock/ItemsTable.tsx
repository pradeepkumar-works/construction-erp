'use client';

import React, { useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemDto, ItemSortField } from '@erp/shared';
import { canManageStore } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStockItems } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { SearchBox } from '@/components/common/SearchBox';
import { UnitInput } from '@/components/common/UnitInput';

interface ItemForm {
  name: string;
  unit: string;
  category?: string;
  rate?: number | null;
}

/** Item master. GRNs add items from the request lines; the store manager or an approver can add, rename and tidy them here. */
export function ItemsTable() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const mayManage = !!user && canManageStore(user.roleKey);
  const list = useListState<ItemSortField>({ sortBy: 'name', sortOrder: 'asc', pageSize: 50 });
  const { data, isLoading, isFetching, error, refetch } = useStockItems(list.params);
  const [editing, setEditing] = useState<ItemDto | 'new' | null>(null);
  const [form] = Form.useForm<ItemForm>();

  const save = useMutation({
    mutationFn: async (v: ItemForm) => {
      const body = { name: v.name, unit: v.unit, category: v.category?.trim() || null, rate: v.rate === undefined || v.rate === null ? null : String(v.rate) };
      return editing && editing !== 'new' ? (await api.patch<ItemDto>(`/stock/items/${editing.id}`, body)).data : (await api.post<ItemDto>('/stock/items', body)).data;
    },
    onSuccess: (i) => {
      message.success(`${i.name} saved`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cost'] });
      setEditing(null);
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: async (i: ItemDto) => (await api.delete(`/stock/items/${i.id}`)).data,
    onSuccess: () => {
      message.success('Item deleted');
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const open = (i: ItemDto | 'new') => {
    setEditing(i);
    form.resetFields();
    if (i !== 'new') form.setFieldsValue({ name: i.name, unit: i.unit, category: i.category ?? undefined, rate: i.rate === null ? undefined : Number(i.rate) });
  };

  const sort = (key: ItemSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<ItemDto>['columns'] = [
    { title: 'Item', dataIndex: 'name', ...sort('name') },
    { title: 'Unit', dataIndex: 'unit', width: 100, ...sort('unit') },
    { title: 'Category', dataIndex: 'category', width: 160, ...sort('category'), render: (v) => (v ? <Tag style={{ margin: 0 }}>{v}</Tag> : <span className="text-muted">-</span>) },
    { title: 'Rate (₹)', dataIndex: 'rate', width: 130, align: 'right', className: 'mono', render: (v: string | null, r) => (v === null ? <span className="text-muted">-</span> : `${formatINR(v, true).replace('₹ ', '')} / ${r.unit}`) },
    { title: 'Projects with stock', dataIndex: 'projectCount', width: 160, align: 'center' },
    { title: 'Added', dataIndex: 'createdAt', width: 130, ...sort('createdAt'), render: (v) => formatDate(v) },
    ...(mayManage
      ? [
          {
            title: '',
            key: 'actions',
            width: 100,
            render: (_: unknown, r: ItemDto) => (
              <Space size={2}>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Edit" />
                <Popconfirm title={`Delete ${r.name}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(r)} disabled={r.projectCount > 0}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={r.projectCount > 0} title={r.projectCount > 0 ? 'Has stock movements' : undefined} aria-label="Delete" />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
        <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search item, unit or category" />
        {mayManage ? (
          <Button icon={<PlusOutlined />} onClick={() => open('new')} style={{ marginLeft: 'auto' }}>
            Add item
          </Button>
        ) : null}
      </div>
      <Table<ItemDto> size="middle" rowKey="id" loading={isLoading || isFetching} dataSource={data?.items ?? []} columns={columns} {...list.tableProps<ItemDto>(data?.total)} />
      <Modal
        open={!!editing}
        title={editing === 'new' ? 'Add item' : 'Edit item'}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okButtonProps={{ loading: save.isPending }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="unit"
            label="Unit"
            rules={[{ required: true, whitespace: true, message: 'Required' }]}
            extra={editing && editing !== 'new' && editing.projectCount > 0 ? 'The unit is fixed once the item has stock movements.' : undefined}
          >
            <UnitInput maxLength={30} disabled={!!editing && editing !== 'new' && editing.projectCount > 0} />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Input maxLength={60} placeholder="e.g. Cement, Steel, Fuel" />
          </Form.Item>
          <Form.Item name="rate" label="Standard rate (₹ per unit)" extra="Values material issued in the project cost view.">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

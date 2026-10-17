'use client';

import React, { useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemDto, ItemSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, canManageStore } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStockItems } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { SearchBox } from '@/components/common/SearchBox';
import { UnitInput } from '@/components/common/UnitInput';
import { CardToolbar } from '@/components/common/CardToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';

const NO_KEYS: string[] = [];

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

  const frame = useListFrame<ItemSortField, ItemDto>({
    list: 'stock-items',
    url: false,
    keys: NO_KEYS,
    sortBy: 'name',
    sortOrder: 'asc',
    sortFields: LIST_SORT_FIELDS.items,
    projectScoped: false,
    columns: (sortOrderFor): ListColumn<ItemDto>[] => {
      const sort = (key: ItemSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Item', dataIndex: 'name', locked: true, ...sort('name') },
        { title: 'Unit', dataIndex: 'unit', width: 100, ...sort('unit') },
        { title: 'Category', dataIndex: 'category', width: 160, ...sort('category'), render: (v) => (v ? <Tag style={{ margin: 0 }}>{v}</Tag> : <Typography.Text type="secondary">-</Typography.Text>) },
        {
          key: 'rate',
          title: 'Rate (₹)',
          label: 'Rate',
          dataIndex: 'rate',
          width: 130,
          align: 'right',
          className: 'mono',
          render: (v: string | null, r) => (v === null ? <Typography.Text type="secondary">-</Typography.Text> : `${formatINR(v, true).replace('₹ ', '')} / ${r.unit}`),
        },
        { key: 'projectCount', title: 'Projects with stock', dataIndex: 'projectCount', width: 160, align: 'center' },
        { title: 'Added', dataIndex: 'createdAt', width: 130, ...sort('createdAt'), render: (v) => formatDate(v) },
        ...(mayManage
          ? [
              {
                title: '',
                key: 'actions',
                label: 'Actions',
                locked: true,
                width: 100,
                render: (_: unknown, r: ItemDto) => (
                  <Space size={2}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Edit" />
                    <Popconfirm title={`Delete ${r.name}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(r)} disabled={r.projectCount > 0}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={r.projectCount > 0} title={r.projectCount > 0 ? 'Has stock movements' : undefined} aria-label="Delete" />
                    </Popconfirm>
                  </Space>
                ),
              } satisfies ListColumn<ItemDto>,
            ]
          : []),
      ];
    },
  });
  const { page } = frame;
  const { data, isLoading, isFetching, error, refetch } = useStockItems({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder });
  const rows = data?.items ?? [];

  const newButton = mayManage ? (
    <Button icon={<PlusOutlined />} onClick={() => open('new')} style={{ marginLeft: 'auto' }}>
      Add item
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <CardToolbar wrap gap={8} align="center">
        <SearchBox value={page.search} onChange={page.setSearch} placeholder="Search item, unit or category" aria-label="Search items" />
        {newButton}
      </CardToolbar>
      <DataTable<ItemDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<ItemDto>(data?.total)}
        onOpen={
          mayManage
            ? (id) => {
                const i = rows.find((x) => x.id === id);
                if (i) open(i);
              }
            : undefined
        }
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={900}
        emptyText={<EmptyArt art="entries" title={page.params.q ? 'No item matches this search' : 'No items yet. GRNs add them from the request lines.'} />}
        emptyAction={newButton}
      />
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

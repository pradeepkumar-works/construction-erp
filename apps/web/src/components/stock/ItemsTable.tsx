'use client';

import React, { useState } from 'react';
import { App, Button, Checkbox, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemDto, ItemSortField, PipeMaterial } from '@erp/shared';
import { LIST_SORT_FIELDS, PIPE_MATERIALS, PIPE_MATERIAL_LABELS, canManageStore, pipeSizeLabel, pipeSizeOf } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useStockItems } from '@/lib/queries';
import { formatDate, formatINR, RUPEE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { SearchBox } from '@/components/common/SearchBox';
import { UnitInput } from '@/components/common/UnitInput';
import { CardToolbar } from '@/components/common/CardToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

const NO_KEYS: string[] = [];

interface ItemForm {
  name: string;
  unit: string;
  category?: string;
  rate?: number | null;
  isFuel?: boolean;
  pipeDiameterMm?: number | null;
  pipeMaterial?: PipeMaterial | null;
  kgPerMetre?: number | null;
}

/** Item master. GRNs add items from the request lines; the store manager or an approver can add, rename and tidy them here. */
export function ItemsTable() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const mayManage = !!user && canManageStore(user.roleKey);
  const [editing, setEditing] = useState<ItemDto | 'new' | null>(null);
  const [form] = Form.useForm<ItemForm>();
  const watchedName = Form.useWatch('name', form);
  const readSize = watchedName ? pipeSizeOf({ name: watchedName }) : null;

  const save = useMutation({
    mutationFn: async (v: ItemForm) => {
      const body = { name: v.name, unit: v.unit, category: v.category?.trim() || null, rate: v.rate === undefined || v.rate === null ? null : String(v.rate), isFuel: !!v.isFuel,
        pipeDiameterMm: v.pipeDiameterMm ?? null,
        pipeMaterial: v.pipeMaterial ?? null,
        kgPerMetre: v.kgPerMetre === undefined || v.kgPerMetre === null ? null : String(v.kgPerMetre),
      };
      return editing && editing !== 'new' ? (await api.patch<ItemDto>(`/stock/items/${editing.id}`, body)).data : (await api.post<ItemDto>('/stock/items', body)).data;
    },
    onSuccess: (i) => {
      message.success(`${i.name} saved`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cost'] });
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async (i: ItemDto) => (await api.delete(`/stock/items/${i.id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
    meta: FAIL_NOTICE,
  });

  const open = (i: ItemDto | 'new') => {
    setEditing(i);
    form.resetFields();
    if (i !== 'new') form.setFieldsValue({ name: i.name, unit: i.unit, category: i.category ?? undefined, rate: i.rate === null ? undefined : Number(i.rate), isFuel: !!i.isFuel,
        pipeDiameterMm: i.pipeDiameterMm ?? undefined,
        pipeMaterial: i.pipeMaterial ?? undefined,
        kgPerMetre: i.kgPerMetre ? Number(i.kgPerMetre) : undefined,
      });
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
        {
          title: 'Item',
          dataIndex: 'name',
          locked: true,
          ...sort('name'),
          render: (v: string, r) => (
            <span>
              {v}
              {r.isFuel ? (
                <AppTag tone="pending" style={{ marginLeft: 6 }}>
                  Fuel
                </AppTag>
              ) : null}
            </span>
          ),
        },
        { title: 'Unit', dataIndex: 'unit', width: 100, ...sort('unit') },
        { title: 'Category', dataIndex: 'category', width: 160, ...sort('category'), render: (v) => (v ? <AppTag style={{ margin: 0 }}>{v}</AppTag> : <Typography.Text type="secondary">-</Typography.Text>) },
        {
          key: 'rate',
          title: 'Rate (₹)',
          label: 'Rate',
          dataIndex: 'rate',
          width: 130,
          align: 'right',
          className: 'mono',
          render: (v: string | null, r) => (v === null ? <Typography.Text type="secondary">-</Typography.Text> : `${formatINR(v, true).replace(RUPEE, '')} / ${r.unit}`),
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
                  <Space size="small">
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(r)} aria-label="Edit" />
                    <ConfirmDelete what={`item ${r.name}`} onConfirm={() => remove.mutateAsync(r)} disabled={r.projectCount > 0}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={r.projectCount > 0} title={r.projectCount > 0 ? 'Has stock movements' : undefined} aria-label="Delete" />
                    </ConfirmDelete>
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
      New item
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
      <FormShell open={!!editing} onClose={() => setEditing(null)} form={form} layout="modal" width={520} title={editing === 'new' ? 'New item' : 'Edit item'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the item name' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="unit"
            label="Unit"
            rules={[{ required: true, whitespace: true, message: 'Enter the unit, e.g. Bag' }]}
            extra={editing && editing !== 'new' && editing.projectCount > 0 ? 'The unit is fixed once the item has stock movements.' : undefined}
          >
            <UnitInput maxLength={30} disabled={!!editing && editing !== 'new' && editing.projectCount > 0} />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Input maxLength={60} placeholder="e.g. Cement, Steel, Fuel" />
          </Form.Item>
          <Form.Item name="rate" label="Standard rate per unit" extra="Values material issued in the project cost view.">
            <MoneyInput />
          </Form.Item>
          <Form.Item name="isFuel" valuePropName="checked" extra="Fuel goes into machines with Fuel issue, and shows in Machinery > Fuel.">
            <Checkbox>Fuel (diesel, petrol)</Checkbox>
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            {readSize
              ? `Pipe: read from the name as ${pipeSizeLabel(readSize)}. Fill these in only to correct it, or to give a weight per metre.`
              : 'Pipe: fill these in when the name does not say the size, so pipe issued and laid compare by diameter.'}
          </Typography.Paragraph>
          <FormGrid cols={3}>
            <Form.Item name="pipeDiameterMm" label="Diameter">
              <InputNumber<number> min={15} max={4000} precision={0} controls={false} inputMode="numeric" suffix="mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="pipeMaterial" label="Material">
              <Select allowClear placeholder="Pipe of" options={PIPE_MATERIALS.map((m) => ({ value: m, label: PIPE_MATERIAL_LABELS[m] }))} />
            </Form.Item>
            <Form.Item name="kgPerMetre" label="Weight per metre" extra="For pipe bought by weight">
              <InputNumber<number> min={0.001} precision={3} controls={false} inputMode="decimal" suffix="kg/m" style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </Form>
      </FormShell>
    </>
  );
}

'use client';

import React, { useEffect, useMemo } from 'react';
import { App, AutoComplete, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockEntryDto } from '@erp/shared';
import { COMMON_UNITS, MAX_PAGE_SIZE } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useProjects, useStockBalances, useStockItems } from '@/lib/queries';
import { formatQty } from '@/lib/format';

const NEW = '__new__';

interface LineValue {
  itemId?: string;
  itemName?: string;
  unit?: string;
  quantity?: string | null;
}

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  remarks: string;
  lines?: LineValue[];
}

/** Opening stock or a physical-count correction (approvers). Quantities are signed; a line can add a new item. */
export function AdjustmentModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form);
  const scope = projectId ?? watchedProject;
  const items = useStockItems({ pageSize: MAX_PAGE_SIZE, sortBy: 'name', sortOrder: 'asc' });
  const stock = useStockBalances({ projectId: scope, pageSize: MAX_PAGE_SIZE }, open && !!scope);
  const balanceOf = useMemo(() => new Map((stock.data?.items ?? []).map((b) => [b.itemId, b])), [stock.data]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId: projectId as string, date: dayjs(), lines: [{}] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const lines = (v.lines ?? [])
        .filter((l) => l && l.quantity && Number(l.quantity) !== 0 && l.itemId)
        .map((l) => (l.itemId === NEW ? { itemName: l.itemName?.trim(), unit: l.unit?.trim(), quantity: l.quantity } : { itemId: l.itemId, quantity: l.quantity }));
      if (!lines.length) throw new Error('Add at least one line with a quantity.');
      const body = { projectId: v.projectId, date: v.date.format('YYYY-MM-DD'), remarks: v.remarks.trim(), lines };
      return (await api.post<StockEntryDto>('/stock/adjustments', body)).data;
    },
    onSuccess: (e) => {
      message.success(`${e.entryNo} saved`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title="Adjust stock"
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save adjustment"
      okButtonProps={{ loading: save.isPending }}
      width={760}
      destroyOnHidden
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 } }}
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 8 }}>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!projectId}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', columnGap: 12 }}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="remarks" label="Reason" rules={[{ required: true, whitespace: true, min: 3, message: 'Say why, e.g. Opening stock or Physical count on 30 Sep' }]}>
            <Input maxLength={1000} placeholder="Opening stock, physical count, damaged material..." />
          </Form.Item>
        </div>
        <Form.Item label="Lines" required extra="Positive adds to stock, negative takes it off." style={{ marginBottom: 8 }}>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {fields.map((f) => {
                  const itemId = form.getFieldValue(['lines', f.name, 'itemId']) as string | undefined;
                  const bal = itemId ? balanceOf.get(itemId) : undefined;
                  return (
                    <div key={f.key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <Form.Item name={[f.name, 'itemId']} style={{ flex: '3 1 220px', marginBottom: 0 }} rules={[{ required: true, message: 'Pick an item' }]}>
                        <Select
                          showSearch={{ optionFilterProp: 'label' }}
                          placeholder="Item"
                          loading={items.isLoading}
                          onChange={() => form.setFieldValue(['lines', f.name, 'quantity'], null)}
                          options={[
                            { value: NEW, label: '+ New item' },
                            ...(items.data?.items ?? []).map((i) => {
                              const b = balanceOf.get(i.id);
                              return { value: i.id, label: `${i.name} (${i.unit})${b ? `, ${formatQty(b.balance)} in stock` : ''}` };
                            }),
                          ]}
                        />
                      </Form.Item>
                      {itemId === NEW ? (
                        <>
                          <Form.Item name={[f.name, 'itemName']} style={{ flex: '2 1 160px', marginBottom: 0 }} rules={[{ required: true, whitespace: true, message: 'Name' }]}>
                            <Input placeholder="Item name" maxLength={200} />
                          </Form.Item>
                          <Form.Item name={[f.name, 'unit']} style={{ width: 100, marginBottom: 0 }} rules={[{ required: true, whitespace: true, message: 'Unit' }]}>
                            <AutoComplete placeholder="Unit" options={[...COMMON_UNITS, 'Bags', 'Ltr'].map((u) => ({ value: u }))} />
                          </Form.Item>
                        </>
                      ) : null}
                      <Form.Item
                        name={[f.name, 'quantity']}
                        style={{ width: 150, marginBottom: 0 }}
                        rules={[
                          { required: true, message: 'Qty' },
                          {
                            validator: (_, v) =>
                              !v || Number(v) !== 0
                                ? !v || !bal || Number(bal.balance) + Number(v) >= 0
                                  ? Promise.resolve()
                                  : Promise.reject(new Error(`Only ${formatQty(bal.balance)} in stock`))
                                : Promise.reject(new Error('Not zero')),
                          },
                        ]}
                      >
                        <InputNumber<string> stringMode placeholder="+/- qty" style={{ width: '100%' }} />
                      </Form.Item>
                      <Button icon={<DeleteOutlined />} onClick={() => remove(f.name)} disabled={fields.length === 1} aria-label="Remove line" />
                    </div>
                  );
                })}
                <Button type="dashed" icon={<PlusOutlined />} size="small" block onClick={() => add({})}>
                  Add line
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Only approvers can adjust stock. Every adjustment is kept in the register with its reason.
        </Typography.Text>
      </Form>
    </Modal>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { App, Button, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemDto, StockAdjustmentReason, StockEntryDto } from '@erp/shared';
import { MAX_PAGE_SIZE, STOCK_ADJUSTMENT_REASONS, STOCK_ADJUSTMENT_REASON_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useProjects, useStockBalances } from '@/lib/queries';
import { SearchSelect } from '@/components/common/SearchSelect';
import { formatQty } from '@/lib/format';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { themeFontSize } from '@/lib/theme';

const NEW = '__new__';
const NEW_OPTION = [{ value: NEW, label: '+ New item' }];

interface LineValue {
  itemId?: string;
  itemName?: string;
  unit?: string;
  quantity?: string | null;
}

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  reason: StockAdjustmentReason;
  remarks: string;
  lines?: LineValue[];
}

/**
 * Opening stock, wastage, damage or a count correction (approvers). Quantities are signed; a line can add a new item.
 * The reason feeds the wastage report (v5 item 92).
 */
export function AdjustmentModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form);
  const scope = projectId ?? watchedProject;
  // The project's balances (one row per item it holds) label the items; the item master itself is searched as you type.
  const stock = useStockBalances({ projectId: scope, pageSize: MAX_PAGE_SIZE }, open && !!scope);
  const balanceOf = useMemo(() => new Map((stock.data?.items ?? []).map((b) => [b.itemId, b])), [stock.data]);
  const itemOption = useCallback(
    (i: ItemDto) => {
      const b = balanceOf.get(i.id);
      return { value: i.id, label: `${i.name} (${i.unit})${b ? `, ${formatQty(b.balance)} in stock` : ''}` };
    },
    [balanceOf],
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId: projectId as string, date: dayjs(), lines: [{}] });
  }, [open, projectId, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const lines = (v.lines ?? [])
        .filter((l) => l && l.quantity && Number(l.quantity) !== 0 && l.itemId)
        .map((l) => (l.itemId === NEW ? { itemName: l.itemName?.trim(), unit: l.unit?.trim(), quantity: l.quantity } : { itemId: l.itemId, quantity: l.quantity }));
      if (!lines.length) throw new Error('Add at least one line with a quantity.');
      const body = { projectId: v.projectId, date: v.date.format('YYYY-MM-DD'), reason: v.reason, remarks: v.remarks.trim(), lines };
      return (await api.post<StockEntryDto>('/stock/adjustments', body)).data;
    },
    onSuccess: (e) => {
      message.success(`${e.entryNo} saved`);
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={760} title="Adjust stock" okText="Save adjustment" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!projectId}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Choose the project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Choose the date' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Choose the reason, e.g. Wastage' }]}>
            <Select<StockAdjustmentReason>
              placeholder="Choose the reason"
              showSearch={{ optionFilterProp: 'label' }}
              options={STOCK_ADJUSTMENT_REASONS.map((r) => ({ value: r, label: STOCK_ADJUSTMENT_REASON_LABELS[r] }))}
            />
          </Form.Item>
        </FormGrid>
        <Form.Item name="remarks" label="Details" rules={[{ required: true, whitespace: true, min: 3, message: 'Say what happened, e.g. 2 bags set hard in the rain' }]}>
          <Input maxLength={1000} placeholder="What happened, where, who found it…" />
        </Form.Item>
        <Form.Item label="Lines" required extra="Positive adds to stock, negative takes it off." style={{ marginBottom: 8 }}>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {fields.map((f) => {
                  const itemId = form.getFieldValue(['lines', f.name, 'itemId']) as string | undefined;
                  const bal = itemId ? balanceOf.get(itemId) : undefined;
                  return (
                    <div key={f.key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <Form.Item name={[f.name, 'itemId']} style={{ flex: '3 1 220px', marginBottom: 0 }} rules={[{ required: true, message: 'Choose an item' }]}>
                        <SearchSelect<ItemDto>
                          source="items"
                          toOption={itemOption}
                          extra={NEW_OPTION}
                          placeholder="Type an item"
                          aria-label={`Item of line ${f.name + 1}`}
                          onChange={() => form.setFieldValue(['lines', f.name, 'quantity'], null)}
                        />
                      </Form.Item>
                      {itemId === NEW ? (
                        <>
                          <Form.Item name={[f.name, 'itemName']} style={{ flex: '2 1 160px', marginBottom: 0 }} rules={[{ required: true, whitespace: true, message: 'Name the item' }]}>
                            <Input placeholder="Item name" maxLength={200} />
                          </Form.Item>
                          <Form.Item name={[f.name, 'unit']} style={{ width: 100, marginBottom: 0 }} rules={[{ required: true, whitespace: true, message: 'Enter the unit' }]}>
                            <UnitInput />
                          </Form.Item>
                        </>
                      ) : null}
                      <Form.Item
                        name={[f.name, 'quantity']}
                        style={{ width: 150, marginBottom: 0 }}
                        rules={[
                          { required: true, message: 'Enter the quantity' },
                          {
                            validator: (_, v) =>
                              !v || Number(v) !== 0
                                ? !v || !bal || Number(bal.balance) + Number(v) >= 0
                                  ? Promise.resolve()
                                  : Promise.reject(new Error(`Only ${formatQty(bal.balance)} in stock`))
                                : Promise.reject(new Error('Enter a quantity other than zero')),
                          },
                        ]}
                      >
                        <InputNumber<string> stringMode placeholder="+/- qty" aria-label={`Quantity of line ${f.name + 1}`} style={{ width: '100%' }} />
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
        <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
          Only approvers can adjust stock. Every adjustment is kept in the register with its reason.
        </Typography.Text>
      </Form>
    </FormShell>
  );
}

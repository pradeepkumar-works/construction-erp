'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, AutoComplete, Button, DatePicker, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockEntryDto } from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useActivities, useAttendanceSuggestions, useProjects, useStockBalances } from '@/lib/queries';
import { formatQty } from '@/lib/format';
import { VendorPicker } from '@/components/vendors/VendorPicker';
import { FormGrid, FormShell } from '@/components/form/FormShell';

export type StockMove = 'transfer' | 'vendor' | 'site';

interface LineValue {
  itemId?: string;
  quantity?: string | null;
}

interface FormValues {
  projectId: string;
  toProjectId?: string;
  date: dayjs.Dayjs;
  supplier?: string;
  issuedTo?: string;
  activityId?: string;
  challanNo?: string;
  vehicleNo?: string;
  remarks?: string;
  lines?: LineValue[];
}

const COPY: Record<StockMove, { title: string; ok: string; path: string; help: string }> = {
  transfer: {
    title: 'Transfer to another project',
    ok: 'Send',
    path: '/stock/transfers',
    help: 'The material leaves this store now and shows as in transit until the other project receives it.',
  },
  vendor: { title: 'Return to supplier', ok: 'Save return', path: '/stock/vendor-returns', help: 'The material leaves stock. Raise the debit note on the supplier separately.' },
  site: {
    title: 'Return from site',
    ok: 'Save return',
    path: '/stock/site-returns',
    help: "Unused material brought back to the store. It comes back into stock and off the project's material cost.",
  },
};

/** Transfer to another project, return to the supplier, or take back unused material from site. */
export function StockMoveModal({ move, open, onClose, projectId }: { move: StockMove; open: boolean; onClose: () => void; projectId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form);
  const watchedLines = Form.useWatch('lines', form);
  const scope = projectId ?? watchedProject;
  // A site return can bring back an item that is at zero in the store, so it lists every item the project has moved.
  const stock = useStockBalances({ projectId: scope, inStock: move !== 'site', pageSize: MAX_PAGE_SIZE, sortBy: 'item', sortOrder: 'asc' }, open && !!scope);
  const activities = useActivities(open && move === 'site' ? scope : undefined);
  const suggestions = useAttendanceSuggestions(open && move === 'site' ? scope : undefined);
  const items = useMemo(() => (stock.data?.items ?? []).filter((i) => move !== 'site' || Number(i.issued) > 0), [stock.data, move]);
  const copy = COPY[move];

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId: projectId as string, date: dayjs(), lines: [{}] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, move]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const lines = (v.lines ?? []).filter((l) => l?.itemId && l.quantity && Number(l.quantity) > 0).map((l) => ({ itemId: l.itemId!, quantity: l.quantity! }));
      if (!lines.length) throw new Error('Add at least one item with a quantity.');
      const base = { projectId: v.projectId, date: v.date.format('YYYY-MM-DD'), remarks: v.remarks?.trim() || null, lines };
      const body =
        move === 'transfer'
          ? { ...base, toProjectId: v.toProjectId, challanNo: v.challanNo?.trim() || null, vehicleNo: v.vehicleNo?.trim() || null }
          : move === 'vendor'
            ? { ...base, supplier: v.supplier?.trim(), challanNo: v.challanNo?.trim() || null, vehicleNo: v.vehicleNo?.trim() || null }
            : { ...base, issuedTo: v.issuedTo?.trim(), activityId: v.activityId ?? null };
      return (await api.post<StockEntryDto>(copy.path, body)).data;
    },
    onSuccess: (e) => {
      message.success(move === 'transfer' ? `${e.entryNo} sent to ${e.toProjectName}` : `${e.entryNo} saved`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cost'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const chosen = new Set((watchedLines ?? []).map((l) => l?.itemId).filter(Boolean));
  const limitOf = (i: { balance: string; issued: string }) => (move === 'site' ? i.issued : i.balance);

  // The project stock is sent from is a deliberate choice, so a transfer does not start on the header's project.
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={720} title={copy.title} okText={copy.ok} projectDefault={move !== 'transfer'} onSubmit={(v) => save.mutateAsync(v)}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {copy.help}
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="projectId" label={move === 'transfer' ? 'From project' : 'Project'} rules={[{ required: true, message: 'Choose the project' }]} hidden={!!projectId}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Select project"
            onChange={() => form.setFieldsValue({ lines: [{}], activityId: undefined })}
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
          />
        </Form.Item>
        <FormGrid cols={2}>
          {move === 'transfer' && (
            <Form.Item name="toProjectId" label="To project" rules={[{ required: true, message: 'Where is it going?' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Receiving project"
                options={(projects ?? []).filter((p) => p.id !== scope && p.status !== 'CLOSED').map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
              />
            </Form.Item>
          )}
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          {move === 'vendor' && (
            <Form.Item name="supplier" label="Supplier" rules={[{ required: true, whitespace: true, message: 'Who does it go back to?' }]}>
              <VendorPicker kind="SUPPLIER" />
            </Form.Item>
          )}
          {move === 'site' && (
            <>
              <Form.Item name="issuedTo" label="Returned by" rules={[{ required: true, whitespace: true, message: 'Who brought it back?' }]}>
                <AutoComplete
                  placeholder="Contractor, gang or person"
                  options={(suggestions.data?.contractors ?? []).map((c) => ({ value: c }))}
                  showSearch={{ filterOption: (input, o) => (o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }}
                />
              </Form.Item>
              <Form.Item name="activityId" label="Was for activity">
                <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Optional" disabled={!scope} options={(activities.data ?? []).map((a) => ({ value: a.id, label: a.name }))} />
              </Form.Item>
            </>
          )}
          {move !== 'site' && (
            <>
              <Form.Item name="challanNo" label={move === 'vendor' ? 'Debit note / challan' : 'Challan no.'}>
                <Input maxLength={60} />
              </Form.Item>
              <Form.Item name="vehicleNo" label="Vehicle no.">
                <Input maxLength={30} />
              </Form.Item>
            </>
          )}
        </FormGrid>

        {scope && !stock.isLoading && !items.length ? (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={move === 'site' ? 'Nothing has been issued at this project yet.' : 'Nothing is in stock at this project.'} />
        ) : null}

        <Form.Item label="Items" required style={{ marginBottom: 8 }}>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {fields.map((f) => {
                  const itemId = form.getFieldValue(['lines', f.name, 'itemId']) as string | undefined;
                  const row = items.find((i) => i.itemId === itemId);
                  return (
                    <div key={f.key} className="stock-move-line" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <Form.Item name={[f.name, 'itemId']} style={{ flex: 3, marginBottom: 0 }} rules={[{ required: true, message: 'Pick an item' }]}>
                        <Select
                          showSearch={{ optionFilterProp: 'label' }}
                          aria-label="Item"
                          placeholder={scope ? 'Item' : 'Pick the project first'}
                          disabled={!scope}
                          loading={stock.isLoading}
                          options={items.map((i) => ({
                            value: i.itemId,
                            label: move === 'site' ? `${i.itemName} (${formatQty(i.issued)} ${i.unit} issued)` : `${i.itemName} (${formatQty(i.balance)} ${i.unit} in stock)`,
                            disabled: chosen.has(i.itemId) && i.itemId !== itemId,
                          }))}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[f.name, 'quantity']}
                        style={{ width: 180, marginBottom: 0 }}
                        rules={[
                          { required: true, message: 'Enter the quantity' },
                          {
                            validator: (_, v) =>
                              !v || !row || Number(v) <= Number(limitOf(row))
                                ? Promise.resolve()
                                : Promise.reject(new Error(move === 'site' ? `Only ${formatQty(row.issued)} ${row.unit} issued` : `Only ${formatQty(row.balance)} ${row.unit} in stock`)),
                          },
                        ]}
                      >
                        <InputNumber<string> stringMode min="0" placeholder="Qty" aria-label="Quantity" suffix={row?.unit} style={{ width: '100%' }} />
                      </Form.Item>
                      <Button icon={<DeleteOutlined />} onClick={() => remove(f.name)} disabled={fields.length === 1} aria-label="Remove item" />
                    </div>
                  );
                })}
                <Button type="dashed" icon={<PlusOutlined />} size="small" block onClick={() => add({})} disabled={!scope}>
                  Add item
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>
        <Form.Item name="remarks" label={move === 'vendor' ? 'Reason' : 'Remarks'} rules={move === 'vendor' ? [{ required: true, whitespace: true, min: 3, message: 'Why is it going back?' }] : []}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

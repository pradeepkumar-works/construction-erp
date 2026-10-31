'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, AutoComplete, Button, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockEntryDto } from '@erp/shared';
import { MAX_PAGE_SIZE, canViewWorkOrders } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useActivities, useAttendanceSuggestions, useProjects, useStockBalances, useStructure, useWorkOrders } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatQty } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { themeFontSize } from '@/lib/theme';

interface LineValue {
  itemId?: string;
  quantity?: string | null;
}

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  issuedTo?: string;
  workOrderId?: string;
  activityId?: string;
  workElementId?: string;
  remarks?: string;
  lines?: LineValue[];
}

/**
 * Issue slip: material handed out at site. Items and quantities are limited to what the project has in stock. On a
 * project with a work breakdown the slip names the component or pipe zone it goes to (item 128), the activity's own
 * when an activity is chosen, so the reconciliation can check it against that component's DPR lines.
 */
export function IssueModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form);
  const watchedLines = Form.useWatch('lines', form);
  const scope = projectId ?? watchedProject;
  const stock = useStockBalances({ projectId: scope, inStock: true, pageSize: MAX_PAGE_SIZE, sortBy: 'item', sortOrder: 'asc' }, open && !!scope);
  const activities = useActivities(open ? scope : undefined);
  const structure = useStructure(open ? scope : undefined);
  const elements = structure.data?.elements ?? [];
  const suggestions = useAttendanceSuggestions(open ? scope : undefined);
  const items = useMemo(() => stock.data?.items ?? [], [stock.data]);
  const { user } = useAuth();
  const wos = useWorkOrders({ projectId: scope, open: true, pageSize: 50 }, open && !!scope && !!user && canViewWorkOrders(user.roleKey));
  const workOrderId = Form.useWatch('workOrderId', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId: projectId as string, date: dayjs(), lines: [{}] });
  }, [open, projectId, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const lines = (v.lines ?? []).filter((l) => l?.itemId && l.quantity && Number(l.quantity) > 0).map((l) => ({ itemId: l.itemId!, quantity: l.quantity! }));
      if (!lines.length) throw new Error('Add at least one item with a quantity.');
      const body = { projectId: v.projectId, date: v.date.format('YYYY-MM-DD'), issuedTo: v.issuedTo?.trim() || undefined, workOrderId: v.workOrderId, activityId: v.activityId ?? null, workElementId: v.workElementId ?? null, remarks: v.remarks?.trim() || null, lines };
      return (await api.post<StockEntryDto>('/stock/issues', body)).data;
    },
    onSuccess: (e) => {
      message.success(`${e.entryNo} saved: issued to ${e.issuedTo}`);
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
    meta: FAIL_NOTICE,
  });

  const chosen = new Set((watchedLines ?? []).map((l) => l?.itemId).filter(Boolean));

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={720} title="Issue material" okText="Save issue" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!projectId}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Choose a project"
            onChange={() => form.setFieldsValue({ lines: [{}], activityId: undefined, workElementId: undefined, workOrderId: undefined })}
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
          />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Choose the date' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          {(wos.data?.items.length ?? 0) > 0 && (
            <Form.Item name="workOrderId" label="To a subcontractor" tooltip="Material issued against a work order is recovered from the subcontractor's next bill">
              <Select
                allowClear
                placeholder="No (departmental)"
                options={(wos.data?.items ?? []).map((w) => ({ value: w.id, label: `${w.woNo} · ${w.vendorName}` }))}
                onChange={(id) => {
                  const w = wos.data?.items.find((x) => x.id === id);
                  if (w) form.setFieldValue('issuedTo', w.vendorName);
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="issuedTo" label="Issued to" rules={[{ required: !workOrderId, whitespace: true, message: 'Enter who took the material' }]}>
            <AutoComplete
              placeholder="Contractor, gang or person"
              options={(suggestions.data?.contractors ?? []).map((c) => ({ value: c }))}
              showSearch={{ filterOption: (input, o) => (o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }}
            />
          </Form.Item>
          <Form.Item name="activityId" label="For activity">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Optional"
              disabled={!scope}
              options={(activities.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              onChange={(id?: string) => {
                const element = (activities.data ?? []).find((a) => a.id === id)?.workElementId;
                if (element) form.setFieldValue('workElementId', element);
              }}
            />
          </Form.Item>
          {elements.length ? (
            <Form.Item name="workElementId" label="To component" extra="The structure or pipe zone it goes to, so it is checked against that work's DPR lines.">
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Optional"
                options={[...elements]
                  .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                  .map((e) => ({ value: e.id, label: `${e.code} ${e.name}` }))}
              />
            </Form.Item>
          ) : null}
        </FormGrid>

        {scope && !stock.isLoading && !items.length ? (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Nothing is in stock at this project yet. Receive material first." />
        ) : null}

        <Form.Item label="Items" required style={{ marginBottom: 8 }}>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {fields.map((f) => {
                  const itemId = form.getFieldValue(['lines', f.name, 'itemId']) as string | undefined;
                  const row = items.find((i) => i.itemId === itemId);
                  return (
                    <div key={f.key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <Form.Item name={[f.name, 'itemId']} style={{ flex: 3, marginBottom: 0 }} rules={[{ required: true, message: 'Choose an item' }]}>
                        <Select
                          showSearch={{ optionFilterProp: 'label' }}
                          placeholder={scope ? 'Item' : 'Choose the project first'}
                          disabled={!scope}
                          loading={stock.isLoading}
                          options={items.map((i) => ({
                            value: i.itemId,
                            label: `${i.itemName} (${formatQty(i.balance)} ${i.unit} in stock)`,
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
                              !v || !row || Number(v) <= Number(row.balance) ? Promise.resolve() : Promise.reject(new Error(`Only ${formatQty(row.balance)} ${row.unit} in stock`)),
                          },
                        ]}
                      >
                        <InputNumber<string> stringMode min="0" placeholder="Qty" suffix={row?.unit} style={{ width: '100%' }} />
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
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
          Items that fall below their minimum level alert the store manager and the project manager.
        </Typography.Text>
      </Form>
    </FormShell>
  );
}

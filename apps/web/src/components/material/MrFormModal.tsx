'use client';

import React, { useEffect } from 'react';
import { Alert, Form, Input, Select } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AiDraftDto, MaterialPriority, MaterialRequestDto } from '@erp/shared';
import { MATERIAL_PRIORITIES, MATERIAL_PRIORITY_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useProjects } from '@/lib/queries';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { ItemPicker } from '@/components/form/ItemPicker';
import { QuantityInput } from '@/components/form/inputs';
import { aiFlagInput, aiFlagItem, draftDate } from '@/components/ai/drafts';
import { recordPage } from '@/components/approvals/queue';

interface FormValues {
  projectId: string;
  requiredDate: dayjs.Dayjs;
  priority: MaterialPriority;
  remarks?: string;
  items: { itemName: string; specification?: string; unit: string; quantity: number }[];
}

/** Create a material request, or (with `entry`) edit a draft / rejected / changes-requested one and resubmit it. */
export function MrFormModal({ open, onClose, projectId, defaultProjectId, entry, prefill }: { open: boolean; onClose: () => void; projectId?: string; /** A new entry starts on this project (the header's), still changeable. */ defaultProjectId?: string; entry?: MaterialRequestDto | null; /** Filled in by Ask Nirmaan (AI item 71) */ prefill?: AiDraftDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: projects } = useProjects();
  const editing = !!entry;
  const fixedProject = entry?.projectId ?? projectId;
  const draft = entry ? null : prefill;
  const lines = Form.useWatch('items', form);
  const requiredDate = Form.useWatch('requiredDate', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (entry) {
      form.setFieldsValue({
        projectId: entry.projectId,
        requiredDate: dayjs(entry.requiredDate),
        priority: entry.priority,
        remarks: entry.remarks ?? undefined,
        items: entry.items.map((i) => ({ itemName: i.itemName, specification: i.specification ?? undefined, unit: i.unit, quantity: Number(i.quantity) })),
      });
    } else {
      form.setFieldsValue({ projectId: projectId ?? defaultProjectId, requiredDate: dayjs().add(7, 'day'), priority: 'NORMAL', items: [{ itemName: '', unit: 'Nos', quantity: 1 }] });
      if (prefill) {
        const v = prefill.values as Partial<Omit<FormValues, 'requiredDate'>> & { requiredDate?: string };
        form.setFieldsValue({ projectId: prefill.projectId, requiredDate: draftDate(v.requiredDate) ?? dayjs().add(7, 'day'), priority: v.priority ?? 'NORMAL', remarks: v.remarks, items: v.items?.length ? v.items : undefined });
      }
    }
  }, [open, projectId, defaultProjectId, entry, prefill, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        requiredDate: v.requiredDate.format('YYYY-MM-DD'),
        priority: v.priority,
        remarks: v.remarks || (editing ? null : undefined),
        items: v.items.map((i) => ({ itemName: i.itemName, specification: i.specification || undefined, unit: i.unit, quantity: String(i.quantity) })),
        submit: true,
      };
      return entry ? (await api.patch(`/material-requests/${entry.id}`, body)).data : (await api.post('/material-requests', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x: { id: string }) => {
      notify.saved(editing ? 'Indent resubmitted for approval' : 'Indent submitted for approval', recordPage('MATERIAL_REQUEST', x.id));
      qc.invalidateQueries();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={entry ? `${editActionLabel(entry.status)} · ${entry.requestNo}` : 'New indent'}
      okText={editing ? 'Resubmit request' : 'Submit request'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing ? undefined : `mr:${projectId ?? 'any'}`}
      aiDraft={draft}
      width={820}
    >
      <Form form={form} layout="vertical">
        {entry?.reviewNote && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${entry.reviewedByName ?? 'approver'}`} description={entry.reviewNote} />
        )}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Choose a project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="requiredDate" label="Required by" rules={[{ required: true, message: 'Choose the date it is needed by' }]} {...aiFlagItem(draft, 'requiredDate', requiredDate)}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="priority" label="Priority" rules={[{ required: true, message: 'Choose the priority' }]}>
            <Select options={MATERIAL_PRIORITIES.map((p) => ({ value: p, label: MATERIAL_PRIORITY_LABELS[p] }))} />
          </Form.Item>
        </FormGrid>
        <Form.Item label="Items" required>
          <LineTable
            name="items"
            label="Item"
            addText="Add item"
            min={1}
            newLine={() => ({ unit: 'Nos', quantity: 1 })}
            columns={[
              {
                key: 'itemName',
                title: 'Item',
                render: (f) => (
                  <Form.Item name={[f.name, 'itemName']} noStyle rules={[{ required: true, whitespace: true, message: 'Enter the item' }]}>
                    <ItemPicker
                      placeholder="Cement OPC 53"
                      aria-label={`Item of line ${f.name + 1}`}
                      style={{ minWidth: 160 }}
                      unit={lines?.[f.name]?.unit}
                      onPick={(item) => form.setFieldValue(['items', f.name, 'unit'], item.unit)}
                      {...aiFlagInput(draft, `items.${f.name}.itemName`, lines?.[f.name]?.itemName)}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'specification',
                title: 'Specification',
                render: (f) => (
                  <Form.Item name={[f.name, 'specification']} noStyle>
                    <Input placeholder="Grade / brand / size" style={{ minWidth: 140 }} />
                  </Form.Item>
                ),
              },
              {
                key: 'quantity',
                title: 'Qty',
                width: 100,
                render: (f) => (
                  <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Enter the quantity' }]}>
                    <QuantityInput aria-label={`Quantity of line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                key: 'unit',
                title: 'Unit',
                width: 110,
                render: (f) => (
                  <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, whitespace: true, message: 'Enter the unit' }]}>
                    <UnitInput aria-label={`Unit of line ${f.name + 1}`} {...aiFlagInput(draft, `items.${f.name}.unit`, lines?.[f.name]?.unit)} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

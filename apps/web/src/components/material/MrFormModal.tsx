'use client';

import React, { useEffect } from 'react';
import { Alert, App, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import dayjs from 'dayjs';
import type { MaterialPriority, MaterialRequestDto } from '@erp/shared';
import { MATERIAL_PRIORITIES, MATERIAL_PRIORITY_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useProjects } from '@/lib/queries';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';

interface FormValues {
  projectId: string;
  requiredDate: dayjs.Dayjs;
  priority: MaterialPriority;
  remarks?: string;
  items: { itemName: string; specification?: string; unit: string; quantity: number }[];
}

/** Create a material request, or (with `entry`) edit a draft / rejected / changes-requested one and resubmit it. */
export function MrFormModal({ open, onClose, projectId, entry }: { open: boolean; onClose: () => void; projectId?: string; entry?: MaterialRequestDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!entry;
  const fixedProject = entry?.projectId ?? projectId;

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
      form.setFieldsValue({ projectId, requiredDate: dayjs().add(7, 'day'), priority: 'NORMAL', items: [{ itemName: '', unit: 'Nos', quantity: 1 }] });
    }
  }, [open, projectId, entry, form]);

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
    onSuccess: () => {
      message.success(editing ? 'Material request resubmitted for approval' : 'Material request submitted for approval');
      qc.invalidateQueries();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={entry ? `${editActionLabel(entry.status)} · ${entry.requestNo}` : 'New material request'}
      okText={editing ? 'Resubmit request' : 'Submit request'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing ? undefined : `mr:${projectId ?? 'any'}`}
      width={820}
    >
      <Form form={form} layout="vertical">
        {entry?.reviewNote && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${entry.reviewedByName ?? 'approver'}`} description={entry.reviewNote} />
        )}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="requiredDate" label="Required by" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
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
                  <Form.Item name={[f.name, 'itemName']} noStyle rules={[{ required: true, whitespace: true, message: 'Item name' }]}>
                    <Input placeholder="Cement OPC 53" aria-label={`Item of line ${f.name + 1}`} style={{ minWidth: 160 }} />
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
                  <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Qty' }]}>
                    <InputNumber min={0} style={{ width: '100%' }} aria-label={`Quantity of line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                key: 'unit',
                title: 'Unit',
                width: 110,
                render: (f) => (
                  <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, message: 'Unit' }]}>
                    <UnitInput aria-label={`Unit of line ${f.name + 1}`} />
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

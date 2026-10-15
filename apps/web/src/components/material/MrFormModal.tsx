'use client';

import React, { useEffect } from 'react';
import { Alert, App, AutoComplete, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { MaterialPriority, MaterialRequestDto } from '@erp/shared';
import { COMMON_UNITS, MATERIAL_PRIORITIES, MATERIAL_PRIORITY_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useProjects } from '@/lib/queries';
import { editActionLabel } from '@/components/common/EditResubmitButton';

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
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={entry ? `${editActionLabel(entry.status)} · ${entry.requestNo}` : 'New material request'} okText={editing ? 'Resubmit request' : 'Submit request'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={720} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        {entry?.reviewNote && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${entry.reviewedByName ?? 'approver'}`} description={entry.reviewNote} />
        )}
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="requiredDate" label="Required by" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
            <Select options={MATERIAL_PRIORITIES.map((p) => ({ value: p, label: MATERIAL_PRIORITY_LABELS[p] }))} />
          </Form.Item>
        </div>
        <Form.Item label="Items" required style={{ marginBottom: 8 }}>
          <Form.List name="items" rules={[{ validator: async (_, v) => (!v || v.length === 0 ? Promise.reject(new Error('Add at least one item')) : Promise.resolve()) }]}>
            {(fields, { add, remove }, { errors }) => (
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 90px 100px 32px', gap: 6, fontSize: 12 }} className="text-muted">
                  <span>Item</span>
                  <span>Specification</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span />
                </div>
                {fields.map((f) => (
                  <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 90px 100px 32px', gap: 6 }}>
                    <Form.Item name={[f.name, 'itemName']} noStyle rules={[{ required: true, message: 'Item name' }]}>
                      <Input placeholder="Cement OPC 53" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'specification']} noStyle>
                      <Input placeholder="Grade / brand / size" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Qty' }]}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, message: 'Unit' }]}>
                      <AutoComplete placeholder="Unit" options={[...COMMON_UNITS, 'Bags', 'Trips'].map((u) => ({ value: u }))} />
                    </Form.Item>
                    <Button icon={<DeleteOutlined />} onClick={() => remove(f.name)} disabled={fields.length === 1} />
                  </div>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ unit: 'Nos', quantity: 1 })} block size="small">
                  Add item
                </Button>
                <Form.ErrorList errors={errors} />
              </Space>
            )}
          </Form.List>
        </Form.Item>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

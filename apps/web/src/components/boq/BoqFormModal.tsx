'use client';

import React, { useEffect } from 'react';
import { App, AutoComplete, Form, Input, InputNumber, Modal } from 'antd';
import type { BoqItemDto } from '@erp/shared';
import { COMMON_UNITS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';

interface FormValues {
  itemNo: string;
  description: string;
  unit: string;
  rate: number;
  originalQty: number;
  revisedQty?: number | null;
}

export function BoqFormModal({ open, onClose, projectId, item }: { open: boolean; onClose: () => void; projectId: string; item?: BoqItemDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const isEdit = !!item;

  useEffect(() => {
    if (!open) return;
    if (item) {
      form.setFieldsValue({
        itemNo: item.itemNo,
        description: item.description,
        unit: item.unit,
        rate: Number(item.rate),
        originalQty: Number(item.originalQty),
        revisedQty: item.revisedQty !== null ? Number(item.revisedQty) : null,
      });
    } else {
      form.resetFields();
    }
  }, [open, item, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        itemNo: v.itemNo.trim(),
        description: v.description.trim(),
        unit: v.unit.trim(),
        rate: String(v.rate),
        originalQty: String(v.originalQty),
        revisedQty: v.revisedQty !== null && v.revisedQty !== undefined ? String(v.revisedQty) : undefined,
      };
      if (isEdit && item) return (await api.patch(`/projects/${projectId}/boq/${item.id}`, body)).data;
      return (await api.post(`/projects/${projectId}/boq`, body)).data;
    },
    onSuccess: () => {
      message.success(isEdit ? 'BOQ item updated' : 'BOQ item added');
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={isEdit ? `Edit BOQ item ${item?.itemNo}` : 'Add BOQ item'} okText={isEdit ? 'Save' : 'Add item'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0 16px' }}>
          <Form.Item name="itemNo" label="Item no." rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="1.01" />
          </Form.Item>
          <Form.Item name="unit" label="Unit" rules={[{ required: true, message: 'Required' }]}>
            <AutoComplete options={COMMON_UNITS.map((u) => ({ value: u }))} placeholder="Cum" filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Required' }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="rate" label="Rate (₹)" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="originalQty" label="Original qty" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="revisedQty" label="Revised qty">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

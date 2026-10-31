'use client';

import React, { useEffect } from 'react';
import { App, AutoComplete, Form, Input, Select } from 'antd';
import type { BoqItemDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useStructure } from '@/lib/queries';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';

interface FormValues {
  itemNo: string;
  description: string;
  unit: string;
  rate: number;
  originalQty: number;
  revisedQty?: number | null;
  section?: string | null;
  workElementId?: string | null;
  sorRef?: string | null;
}

export function BoqFormModal({ open, onClose, projectId, item, sections = [] }: { open: boolean; onClose: () => void; projectId: string; item?: BoqItemDto | null; sections?: string[] }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const isEdit = !!item;
  const { data: structure } = useStructure(open ? projectId : undefined);

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
        section: item.section,
        workElementId: item.workElementId,
        sorRef: item.sorRef,
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
        section: v.section?.trim() || null,
        workElementId: v.workElementId || null,
        sorRef: v.sorRef?.trim() || null,
      };
      if (isEdit && item) return (await api.patch(`/projects/${projectId}/boq/${item.id}`, body)).data;
      return (await api.post(`/projects/${projectId}/boq`, body)).data;
    },
    onSuccess: () => {
      message.success(isEdit ? 'BOQ item updated' : 'BOQ item added');
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
      qc.invalidateQueries({ queryKey: ['activities', projectId, 'structure'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    meta: FAIL_NOTICE,
  });

  const unit = Form.useWatch('unit', form);

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={isEdit ? `Edit BOQ item ${item?.itemNo}` : 'New BOQ item'} okText="Save" onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="itemNo" label="Item no." rules={[{ required: true, whitespace: true, message: 'Enter the item number, e.g. 1.01' }]}>
            <Input placeholder="1.01" />
          </Form.Item>
          <Form.Item name="unit" label="Unit" rules={[{ required: true, whitespace: true, message: 'Enter the unit, e.g. Cum' }]}>
            <UnitInput placeholder="Cum" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="description" label="Description" rules={[{ required: true, whitespace: true, message: 'Describe the item' }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <FormGrid cols={3}>
          <Form.Item name="rate" label="Rate" rules={[{ required: true, message: 'Enter the rate' }]}>
            <MoneyInput />
          </Form.Item>
          <Form.Item name="originalQty" label="BOQ qty" rules={[{ required: true, message: 'Enter the quantity' }]}>
            <QuantityInput unit={unit} />
          </Form.Item>
          <Form.Item name="revisedQty" label="Revised qty">
            <QuantityInput unit={unit} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="section" label="Section" tooltip="Bill section or cost centre the item is grouped under, e.g. Civil works">
            <AutoComplete options={sections.map((x) => ({ value: x }))} placeholder="Civil works" showSearch={{ filterOption: (input, o) => String(o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }} />
          </Form.Item>
          <Form.Item name="workElementId" label="Component">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={structure?.elements.length ? 'None' : 'No breakdown yet'}
              options={(structure?.elements ?? []).map((e) => ({ value: e.id, label: `${e.code} ${e.name}` }))}
            />
          </Form.Item>
          <Form.Item name="sorRef" label="SOR item" tooltip="The schedule of rates item the rate comes from, as printed in the BOQ">
            <Input placeholder="4.1.3" />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

'use client';

import React, { useEffect } from 'react';
import { App, AutoComplete, Form, Input, InputNumber, Segmented } from 'antd';
import type { BoqResourceKind, EstimateLineDto } from '@erp/shared';
import { BOQ_RESOURCE_KIND_LABELS, BOQ_RESOURCE_KINDS } from '@erp/shared';
import { useSaveBoqResource } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';

interface Values {
  kind: BoqResourceKind;
  name?: string;
  qtyPerUnit?: number;
  note?: string;
}

const PER: Record<BoqResourceKind, string> = { LABOUR: 'Man-days', EQUIPMENT: 'Machine hours' };

/**
 * Add or change a labour or machine line of a BOQ item's rate analysis. The name is a trade, as labour
 * rates are kept, or an equipment category, so the estimate can price it.
 */
export function ResourceFormModal({
  open,
  onClose,
  projectId,
  boqItem,
  line,
  kind,
  labourCategories,
  equipmentCategories,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  boqItem: { boqItemId: string; itemNo: string; unit: string };
  /** The line to change; null to add one */
  line: EstimateLineDto | null;
  kind: BoqResourceKind;
  labourCategories: string[];
  equipmentCategories: string[];
}) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useSaveBoqResource();
  const chosen = (Form.useWatch('kind', form) ?? kind) as BoqResourceKind;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (line && line.kind !== 'MATERIAL') form.setFieldsValue({ kind: line.kind, name: line.name, qtyPerUnit: Number(line.qtyPerUnit), note: line.note ?? undefined });
    else form.setFieldsValue({ kind });
  }, [open, line, kind, form]);

  const submit = async (v: Values) => {
    const saved = await save.mutateAsync({ projectId, id: line?.id, boqItemId: boqItem.boqItemId, kind: v.kind, name: v.name!.trim(), qtyPerUnit: String(v.qtyPerUnit), note: v.note?.trim() || null });
    message.success(`${saved.name} saved on item ${boqItem.itemNo}`);
  };

  const options = (chosen === 'LABOUR' ? labourCategories : equipmentCategories).map((c) => ({ value: c }));
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      title={line ? `${line.name} on item ${boqItem.itemNo}` : `Add labour or a machine to item ${boqItem.itemNo}`}
      okText={line ? 'Save' : 'Add'}
      onSubmit={submit}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="kind" label="What it is">
          <Segmented<BoqResourceKind> options={BOQ_RESOURCE_KINDS.map((k) => ({ value: k, label: BOQ_RESOURCE_KIND_LABELS[k] }))} />
        </Form.Item>
        <FormGrid>
          <Form.Item
            name="name"
            label={chosen === 'LABOUR' ? 'Trade' : 'Equipment category'}
            rules={[{ required: true, whitespace: true, message: chosen === 'LABOUR' ? 'Name the trade, e.g. Mason' : 'Name the equipment category, e.g. Concreting' }]}
            extra={chosen === 'LABOUR' ? 'As in labour rates, so the estimate can price it.' : "As on the company's machines, so the estimate can price it."}
          >
            <AutoComplete options={options} showSearch={{ filterOption: (input, o) => String(o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }} placeholder={chosen === 'LABOUR' ? 'Mason' : 'Concreting'} />
          </Form.Item>
          <Form.Item
            name="qtyPerUnit"
            label={`${PER[chosen]} per ${boqItem.unit}`}
            rules={[
              { required: true, message: `Enter the ${PER[chosen].toLowerCase()} one ${boqItem.unit} takes` },
              { type: 'number', min: 0.000001, message: 'Enter a quantity above zero' },
            ]}
          >
            <InputNumber<number> min={0} precision={6} controls={false} inputMode="decimal" suffix={chosen === 'LABOUR' ? 'days' : 'hours'} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Source or note">
          <Input maxLength={500} placeholder="e.g. CPWD analysis of rates, the last slab's actuals" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

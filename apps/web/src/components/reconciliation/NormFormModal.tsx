'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, InputNumber, Select, Typography } from 'antd';
import type { MaterialNormDto } from '@erp/shared';
import { useBoq, useSaveMaterialNorm } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { ItemSelect } from '@/components/common/SearchSelect';

interface Values {
  boqItemId?: string;
  itemId?: string;
  qtyPerUnit?: number;
  wastagePct?: number;
  note?: string;
}

/**
 * Add a material norm (how much of a store item one unit of a BOQ item uses, with the wastage allowed) or change one.
 * A norm's BOQ item and store item are fixed once it exists; to move it, remove it and add another.
 */
export function NormFormModal({ open, onClose, projectId, norm, boqItemId: presetBoq }: { open: boolean; onClose: () => void; projectId: string; norm: MaterialNormDto | null; boqItemId?: string }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useSaveMaterialNorm();
  const { data: boq, isLoading: boqLoading } = useBoq(open ? projectId : undefined);
  const boqItemId = Form.useWatch('boqItemId', form);
  const boqUnit = norm?.boqUnit ?? boq?.find((b) => b.id === boqItemId)?.unit;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (norm) form.setFieldsValue({ boqItemId: norm.boqItemId, itemId: norm.itemId, qtyPerUnit: Number(norm.qtyPerUnit), wastagePct: Number(norm.wastagePct), note: norm.note ?? undefined });
    else form.setFieldsValue({ wastagePct: 2, boqItemId: presetBoq });
  }, [open, norm, form, presetBoq]);

  const submit = async (v: Values) => {
    const saved = await save.mutateAsync({
      projectId,
      boqItemId: norm?.boqItemId ?? v.boqItemId!,
      itemId: norm?.itemId ?? v.itemId!,
      qtyPerUnit: String(v.qtyPerUnit),
      wastagePct: String(v.wastagePct ?? 0),
      note: v.note?.trim() || null,
    });
    message.success(norm ? `Norm for ${saved.itemName} on item ${saved.boqItemNo} saved` : `Norm added: ${saved.itemName} on item ${saved.boqItemNo}`);
  };

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      title={norm ? `Norm: ${norm.itemName} on item ${norm.boqItemNo}` : 'New material norm'}
      okText={norm ? 'Save' : 'Add norm'}
      onSubmit={submit}
    >
      <Form form={form} layout="vertical">
        {norm ? (
          <Typography.Paragraph type="secondary">
            <span translate="no">{norm.boqItemNo}</span> {norm.boqDescription} ({norm.boqUnit}) uses {norm.itemName} ({norm.itemUnit}).
          </Typography.Paragraph>
        ) : (
          <>
            <Form.Item name="boqItemId" label="BOQ item" hidden={!!presetBoq} rules={[{ required: true, message: 'Choose the BOQ item the material goes into' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                loading={boqLoading}
                placeholder="Type an item number or description"
                options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} · ${b.description} (${b.unit})` }))}
              />
            </Form.Item>
            <Form.Item name="itemId" label="Store item" rules={[{ required: true, message: 'Choose the store item it uses' }]} extra="From the item master, as it is received and issued at site.">
              <ItemSelect />
            </Form.Item>
          </>
        )}
        <FormGrid>
          <Form.Item
            name="qtyPerUnit"
            label={boqUnit ? `Quantity per ${boqUnit}` : 'Quantity per unit of the BOQ item'}
            rules={[
              { required: true, message: 'Enter how much of the item one unit of work uses' },
              { type: 'number', min: 0.000001, message: 'Enter a quantity above zero' },
            ]}
            extra="In the store item's unit, e.g. 8.2 bags of cement per cum of M25."
          >
            <InputNumber<number> min={0} precision={6} controls={false} inputMode="decimal" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="wastagePct"
            label="Allowed wastage"
            rules={[{ type: 'number', min: 0, max: 100, message: 'Enter a wastage between 0 and 100%' }]}
            extra="Consumption above theoretical plus this is flagged."
          >
            <InputNumber<number> min={0} max={100} precision={2} controls={false} inputMode="decimal" suffix="%" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Source or note">
          <Input maxLength={500} placeholder="e.g. CPWD analysis of rates, design mix, bar bending schedule" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

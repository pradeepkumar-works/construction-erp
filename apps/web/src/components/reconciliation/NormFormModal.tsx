'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, InputNumber, Segmented, Select, Typography } from 'antd';
import type { ActivityNormDto, MaterialNormDto } from '@erp/shared';
import { useBoq, useDprWorkOptions, useSaveActivityNorm, useSaveMaterialNorm } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { ItemSelect } from '@/components/common/SearchSelect';

interface Values {
  against?: 'boq' | 'activity';
  boqItemId?: string;
  activityId?: string;
  itemId?: string;
  qtyPerUnit?: number;
  wastagePct?: number;
  note?: string;
}

/**
 * Add a material norm (how much of a store item one unit of a BOQ item uses, with the wastage allowed) or change one.
 * A norm can instead sit on an activity (item 128), for work with no BOQ item of its own such as a lump-sum
 * component's activities or a house connection's kit; it then counts before the BOQ item's. A norm's BOQ item or
 * activity and its store item are fixed once it exists; to move it, remove it and add another.
 */
export function NormFormModal({
  open,
  onClose,
  projectId,
  norm,
  activityNorm = null,
  boqItemId: presetBoq,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  norm: MaterialNormDto | null;
  activityNorm?: ActivityNormDto | null;
  boqItemId?: string;
}) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useSaveMaterialNorm();
  const saveActivity = useSaveActivityNorm();
  const { data: boq, isLoading: boqLoading } = useBoq(open ? projectId : undefined);
  const against = Form.useWatch('against', form) ?? (activityNorm ? 'activity' : 'boq');
  const { data: options, isLoading: optionsLoading } = useDprWorkOptions(open && against === 'activity' && !activityNorm ? projectId : undefined);
  const boqItemId = Form.useWatch('boqItemId', form);
  const activityId = Form.useWatch('activityId', form);
  const workUnit = activityNorm
    ? activityNorm.activityUnit
    : against === 'activity'
      ? options?.activities.find((a) => a.id === activityId)?.unit
      : (norm?.boqUnit ?? boq?.find((b) => b.id === boqItemId)?.unit);
  const editing = !!norm || !!activityNorm;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (norm) form.setFieldsValue({ against: 'boq', boqItemId: norm.boqItemId, itemId: norm.itemId, qtyPerUnit: Number(norm.qtyPerUnit), wastagePct: Number(norm.wastagePct), note: norm.note ?? undefined });
    else if (activityNorm)
      form.setFieldsValue({ against: 'activity', activityId: activityNorm.activityId, itemId: activityNorm.itemId, qtyPerUnit: Number(activityNorm.qtyPerUnit), wastagePct: Number(activityNorm.wastagePct), note: activityNorm.note ?? undefined });
    else form.setFieldsValue({ against: 'boq', wastagePct: 2, boqItemId: presetBoq });
  }, [open, norm, activityNorm, form, presetBoq]);

  const submit = async (v: Values) => {
    if (activityNorm || v.against === 'activity') {
      const saved = await saveActivity.mutateAsync({
        projectId,
        activityId: activityNorm?.activityId ?? v.activityId!,
        itemId: activityNorm?.itemId ?? v.itemId!,
        qtyPerUnit: String(v.qtyPerUnit),
        wastagePct: String(v.wastagePct ?? 0),
        note: v.note?.trim() || null,
      });
      message.success(activityNorm ? `Norm for ${saved.itemName} on ${saved.activityName} saved` : `Norm added: ${saved.itemName} on ${saved.activityName}`);
      return;
    }
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
      title={norm ? `Norm: ${norm.itemName} on item ${norm.boqItemNo}` : activityNorm ? `Norm: ${activityNorm.itemName} on ${activityNorm.activityName}` : 'New material norm'}
      okText={editing ? 'Save' : 'Add norm'}
      onSubmit={submit}
    >
      <Form form={form} layout="vertical">
        {norm ? (
          <Typography.Paragraph type="secondary">
            <span translate="no">{norm.boqItemNo}</span> {norm.boqDescription} ({norm.boqUnit}) uses {norm.itemName} ({norm.itemUnit}).
          </Typography.Paragraph>
        ) : activityNorm ? (
          <Typography.Paragraph type="secondary">
            {activityNorm.elementLabel ? `${activityNorm.elementLabel} › ` : ''}
            {activityNorm.activityName} ({activityNorm.activityUnit}) uses {activityNorm.itemName} ({activityNorm.itemUnit}).
          </Typography.Paragraph>
        ) : (
          <>
            {!presetBoq ? (
              <Form.Item name="against" label="Norm on" extra="An activity's own norm is for work with no BOQ item, such as a lump-sum component or a house connection kit. It counts before the BOQ item's.">
                <Segmented
                  options={[
                    { value: 'boq', label: 'A BOQ item' },
                    { value: 'activity', label: 'An activity' },
                  ]}
                />
              </Form.Item>
            ) : null}
            {against === 'activity' ? (
              <Form.Item name="activityId" label="Activity" rules={[{ required: true, message: 'Choose the activity the material goes into' }]}>
                <Select
                  showSearch={{ optionFilterProp: 'label' }}
                  loading={optionsLoading}
                  placeholder="Type a component or activity"
                  options={(options?.activities ?? []).map((a) => ({
                    value: a.id,
                    label: `${a.subComponentCode ?? a.componentCode ?? ''} ${a.subComponentName ?? a.componentName ?? ''} › ${a.parentActivityName ? `${a.parentActivityName} › ` : ''}${a.name} (${a.unit})`.trim(),
                  }))}
                />
              </Form.Item>
            ) : (
              <Form.Item name="boqItemId" label="BOQ item" hidden={!!presetBoq} rules={[{ required: true, message: 'Choose the BOQ item the material goes into' }]}>
                <Select
                  showSearch={{ optionFilterProp: 'label' }}
                  loading={boqLoading}
                  placeholder="Type an item number or description"
                  options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} · ${b.description} (${b.unit})` }))}
                />
              </Form.Item>
            )}
            <Form.Item name="itemId" label="Store item" rules={[{ required: true, message: 'Choose the store item it uses' }]} extra="From the item master, as it is received and issued at site.">
              <ItemSelect />
            </Form.Item>
          </>
        )}
        <FormGrid>
          <Form.Item
            name="qtyPerUnit"
            label={workUnit ? `Quantity per ${workUnit}` : against === 'activity' ? 'Quantity per unit of the activity' : 'Quantity per unit of the BOQ item'}
            rules={[
              { required: true, message: 'Enter how much of the item one unit of work uses' },
              { type: 'number', min: 0.000001, message: 'Enter a quantity above zero' },
            ]}
            extra={against === 'activity' ? "In the store item's unit, e.g. 1 saddle per house connection." : "In the store item's unit, e.g. 8.2 bags of cement per cum of M25."}
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

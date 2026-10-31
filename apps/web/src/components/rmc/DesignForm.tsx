'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, InputNumber, Select } from 'antd';
import type { ItemDto, MixDesignDto } from '@erp/shared';
import { RMC_GRADES } from '@erp/shared';
import { useRmcAction } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { CODE_INPUT, QuantityInput } from '@/components/form/inputs';
import { ItemSelect } from '@/components/common/SearchSelect';
import { usePlantScope } from './rmcUi';

interface Values {
  plantId: string;
  code: string;
  grade: string;
  slumpMm?: number | null;
  description?: string;
  lines: { itemId?: string; itemName?: string; unit?: string; quantity?: number }[];
}

/** What goes into a cubic metre of a grade at a plant; quality approves it before it is batched. */
export function DesignForm({ open, onClose, design }: { open: boolean; onClose: () => void; design?: MixDesignDto | null }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useRmcAction<MixDesignDto>();
  const [scopePlant, , plants] = usePlantScope();
  const editing = !!design;
  useEffect(() => {
    if (!open) return;
    if (design)
      form.setFieldsValue({
        plantId: design.plantId,
        code: design.code,
        grade: design.grade,
        slumpMm: design.slumpMm,
        description: design.description ?? undefined,
        lines: design.lines.map((l) => ({ itemId: l.itemId, itemName: l.itemName, unit: l.unit, quantity: Number(l.quantity) })),
      });
    else if (!form.getFieldValue('plantId')) form.setFieldsValue({ plantId: scopePlant ?? (plants.length === 1 ? plants[0].id : undefined) });
  }, [open, design, form, scopePlant, plants]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={760}
      projectDefault={false}
      title={editing ? `Edit ${design.code}` : 'New mix design'}
      okText="Submit for approval"
      draftKey={editing ? undefined : 'rmc-design'}
      onSubmit={async (v) => {
        const body = {
          ...(editing ? {} : { plantId: v.plantId }),
          code: v.code.trim().toUpperCase(),
          grade: v.grade,
          slumpMm: v.slumpMm ?? null,
          description: v.description?.trim() || null,
          lines: (v.lines ?? []).map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        };
        const saved = await save.mutateAsync(editing ? { method: 'patch', path: `/rmc/mix-designs/${design.id}`, body } : { path: '/rmc/mix-designs', body });
        message.success(`${saved.code} sent to quality for approval`);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ grade: 'M25', lines: [{}, {}, {}] }}>
        <FormGrid cols={2}>
          <Form.Item name="plantId" label="Plant" rules={[{ required: true, message: 'Choose the plant' }]}>
            <Select disabled={editing} options={plants.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
          </Form.Item>
          <Form.Item name="code" label="Code" rules={[{ required: true, whitespace: true, message: 'Enter a code, e.g. M25-OPC-02' }]}>
            <Input maxLength={40} placeholder="M25-OPC-02" {...CODE_INPUT} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="grade" label="Grade" rules={[{ required: true, message: 'Choose the grade' }]}>
            <Select options={RMC_GRADES.map((g) => ({ value: g, label: g }))} />
          </Form.Item>
          <Form.Item name="slumpMm" label="Slump">
            <InputNumber min={0} max={300} suffix="mm" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="description" label="Description">
          <Input maxLength={300} placeholder="OPC 53 with 20% fly ash, pumpable" />
        </Form.Item>
        <LineTable
          name="lines"
          label="Material"
          min={1}
          addText="Add a material"
          newLine={() => ({})}
          columns={[
            {
              key: 'item',
              title: 'Material',
              render: (field) => (
                <Form.Item noStyle shouldUpdate>
                  {() => {
                    const line = form.getFieldValue(['lines', field.name]) as Values['lines'][number] | undefined;
                    return (
                      <Form.Item name={[field.name, 'itemId']} rules={[{ required: true, message: 'Choose the material' }]} noStyle>
                        <ItemSelect
                          aria-label="Material"
                          style={{ width: '100%' }}
                          selected={line?.itemId && line.itemName ? { value: line.itemId, label: `${line.itemName} (${line.unit})` } : null}
                          onPick={(i: ItemDto) => form.setFieldValue(['lines', field.name], { ...line, itemId: i.id, itemName: i.name, unit: i.unit })}
                        />
                      </Form.Item>
                    );
                  }}
                </Form.Item>
              ),
            },
            {
              key: 'quantity',
              title: 'In a cubic metre',
              width: 200,
              align: 'right',
              render: (field) => (
                <Form.Item noStyle shouldUpdate>
                  {() => (
                    <Form.Item name={[field.name, 'quantity']} rules={[{ required: true, message: 'Enter how much goes into a cubic metre' }]} noStyle>
                      <QuantityInput aria-label="In a cubic metre" unit={form.getFieldValue(['lines', field.name, 'unit'])} />
                    </Form.Item>
                  )}
                </Form.Item>
              ),
            },
          ]}
        />
      </Form>
    </FormShell>
  );
}

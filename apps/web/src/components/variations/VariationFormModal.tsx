'use client';

import React, { useEffect, useMemo } from 'react';
import { App, Button, Form, Input, Select, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, BoqItemDto, VariationCause, VariationDto } from '@erp/shared';
import { VARIATION_CAUSES, VARIATION_CAUSE_LABELS, isUnapprovedExtra } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useBoq, useProjects } from '@/lib/queries';
import { formatINR, formatQty, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { UnitInput } from '@/components/common/UnitInput';
import { themeColor } from '@/lib/theme';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';

/** Picker value for a line that adds an item not yet in the BOQ. */
const NEW_ITEM = '__new__';

interface LineValues {
  boqItemId?: string;
  itemNo?: string;
  description?: string;
  unit?: string;
  qty?: number | null;
  rate?: number | null;
}

interface FormValues {
  projectId: string;
  title: string;
  cause: VariationCause;
  description?: string;
  lines: LineValues[];
  files?: AttachmentDto[];
}

const grid = (cols: string) => ({ display: 'grid', gridTemplateColumns: cols, gap: '0 12px', alignItems: 'start' }) as const;

/** Rate of a line: the BOQ rate for an item with a quantity, else the rate typed in. */
const lineRate = (l: LineValues | undefined, boq: Map<string, BoqItemDto>) => {
  if (!l) return 0;
  const b = l.boqItemId && l.boqItemId !== NEW_ITEM ? boq.get(l.boqItemId) : undefined;
  return b && !isUnapprovedExtra(b.originalQty, b.revisedQty) ? toNumber(b.rate) : (l.rate ?? 0);
};

/** Prepare a variation (or, with `variation`, change one the client has not approved). */
export function VariationFormModal({ open, onClose, projectId, variation, onSaved }: { open: boolean; onClose: () => void; projectId?: string; variation?: VariationDto | null; onSaved?: (v: VariationDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!variation;
  const fixedProject = variation?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: boqItems } = useBoq(open ? selectedProject : undefined);
  const lines = Form.useWatch('lines', form);
  const boq = useMemo(() => new Map((boqItems ?? []).map((b) => [b.id, b])), [boqItems]);
  const itemOptions = useMemo(
    () => [
      { value: NEW_ITEM, label: 'New item (not in the BOQ)' },
      ...(boqItems ?? []).map((b) => ({
        value: b.id,
        label: `${b.itemNo} ${b.description}${isUnapprovedExtra(b.originalQty, b.revisedQty) ? ' (extra item, no quantity yet)' : ''}`,
      })),
    ],
    [boqItems],
  );
  const total = (lines ?? []).reduce((s, l) => s + (l?.qty ?? 0) * lineRate(l, boq), 0);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (variation)
      form.setFieldsValue({
        projectId: variation.projectId,
        title: variation.title,
        cause: variation.cause,
        description: variation.description ?? undefined,
        lines: variation.lines.map((l) =>
          l.boqItemId
            ? { boqItemId: l.boqItemId, qty: toNumber(l.qty), rate: toNumber(l.rate) }
            : { boqItemId: NEW_ITEM, itemNo: l.itemNo, description: l.description, unit: l.unit, qty: toNumber(l.qty), rate: toNumber(l.rate) },
        ),
        files: variation.attachments,
      });
    else form.setFieldsValue({ projectId, cause: 'CLIENT_INSTRUCTION', lines: [{}] });
  }, [open, projectId, variation, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        title: v.title.trim(),
        cause: v.cause,
        description: v.description?.trim() || null,
        lines: v.lines.map((l) =>
          l.boqItemId === NEW_ITEM
            ? { itemNo: l.itemNo!.trim(), description: l.description!.trim(), unit: l.unit!.trim(), qty: String(l.qty), rate: String(l.rate) }
            : { boqItemId: l.boqItemId, qty: String(l.qty), ...(l.rate !== undefined && l.rate !== null ? { rate: String(l.rate) } : {}) },
        ),
        attachmentIds: (v.files ?? []).map((f) => f.id),
      };
      return variation ? (await api.patch<VariationDto>(`/variations/${variation.id}`, body)).data : (await api.post<VariationDto>('/variations', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (v) => {
      message.success(editing ? `${v.label} updated` : `${v.label} prepared`);
      qc.invalidateQueries({ queryKey: ['variations'] });
      onSaved?.(v);
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={variation ? `Edit ${variation.label}` : 'New variation'}
      okText={editing ? 'Save' : 'Prepare'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      width={900}
      draftKey={editing ? undefined : `variation:${projectId ?? 'any'}`}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Variation">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} onChange={() => form.setFieldsValue({ lines: [{}] })} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Give the variation a title' }]}>
              <Input maxLength={200} placeholder="Extra retaining wall at Km 14.2" />
            </Form.Item>
            <Form.Item name="cause" label="Cause" rules={[{ required: true, message: 'Choose the cause' }]}>
              <Select options={VARIATION_CAUSES.map((c) => ({ value: c, label: VARIATION_CAUSE_LABELS[c] }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="description" label="Justification">
            <Input.TextArea rows={2} maxLength={2000} placeholder="Instruction, drawing or site condition behind the change" />
          </Form.Item>
        </FormSection>

        <FormSection title="Items">
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
            A BOQ item with a quantity change (negative to omit), or a new item with its proposed rate. Nothing changes in the BOQ until the client approves.
          </Typography.Paragraph>
          <Form.List name="lines" rules={[{ validator: async (_, v) => (v?.length ? undefined : Promise.reject(new Error('Add at least one item'))) }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((f) => {
                  const l = lines?.[f.name];
                  const b = l?.boqItemId && l.boqItemId !== NEW_ITEM ? boq.get(l.boqItemId) : undefined;
                  const isNew = l?.boqItemId === NEW_ITEM;
                  const extra = !!b && isUnapprovedExtra(b.originalQty, b.revisedQty);
                  const amount = (l?.qty ?? 0) * lineRate(l, boq);
                  return (
                    <div key={f.key} className="variation-line" style={{ border: `1px solid ${themeColor('colorBorderSecondary')}`, borderRadius: 8, padding: '12px 12px 0', marginBottom: 8 }}>
                      <div style={grid('minmax(0, 1fr) 32px')}>
                        <Form.Item name={[f.name, 'boqItemId']} label="BOQ item" rules={[{ required: true, message: 'Pick an item or "New item"' }]}>
                          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Pick a BOQ item" options={itemOptions} disabled={!selectedProject} popupMatchSelectWidth={false} />
                        </Form.Item>
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} aria-label="Remove item" style={{ marginTop: 30 }} />
                      </div>
                      {isNew && (
                        <FormGrid cols={3}>
                          <Form.Item name={[f.name, 'itemNo']} label="Item no." rules={[{ required: true, whitespace: true, message: 'Enter the item number, e.g. 7.01' }]}>
                            <Input maxLength={30} placeholder="7.01" />
                          </Form.Item>
                          <Form.Item name={[f.name, 'description']} label="Description" rules={[{ required: true, whitespace: true, message: 'Describe the item' }]}>
                            <Input maxLength={1000} />
                          </Form.Item>
                          <Form.Item name={[f.name, 'unit']} label="Unit" rules={[{ required: true, whitespace: true, message: 'Enter the unit, e.g. Cum' }]}>
                            <UnitInput maxLength={20} placeholder="Cum" />
                          </Form.Item>
                        </FormGrid>
                      )}
                      <FormGrid cols={3}>
                        <Form.Item
                          name={[f.name, 'qty']}
                          label={isNew || extra ? 'Quantity' : 'Quantity added (− to omit)'}
                          extra={b ? `BOQ quantity ${formatQty(b.revisedQty ?? b.originalQty)} ${b.unit}` : undefined}
                          rules={[{ required: true, message: 'Enter the quantity' }, { validator: async (_, v) => (v === 0 ? Promise.reject(new Error('Enter a quantity other than 0')) : undefined) }]}
                        >
                          {/* A BOQ item's change can be negative (an omission). */}
                          <QuantityInput unit={isNew ? l?.unit : b?.unit} min={isNew || extra ? 0.001 : undefined} />
                        </Form.Item>
                        {isNew || extra ? (
                          <Form.Item name={[f.name, 'rate']} label="Proposed rate" rules={[{ required: true, message: 'Enter the proposed rate' }]}>
                            <MoneyInput />
                          </Form.Item>
                        ) : (
                          <Form.Item label="BOQ rate">
                            <span className="mono">{b ? formatINR(b.rate) : '-'}</span>
                          </Form.Item>
                        )}
                        <Form.Item label="Amount">
                          <span className="mono">{formatINR(amount)}</span>
                        </Form.Item>
                      </FormGrid>
                    </div>
                  );
                })}
                <Form.ErrorList errors={errors} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 0' }}>
                  <Button icon={<PlusOutlined />} onClick={() => add({})} disabled={!selectedProject}>
                    Add item
                  </Button>
                  <Typography.Text strong>
                    Claimed <span className="mono">{formatINR(total)}</span>
                  </Typography.Text>
                </div>
              </>
            )}
          </Form.List>
        </FormSection>
        <FormSection title="Documents">
          <Form.Item name="files" label="Instruction, drawing or estimate">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}

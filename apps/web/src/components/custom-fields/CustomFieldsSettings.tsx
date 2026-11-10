'use client';

import React, { useEffect, useState } from 'react';
import { Button, Checkbox, Flex, Form, Input, InputNumber, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { tk } from '@/ds';
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_ENTITY_INFO,
  FIELD_KINDS,
  FIELD_KIND_LABELS,
  MAX_CUSTOM_CHOICES,
  customFieldProblem,
  normaliseCustomField,
  type CustomFieldDto,
  type CustomFieldEntity,
  type CustomFieldInput,
  type FieldKind,
} from '@erp/shared';
import { useCustomFields, useSaveCustomField } from '@/lib/queries';
import { useNotify } from '@/lib/notify';
import { AppTag } from '@/components/common/AppTag';
import { Section, SectionStack } from '@/components/common/Section';
import { EditOutlined, PlusOutlined } from '@/components/common/icons';
import { FormGrid, FormShell } from '@/components/form/FormShell';

interface FieldForm {
  label: string;
  kind: FieldKind;
  required?: boolean;
  unit?: string;
  min?: number | null;
  max?: number | null;
  options?: string[];
}

/** Add a field (`entity` given) or change one (`field` given); its kind is fixed once saved. */
function FieldDialog({ entity, field, others, onClose }: { entity: CustomFieldEntity | null; field: CustomFieldDto | null; others: CustomFieldDto[]; onClose: () => void }) {
  const [form] = Form.useForm<FieldForm>();
  const notify = useNotify();
  const save = useSaveCustomField();
  const kind = Form.useWatch('kind', form);
  const open = !!entity;
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (field) form.setFieldsValue({ label: field.label, kind: field.kind, required: field.required, unit: field.unit ?? undefined, min: field.min, max: field.max, options: field.options });
    else form.setFieldsValue({ kind: 'TEXT', required: false });
  }, [open, field, form]);
  const asInput = (v: FieldForm): CustomFieldInput => ({ label: v.label ?? '', kind: field?.kind ?? v.kind, required: !!v.required, unit: v.unit ?? null, min: v.min ?? null, max: v.max ?? null, options: v.options ?? [] });
  const atSubmit = entity ? CUSTOM_FIELD_ENTITY_INFO[entity].requiredAtSubmit : false;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      projectDefault={false}
      title={field ? `Edit ${field.label}` : `New field on ${entity ? CUSTOM_FIELD_ENTITY_INFO[entity].label.toLowerCase() : ''}`}
      okText="Save field"
      onSubmit={async (v) => {
        const saved = await save.mutateAsync(field ? { id: field.id, field: asInput(v) } : { entity: entity!, field: asInput(v) });
        notify.success(field ? `${saved.label} saved` : `${saved.label} added`);
      }}
    >
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item
            name="label"
            label="Name"
            rules={[
              {
                validator: async (_, label?: string) => {
                  const p = customFieldProblem(normaliseCustomField({ label: label ?? '', kind: 'TEXT' }), others.filter((o) => o.id !== field?.id));
                  if (p) throw new Error(p);
                },
              },
            ]}
          >
            <Input maxLength={60} placeholder="MSME number" />
          </Form.Item>
          <Form.Item name="kind" label="Kind" extra={field ? 'Fixed once saved; add a new field for another kind.' : undefined}>
            <Select disabled={!!field} options={FIELD_KINDS.map((k) => ({ value: k, label: FIELD_KIND_LABELS[k] }))} />
          </Form.Item>
        </FormGrid>
        {field ? (
          <Form.Item label="Key" extra="Values are kept under it, so it never changes.">
            <Typography.Text className="mono" translate="no">
              {field.key}
            </Typography.Text>
          </Form.Item>
        ) : null}
        {kind === 'NUMBER' ? (
          <FormGrid cols={3}>
            <Form.Item name="unit" label="Unit">
              <Input maxLength={12} placeholder="Cr" />
            </Form.Item>
            <Form.Item name="min" label="Smallest">
              <InputNumber style={{ width: '100%' }} inputMode="decimal" />
            </Form.Item>
            <Form.Item
              name="max"
              label="Largest"
              dependencies={['min']}
              rules={[({ getFieldValue }) => ({ validator: async (_, max?: number | null) => { const min = getFieldValue('min'); if (min != null && max != null && min > max) throw new Error('Make the largest at least the smallest'); } })]}
            >
              <InputNumber style={{ width: '100%' }} inputMode="decimal" />
            </Form.Item>
          </FormGrid>
        ) : null}
        {kind === 'NUMBER' && field ? (
          <Typography.Paragraph type="secondary">
            A record already outside a new smallest or largest keeps its number until it is next saved, which asks for one inside.
          </Typography.Paragraph>
        ) : null}
        {kind === 'CHOICE' ? (
          <Form.Item
            name="options"
            label="Choices"
            extra={`Type each and press Enter; up to ${MAX_CUSTOM_CHOICES}.${field ? ' A record holding a choice you take out keeps it until it is next saved, which asks for one of these.' : ''}`}
            rules={[{ validator: async (_, v?: string[]) => { if ((v ?? []).filter((o) => o.trim()).length < 2) throw new Error('Give at least two choices'); } }]}
          >
            <Select mode="tags" open={false} tokenSeparators={[',']} aria-label="Choices" placeholder="A, B, C" />
          </Form.Item>
        ) : null}
        <Form.Item name="required" valuePropName="checked" style={{ marginBottom: 0 }} extra={atSubmit ? 'Asked for before the order goes for approval.' : 'Asked for on every save.'}>
          <Checkbox>Required</Checkbox>
        </Form.Item>
      </Form>
    </FormShell>
  );
}

function EntityFields({ entity, onAdd, onEdit }: { entity: CustomFieldEntity; onAdd: (others: CustomFieldDto[]) => void; onEdit: (f: CustomFieldDto, others: CustomFieldDto[]) => void }) {
  const { data, isLoading } = useCustomFields(entity);
  const save = useSaveCustomField();
  const notify = useNotify();
  const fields = data ?? [];
  const info = CUSTOM_FIELD_ENTITY_INFO[entity];
  const flip = async (f: CustomFieldDto) => {
    try {
      await save.mutateAsync({ id: f.id, archived: !f.archived });
      notify.success(f.archived ? `${f.label} is back on ${info.label.toLowerCase()}` : `${f.label} archived; records keep their values`);
    } catch (e) {
      notify.failed(e, () => flip(f));
    }
  };
  const columns: TableProps<CustomFieldDto>['columns'] = [
    {
      key: 'label',
      title: 'Field',
      render: (_, f) => (
        <Flex gap={tk.space[2]} align="center" wrap>
          <span>{f.label}</span>
          {f.archived ? <AppTag meaning="closed">Archived</AppTag> : null}
        </Flex>
      ),
    },
    { key: 'kind', title: 'Kind', render: (_, f) => [FIELD_KIND_LABELS[f.kind], f.kind === 'CHOICE' ? f.options.join(', ') : f.unit].filter(Boolean).join(' · '), responsive: ['sm'] },
    { key: 'required', title: 'Required', width: 110, render: (_, f) => (f.required ? 'Yes' : 'No') },
    {
      key: 'actions',
      title: <span className="visually-hidden">Actions</span>,
      width: 150,
      align: 'right',
      render: (_, f) => (
        <Flex gap={tk.space[1]} justify="end">
          <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${f.label}`} onClick={() => onEdit(f, fields)} />
          <Button size="small" onClick={() => flip(f)} loading={save.isPending && save.variables?.id === f.id}>
            {f.archived ? 'Restore' : 'Archive'}
          </Button>
        </Flex>
      ),
    },
  ];
  return (
    <Section
      title={info.label}
      extra={
        <Button icon={<PlusOutlined />} onClick={() => onAdd(fields)}>
          New field
        </Button>
      }
    >
      <Table<CustomFieldDto>
        rowKey="id"
        size="small"
        pagination={false}
        loading={isLoading}
        columns={columns}
        dataSource={fields}
        locale={{ emptyText: `No fields of your own on ${info.label.toLowerCase()} yet` }}
        aria-label={`Fields on ${info.label.toLowerCase()}`}
      />
    </Section>
  );
}

/**
 * Company settings › Fields (ARCHITECTURE "Custom fields"): each kind of record's fields of the company's own, with Add
 * field, Edit, Archive and Restore. The page is for admins only (`canManageCompanyData`; the API asks
 * `canManageCustomFields`).
 */
export function CustomFieldsSettings() {
  const [adding, setAdding] = useState<{ entity: CustomFieldEntity; field: CustomFieldDto | null; others: CustomFieldDto[] } | null>(null);
  return (
    <SectionStack>
      {CUSTOM_FIELD_ENTITIES.map((entity) => (
        <EntityFields key={entity} entity={entity} onAdd={(others) => setAdding({ entity, field: null, others })} onEdit={(field, others) => setAdding({ entity, field, others })} />
      ))}
      <FieldDialog entity={adding?.entity ?? null} field={adding?.field ?? null} others={adding?.others ?? []} onClose={() => setAdding(null)} />
    </SectionStack>
  );
}

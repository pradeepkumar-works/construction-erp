'use client';

import React, { useEffect, useRef } from 'react';
import { App, Checkbox, Form, Input, InputNumber, Select, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ELEMENT_SPEC_FIELDS,
  ELEMENT_TYPES_FOR,
  WORK_ELEMENT_TYPES,
  WORK_ELEMENT_TYPE_LABELS,
  elementPlan,
  type ElementActivityLine,
  type ProjectType,
  type StructureDto,
  type WorkElementDto,
  type WorkElementType,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { QuantityInput } from '@/components/form/inputs';

interface PlanLine extends ElementActivityLine {
  /** What the planner typed; starts from the template's quantity */
  plannedQty: number | null;
}

interface FormValues {
  parentId?: string | null;
  name: string;
  elementType: WorkElementType;
  code?: string;
  weightPct?: number | null;
  specs?: Record<string, number | null>;
  layOut?: boolean;
  lines?: PlanLine[];
}

/** Kinds a project of this type usually has first, then the rest. */
const typeOptions = (projectType: ProjectType) => {
  const first = ELEMENT_TYPES_FOR[projectType] ?? [];
  const rest = WORK_ELEMENT_TYPES.filter((t) => !first.includes(t));
  return [
    ...(first.length ? [{ label: 'Usual for this project', options: first.map((t) => ({ value: t, label: WORK_ELEMENT_TYPE_LABELS[t] })) }] : []),
    { label: first.length ? 'Other kinds' : 'Kinds', options: rest.map((t) => ({ value: t, label: WORK_ELEMENT_TYPE_LABELS[t] })) },
  ];
};

/**
 * Adds or changes a component or sub-component (item 125). A new one can lay out its kind's activities and
 * sub-activities with their weights; the planner fills or corrects the planned quantities before saving.
 */
export function ElementFormDrawer({
  open,
  onClose,
  projectId,
  projectType,
  structure,
  element,
  parentId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectType: ProjectType;
  structure: StructureDto | undefined;
  element?: WorkElementDto | null;
  /** A new sub-component goes in this component */
  parentId?: string | null;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const isEdit = !!element;
  const typed = useRef(new Map<string, number | null>());

  useEffect(() => {
    if (!open) return;
    typed.current.clear();
    form.resetFields();
    if (element) {
      form.setFieldsValue({
        parentId: element.parentId,
        name: element.name,
        elementType: element.elementType,
        code: element.code,
        weightPct: element.weightPct !== null ? Number(element.weightPct) : null,
        specs: element.specs ?? {},
      });
    } else {
      form.setFieldsValue({ parentId: parentId ?? null, layOut: true, specs: {} });
    }
  }, [open, element, parentId, form]);

  const elementType = Form.useWatch('elementType', form);
  const specs = Form.useWatch('specs', form);
  const layOut = Form.useWatch('layOut', form);
  const specKey = JSON.stringify(specs ?? {});

  // The template's lines follow the kind and the specs; a quantity the planner typed stays.
  useEffect(() => {
    if (!open || isEdit || !elementType) return;
    const plan = elementPlan(elementType, (JSON.parse(specKey) as Record<string, number | null>) ?? {});
    form.setFieldValue(
      'lines',
      plan.map((l) => ({ ...l, plannedQty: typed.current.has(l.key) ? typed.current.get(l.key)! : l.qty })),
    );
  }, [open, isEdit, elementType, specKey, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const cleanSpecs = Object.fromEntries(Object.entries(v.specs ?? {}).filter(([, n]) => n !== null && n !== undefined)) as Record<string, number>;
      const body = {
        parentId: v.parentId || null,
        name: v.name.trim(),
        elementType: v.elementType,
        code: v.code?.trim() || undefined,
        weightPct: v.weightPct !== null && v.weightPct !== undefined ? String(v.weightPct) : null,
        specs: Object.keys(cleanSpecs).length ? cleanSpecs : null,
      };
      if (isEdit && element) return (await api.patch<StructureDto>(`/projects/${projectId}/structure/elements/${element.id}`, body)).data;
      const lines = v.layOut ? (v.lines ?? []) : [];
      return (
        await api.post<StructureDto>(`/projects/${projectId}/structure/elements`, {
          ...body,
          activities: lines.map((l) => ({
            key: l.key,
            parentKey: l.parentKey,
            name: l.name,
            unit: l.unit,
            weightPct: String(l.weightPct),
            plannedQty: l.plannedQty !== null && l.plannedQty !== undefined ? String(l.plannedQty) : null,
          })),
        })
      ).data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['activities', projectId, 'structure'], data);
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      message.success(isEdit ? 'Component updated' : 'Component added');
    },
    meta: FAIL_NOTICE,
  });

  const components = (structure?.elements ?? []).filter((e) => e.level === 'COMPONENT' && e.id !== element?.id);
  const fields = elementType ? ELEMENT_SPEC_FIELDS[elementType] : [];
  const hasSubs = !!element && (structure?.elements ?? []).some((e) => e.parentId === element.id);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={880}
      allValues
      title={isEdit ? `Edit ${element?.code} ${element?.name}` : parentId ? 'New sub-component' : 'New component'}
      okText="Save"
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Component">
          <FormGrid cols={2}>
            <Form.Item name="elementType" label="Kind" rules={[{ required: true, message: 'Choose what it is, e.g. Overhead tank' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Overhead tank" options={typeOptions(projectType)} />
            </Form.Item>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, min: 2, message: 'Name it, e.g. OHT 650 KL, Ward 4' }]}>
              <Input placeholder="OHT 650 KL, Ward 4" />
            </Form.Item>
            <Form.Item name="parentId" label="Inside" tooltip={hasSubs ? 'It has sub-components of its own, so it stays a component' : 'Leave empty for a component of the project'}>
              <Select
                allowClear
                disabled={hasSubs}
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="The project (a component)"
                options={components.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))}
              />
            </Form.Item>
            <FormGrid cols={2}>
              <Form.Item name="code" label="Number" tooltip="Outline number, e.g. 8 or 8.1. Left empty, the next free one.">
                <Input placeholder="Next free" />
              </Form.Item>
              <Form.Item name="weightPct" label="Weight" tooltip="Share of the project, or of its component, %. Lump sum contracts usually take the billing breakup. Left empty, it shares what is left by BOQ value.">
                <InputNumber min={0} max={100} step={0.5} suffix="%" style={{ width: '100%' }} placeholder="Auto" />
              </Form.Item>
            </FormGrid>
          </FormGrid>
          {fields.length ? (
            <FormGrid cols={fields.length >= 3 ? 3 : 2}>
              {fields.map((f) => (
                <Form.Item key={f.key} name={['specs', f.key]} label={f.label}>
                  <InputNumber min={0} suffix={f.unit} style={{ width: '100%' }} placeholder={f.default !== undefined ? String(f.default) : undefined} />
                </Form.Item>
              ))}
            </FormGrid>
          ) : null}
        </FormSection>
        {!isEdit && elementType ? (
          <FormSection
            title="Activities"
            extra={
              <Form.Item name="layOut" valuePropName="checked" noStyle>
                <Checkbox>Lay out its activities</Checkbox>
              </Form.Item>
            }
          >
            {layOut ? (
              <PlanLines onQty={(key, qty) => typed.current.set(key, qty)} />
            ) : (
              <Typography.Paragraph type="secondary">Only the component is added. Its activities can be added from the Activities tab.</Typography.Paragraph>
            )}
          </FormSection>
        ) : null}
      </Form>
    </FormShell>
  );
}

function PlanLines({ onQty }: { onQty: (key: string, qty: number | null) => void }) {
  const form = Form.useFormInstance<FormValues>();
  // `preserve`: the lines are set before their table (the Form.List) is drawn.
  const lines: PlanLine[] = Form.useWatch('lines', { form, preserve: true }) ?? [];
  if (!lines.length) return <Typography.Paragraph type="secondary">This kind has no activities of its own; add its parts as sub-components.</Typography.Paragraph>;
  return (
    <>
      <Typography.Paragraph type="secondary">
        Weights are each line&apos;s share of its activity, or of the component. Fill the planned quantities you know now; the rest can wait for the drawings.
      </Typography.Paragraph>
      <LineTable
        name="lines"
        label="Activity"
        locked
        columns={[
          {
            key: 'name',
            title: 'Activity',
            render: (field) => {
              const l = lines[field.name];
              return <span style={l?.parentKey ? { paddingInlineStart: 20 } : { fontWeight: 600 }}>{l?.name}</span>;
            },
          },
          { key: 'unit', title: 'Unit', width: 70, render: (field) => lines[field.name]?.unit },
          { key: 'weight', title: 'Weight', width: 80, align: 'right', render: (field) => `${Math.round((lines[field.name]?.weightPct ?? 0) * 10) / 10}%` },
          {
            key: 'qty',
            title: 'Planned qty',
            width: 160,
            render: (field) => {
              const l = lines[field.name];
              return (
                <Form.Item name={[field.name, 'plannedQty']} noStyle>
                  <QuantityInput unit={l?.unit} aria-label={`Planned quantity of ${l?.name}`} style={{ width: '100%' }} onChange={(v) => l && onQty(l.key, (v as number | null) ?? null)} />
                </Form.Item>
              );
            },
          },
        ]}
      />
    </>
  );
}

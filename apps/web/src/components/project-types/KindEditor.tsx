'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, Button, Checkbox, Form, Input, InputNumber, Select, Switch, Table, Typography, theme } from 'antd';
import type { FormListFieldData } from 'antd';
import {
  MAX_KIND_STEPS,
  MAX_SPEC_FIELDS,
  STANDARD_RCC_PARTS,
  WORK_ELEMENT_TYPES,
  WORK_ELEMENT_TYPE_LABELS,
  componentKindProblems,
  kindPlan,
  type ComponentKindDef,
  type ComponentKindDto,
  type ComponentStep,
  type ElementActivityLine,
  type ElementSpecField,
  type WorkElementType,
} from '@erp/shared';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, SyncOutlined } from '@/components/common/icons';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { useSaveComponentKind } from '@/lib/queries';

const STEP_KINDS: { value: ComponentStep['kind']; label: string }[] = [
  { value: 'plain', label: 'Activity' },
  { value: 'rcc', label: 'RCC (steel, shuttering, concrete)' },
  { value: 'lifts', label: 'RCC in lifts' },
  { value: 'group', label: 'Activity with sub-activities' },
];

/** A step as the form holds it: every kind's fields, of which the step's kind uses some. */
interface StepRow {
  kind: ComponentStep['kind'];
  name: string;
  unit?: string;
  weightPct: number;
  qtyFrom?: string;
  lumpSum?: boolean;
  over?: string;
  parts?: { name: string; unit: string; weightPct: number }[];
  subs?: { name: string; unit: string; weightPct: number; qtyFrom?: string; lumpSum?: boolean }[];
}

interface Values {
  name: string;
  elementType: WorkElementType;
  active: boolean;
  specFields: ElementSpecField[];
  steps: StepRow[];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** The form's steps as the API takes them: only the fields each kind of step has. */
export function stepsOf(rows: StepRow[] | undefined): ComponentStep[] {
  return (rows ?? []).filter(Boolean).map((r): ComponentStep => {
    const base = { name: text(r.name), weightPct: num(r.weightPct) };
    const parts = (r.parts ?? []).filter(Boolean).map((p) => ({ name: text(p.name), unit: text(p.unit), weightPct: num(p.weightPct) }));
    switch (r.kind) {
      case 'rcc':
        return { kind: 'rcc', ...base, ...(parts.length ? { parts } : {}) };
      case 'lifts':
        return { kind: 'lifts', ...base, over: text(r.over), ...(parts.length ? { parts } : {}) };
      case 'group':
        return {
          kind: 'group',
          ...base,
          unit: text(r.unit) || 'LS',
          subs: (r.subs ?? []).filter(Boolean).map((s) => ({ name: text(s.name), unit: text(s.unit), weightPct: num(s.weightPct), ...(s.qtyFrom ? { qtyFrom: s.qtyFrom } : {}), ...(s.lumpSum ? { lumpSum: true } : {}) })),
        };
      default:
        return { kind: 'plain', ...base, unit: text(r.unit), ...(r.qtyFrom ? { qtyFrom: r.qtyFrom } : {}), ...(r.lumpSum ? { lumpSum: true } : {}) };
    }
  });
}

const fieldsOf = (rows: ElementSpecField[] | undefined): ElementSpecField[] =>
  (rows ?? []).filter(Boolean).map((f) => ({ key: text(f.key), label: text(f.label), unit: text(f.unit), ...(typeof f.default === 'number' ? { default: f.default } : {}) }));

/** The activities a component of this kind lays out, as a tree: what the planner sees in New component. */
export function PlanPreview({ lines, empty }: { lines: ElementActivityLine[]; empty?: string }) {
  type Row = ElementActivityLine & { children?: Row[] };
  const rows = useMemo<Row[]>(() => {
    const top = lines.filter((l) => !l.parentKey).map((l) => ({ ...l }) as Row);
    for (const t of top) {
      const kids = lines.filter((l) => l.parentKey === t.key);
      if (kids.length) t.children = kids;
    }
    return top;
  }, [lines]);
  if (!lines.length) return <Typography.Paragraph type="secondary">{empty ?? 'No activities yet.'}</Typography.Paragraph>;
  return (
    <Table<Row>
      size="small"
      rowKey="key"
      pagination={false}
      dataSource={rows}
      expandable={{ defaultExpandAllRows: true }}
      scroll={{ x: 480 }}
      columns={[
        { key: 'name', title: 'Activity', dataIndex: 'name' },
        { key: 'unit', title: 'Unit', dataIndex: 'unit', width: 80 },
        { key: 'qty', title: 'Quantity', dataIndex: 'qty', width: 100, align: 'right', render: (v: number | null) => (v === null ? <span className="text-muted">Planner</span> : <span translate="no">{v}</span>) },
        { key: 'weight', title: 'Weight', dataIndex: 'weightPct', width: 90, align: 'right', render: (v: number) => <span translate="no">{Math.round(v * 10) / 10}%</span> },
      ]}
    />
  );
}

function StepCard({ field, index, count, specs, onMove, onRemove }: { field: FormListFieldData; index: number; count: number; specs: { value: string; label: string }[]; onMove: (to: number) => void; onRemove: () => void }) {
  const { token } = theme.useToken();
  const form = Form.useFormInstance<Values>();
  const kind = Form.useWatch(['steps', field.name, 'kind'], form) as StepRow['kind'] | undefined;
  const name = (Form.useWatch(['steps', field.name, 'name'], form) as string | undefined)?.trim() || `step ${index + 1}`;
  return (
    <div data-line-label={`Step ${index + 1}`} style={{ border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: token.paddingSM, marginBottom: token.marginSM }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: token.marginXS, marginBottom: token.marginXS }}>
        <Typography.Text strong>Step {index + 1}</Typography.Text>
        <span>
          <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(index - 1)} />
          <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${name}`} onClick={onRemove} />
        </span>
      </div>
      <FormGrid cols={4}>
        <Form.Item name={[field.name, 'kind']} label="Kind of step" rules={[{ required: true, message: 'Choose the kind of step' }]}>
          <Select options={STEP_KINDS} />
        </Form.Item>
        <Form.Item name={[field.name, 'name']} label="Name" rules={[{ required: true, whitespace: true, message: 'Name the step, e.g. Excavation' }]}>
          <Input maxLength={120} placeholder="Excavation" />
        </Form.Item>
        <Form.Item name={[field.name, 'weightPct']} label="Weight" rules={[{ required: true, message: 'Enter its share, %' }]}>
          <InputNumber min={0} max={100} step={0.5} suffix="%" style={{ width: '100%' }} />
        </Form.Item>
        {kind === 'plain' || kind === 'group' ? (
          <Form.Item name={[field.name, 'unit']} label="Unit" rules={[{ required: true, whitespace: true, message: 'Enter its unit, e.g. Cum' }]}>
            <UnitInput />
          </Form.Item>
        ) : kind === 'lifts' ? (
          <Form.Item name={[field.name, 'over']} label="Lifts over" rules={[{ required: true, message: 'Choose the height or floors the lifts are counted over' }]} tooltip="The number of lifts is this spec divided by the lift height (the liftM spec, else 3 m); floors count one lift each.">
            <Select options={specs} placeholder="Staging height" />
          </Form.Item>
        ) : (
          <div />
        )}
      </FormGrid>
      {kind === 'plain' ? (
        <FormGrid cols={2}>
          <Form.Item name={[field.name, 'qtyFrom']} label="Quantity from" tooltip="Left empty, the planner fills the quantity in.">
            <Select allowClear options={specs} placeholder="The planner fills it in" />
          </Form.Item>
          <Form.Item name={[field.name, 'lumpSum']} valuePropName="checked" label="Lump sum">
            <Checkbox>One lump sum (quantity 1)</Checkbox>
          </Form.Item>
        </FormGrid>
      ) : null}
      {kind === 'rcc' || kind === 'lifts' ? (
        <>
          <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginXS }}>
            Parts of each {kind === 'lifts' ? 'lift' : 'RCC activity'}. Left empty: {STANDARD_RCC_PARTS.map((p) => `${p.name.toLowerCase()} ${p.weightPct}%`).join(', ')}.
          </Typography.Paragraph>
          <LineTable
            name={[field.name, 'parts']}
            label={`${name} part`}
            addText="Add part"
            newLine={() => ({ name: '', unit: 'Cum', weightPct: 0 })}
            columns={[
              { key: 'name', title: 'Part', render: (f) => <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, whitespace: true, message: 'Name the part' }]}><Input aria-label="Part name" maxLength={120} /></Form.Item> },
              { key: 'unit', title: 'Unit', width: 110, render: (f) => <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, message: 'Enter the unit' }]}><UnitInput aria-label="Part unit" style={{ width: '100%' }} /></Form.Item> },
              { key: 'weight', title: 'Weight', width: 110, render: (f) => <Form.Item name={[f.name, 'weightPct']} noStyle rules={[{ required: true, message: 'Enter its share' }]}><InputNumber aria-label="Part weight" min={0} max={100} suffix="%" style={{ width: '100%' }} /></Form.Item> },
            ]}
          />
        </>
      ) : null}
      {kind === 'group' ? (
        <LineTable
          name={[field.name, 'subs']}
          label={`${name} sub-activity`}
          addText="Add sub-activity"
          newLine={() => ({ name: '', unit: 'Nos', weightPct: 0 })}
          columns={[
            { key: 'name', title: 'Sub-activity', render: (f) => <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, whitespace: true, message: 'Name the sub-activity' }]}><Input aria-label="Sub-activity name" maxLength={120} /></Form.Item> },
            { key: 'unit', title: 'Unit', width: 110, render: (f) => <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, message: 'Enter the unit' }]}><UnitInput aria-label="Sub-activity unit" style={{ width: '100%' }} /></Form.Item> },
            { key: 'weight', title: 'Weight', width: 110, render: (f) => <Form.Item name={[f.name, 'weightPct']} noStyle rules={[{ required: true, message: 'Enter its share' }]}><InputNumber aria-label="Sub-activity weight" min={0} max={100} suffix="%" style={{ width: '100%' }} /></Form.Item> },
            { key: 'qtyFrom', title: 'Quantity from', width: 170, render: (f) => <Form.Item name={[f.name, 'qtyFrom']} noStyle><Select aria-label="Sub-activity quantity from" allowClear options={specs} placeholder="Planner" style={{ width: '100%' }} /></Form.Item> },
          ]}
        />
      ) : null}
    </div>
  );
}

/**
 * Change a component kind (item 134): its specs (what the planner fills in, such as the staging height) and its steps,
 * which become a new component's activities and sub-activities. Components already laid out keep theirs.
 */
export function KindEditor({ kind, editable, onClose, onUpdateProjects }: { kind: ComponentKindDto | null; editable: boolean; onClose: () => void; onUpdateProjects?: (kind: ComponentKindDto) => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useSaveComponentKind();

  useEffect(() => {
    if (!kind) return;
    form.resetFields();
    form.setFieldsValue({
      name: kind.name,
      elementType: kind.elementType,
      active: kind.active,
      specFields: kind.specFields.map((f) => ({ ...f })),
      steps: kind.steps.map((s) => ({ ...s, parts: 'parts' in s && s.parts ? s.parts.map((p) => ({ ...p })) : [], subs: 'subs' in s ? s.subs.map((p) => ({ ...p })) : [] }) as StepRow),
    });
  }, [kind, form]);

  const watched = Form.useWatch([], form) as Partial<Values> | undefined;
  const def = useMemo<ComponentKindDef | null>(
    () => (kind && watched ? { code: kind.code, name: text(watched.name), elementType: watched.elementType ?? kind.elementType, active: watched.active ?? true, specFields: fieldsOf(watched.specFields), steps: stepsOf(watched.steps) } : null),
    [kind, watched],
  );
  const problems = def ? componentKindProblems(def) : [];
  const plan = useMemo(() => {
    if (!def || problems.length) return [];
    try {
      return kindPlan(def, null);
    } catch {
      return [];
    }
  }, [def, problems.length]);
  const specs = (def?.specFields ?? []).filter((f) => f.key).map((f) => ({ value: f.key, label: `${f.label || f.key} (${f.key})` }));

  return (
    <FormShell<Values>
      open={!!kind}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={960}
      allValues
      title={kind ? `${editable ? 'Edit' : 'View'} ${kind.name}` : ''}
      okText="Save kind"
      okDisabled={!editable || problems.length > 0}
      projectDefault={false}
      onSubmit={async (v) => {
        if (!kind) return;
        await save.mutateAsync({ code: kind.code, name: v.name.trim(), elementType: v.elementType, active: v.active, specFields: fieldsOf(v.specFields), steps: stepsOf(v.steps) });
        message.success(`${v.name.trim()} saved. New components take its steps; give them to older ones with Update projects.`);
      }}
    >
      <Form form={form} layout="vertical" disabled={!editable}>
        <FormSection title="Kind">
          <FormGrid cols={3}>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name, e.g. Bridge pier' }]}>
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item
              name="elementType"
              label="Built on"
              tooltip={kind?.components ? 'Components were laid out from it, so this stays; make a new kind instead.' : 'Where its components show in reports and stock checks.'}
            >
              <Select disabled={!!kind?.components} showSearch={{ optionFilterProp: 'label' }} options={WORK_ELEMENT_TYPES.map((t) => ({ value: t, label: WORK_ELEMENT_TYPE_LABELS[t] }))} />
            </Form.Item>
            <Form.Item name="active" label="In use" valuePropName="checked" tooltip="Archived, it is no longer offered for a new component.">
              <Switch />
            </Form.Item>
          </FormGrid>
        </FormSection>
        {editable && kind?.components && onUpdateProjects ? (
          <Typography.Paragraph type="secondary">
            {kind.components} component{kind.components === 1 ? ' was' : 's were'} laid out from it, and keep the steps they had.{' '}
            <Button
              size="small"
              icon={<SyncOutlined />}
              disabled={form.isFieldsTouched()}
              title={form.isFieldsTouched() ? 'Save your changes first' : undefined}
              onClick={() => onUpdateProjects(kind)}
            >
              Update projects
            </Button>
          </Typography.Paragraph>
        ) : null}
        <FormSection title="Specs">
          <Typography.Paragraph type="secondary">What the planner fills in for each component, such as the staging height. A step&apos;s quantity or its lifts are read from them. Up to {MAX_SPEC_FIELDS}.</Typography.Paragraph>
          <LineTable
            name="specFields"
            label="Spec"
            addText="Add spec"
            newLine={() => ({ key: '', label: '', unit: 'm' })}
            columns={[
              { key: 'label', title: 'Spec', render: (f) => <Form.Item name={[f.name, 'label']} noStyle rules={[{ required: true, whitespace: true, message: 'Name the spec' }]}><Input aria-label="Spec name" maxLength={60} placeholder="Staging height" /></Form.Item> },
              {
                key: 'key',
                title: 'Key',
                width: 160,
                render: (f) => (
                  <Form.Item name={[f.name, 'key']} noStyle rules={[{ required: true, pattern: /^[a-z][A-Za-z]{0,29}$/, message: 'Letters only, starting small, e.g. stagingM' }]}>
                    <Input aria-label="Spec key" maxLength={30} placeholder="stagingM" translate="no" spellCheck={false} autoComplete="off" />
                  </Form.Item>
                ),
              },
              { key: 'unit', title: 'Unit', width: 110, render: (f) => <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, message: 'Enter the unit' }]}><UnitInput aria-label="Spec unit" style={{ width: '100%' }} /></Form.Item> },
              { key: 'default', title: 'Usually', width: 110, render: (f) => <Form.Item name={[f.name, 'default']} noStyle><InputNumber aria-label="Spec usual value" min={0} style={{ width: '100%' }} /></Form.Item> },
            ]}
          />
        </FormSection>
        <FormSection title="Steps">
          <Typography.Paragraph type="secondary">Each step becomes an activity of a new component; the weights are its share of the component and add up to 100%.</Typography.Paragraph>
          <Form.List name="steps">
            {(fields, ops) => (
              <>
                {fields.map((field, i) => (
                  <StepCard key={field.key} field={field} index={i} count={fields.length} specs={specs} onMove={(to) => ops.move(i, to)} onRemove={() => ops.remove(field.name)} />
                ))}
                {editable ? (
                  <Button type="dashed" block icon={<PlusOutlined />} disabled={fields.length >= MAX_KIND_STEPS} onClick={() => ops.add({ kind: 'plain', name: '', unit: 'Cum', weightPct: 0, parts: [], subs: [] })}>
                    Add step
                  </Button>
                ) : null}
              </>
            )}
          </Form.List>
        </FormSection>
        <FormSection title="A new component lays out">
          {problems.length ? <Alert type="warning" showIcon title="Fix these to save" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>} /> : <PlanPreview lines={plan} empty="This kind has no steps; its parts are added as sub-components." />}
        </FormSection>
      </Form>
    </FormShell>
  );
}

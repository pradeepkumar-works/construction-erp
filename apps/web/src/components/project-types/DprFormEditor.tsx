'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Checkbox, Form, Input, InputNumber, Radio, Segmented, Select, Switch, Typography } from 'antd';
import {
  DPR_BUILT_INS,
  DPR_FIELD_KINDS,
  DPR_FIELD_KIND_LABELS,
  DPR_FIELD_SCOPES,
  DPR_FIELD_SCOPE_LABELS,
  DPR_LINE_PARTS,
  DPR_LINE_PART_LABELS,
  DPR_PICKERS,
  DPR_PICKER_LABELS,
  DPR_SECTION_LABELS,
  MAX_OWN_FIELDS,
  MAX_PHOTOS_REQUIRED,
  dprFormChangeProblems,
  dprFormProblems,
  normaliseDprForm,
  ownFieldKey,
  type DprFieldKind,
  type DprFieldScope,
  type DprFieldSetting,
  type DprFormDef,
  type DprLinePart,
  type DprPicker,
  type ProjectTypeDto,
} from '@erp/shared';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { useSaveDprForm } from '@/lib/queries';
import { DprFormPreview, type PreviewMode } from './DprFormPreview';

interface OwnRow {
  key?: string;
  label?: string;
  labelHi?: string;
  kind?: DprFieldKind;
  scope?: DprFieldScope;
  required?: boolean;
  unit?: string;
  min?: number | null;
  max?: number | null;
  options?: string[];
}

interface Values {
  fields: DprFieldSetting[];
  minPhotos: number;
  picker: DprPicker;
  parts: DprLinePart[];
  crewCategories: string[];
  machineNames: string[];
  own: OwnRow[];
}

const valuesOf = (def: DprFormDef): Values => ({
  fields: def.fields.map((f) => ({ ...f })),
  minPhotos: def.minPhotos,
  picker: def.lines.picker,
  parts: [...def.lines.parts],
  crewCategories: [...def.lines.crewCategories],
  machineNames: [...def.lines.machineNames],
  own: def.own.map((f) => ({ ...f, labelHi: f.labelHi ?? undefined, unit: f.unit ?? undefined })),
});

/** The definition the values make: a new field takes a key from its name. */
const defOf = (v: Partial<Values>): DprFormDef => {
  const taken = (v.own ?? []).flatMap((f) => (f?.key ? [f.key] : []));
  return normaliseDprForm({
    fields: (v.fields ?? []).map((f) => ({ ...f, label: f.label?.trim() || null })),
    minPhotos: v.minPhotos ?? 0,
    lines: { picker: v.picker, parts: v.parts ?? [], crewCategories: v.crewCategories ?? [], machineNames: v.machineNames ?? [] },
    own: (v.own ?? []).filter(Boolean).map((f) => {
      const key = f.key || ownFieldKey(f.label ?? '', taken);
      if (!f.key) taken.push(key);
      return { ...f, key, label: f.label?.trim() ?? '', labelHi: f.labelHi?.trim() || null, unit: f.unit?.trim() || null };
    }),
  });
};

/**
 * Change a project type's DPR form: which built-in fields show, which are required and what they are
 * called, the photos a report needs, what a work line takes, and up to 20 fields of the company's own. A save is a new
 * version: the next report on every project of the type takes it, and reports made already keep theirs.
 */
export function DprFormEditor({
  type,
  def,
  saved,
  progressFromDpr,
  open,
  onClose,
}: {
  type: ProjectTypeDto;
  def: DprFormDef;
  /** Keys of the company's own fields some saved version has: their kind and place stay */
  saved: DprFormDef[];
  progressFromDpr: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useSaveDprForm();
  const [mode, setMode] = useState<PreviewMode>('web');

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(valuesOf(def));
  }, [open, def, form]);

  const watched = Form.useWatch([], form) as Partial<Values> | undefined;
  const next = useMemo(() => (watched?.fields ? defOf(watched) : def), [watched, def]);
  const fixed = useMemo(() => new Set(saved.flatMap((d) => d.own.map((f) => f.key))), [saved]);
  const problems = [...dprFormProblems(next, { progressFromDpr }), ...new Set(saved.flatMap((b) => dprFormChangeProblems(b, next)))];
  const rows = watched?.own ?? [];
  const fieldRows = watched?.fields ?? [];

  return (
    <FormShell<Values>
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={1080}
      allValues
      title={`DPR form of ${type.name}`}
      okText="Save form"
      okDisabled={problems.length > 0}
      projectDefault={false}
      onSubmit={async (v) => {
        const saved = await save.mutateAsync({ code: type.code, definition: defOf(v) });
        message.success(`Version ${saved.version} saved. The next report on every ${type.name} project takes it; reports made already keep theirs.`);
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Built-in fields">
          <Typography.Paragraph type="secondary">
            Hide what your sites do not report, require what they must, and call a field what your sites call it. Issues always shows, as the hindrance register reads it.
          </Typography.Paragraph>
          <LineTable
            name="fields"
            label="Field"
            locked
            columns={[
              {
                key: 'field',
                title: 'Field',
                render: (f) => {
                  const key = fieldRows[f.name]?.key;
                  return key ? (
                    <span>
                      {DPR_BUILT_INS[key].label}
                      <Typography.Text type="secondary" style={{ display: 'block' }}>
                        {DPR_SECTION_LABELS[DPR_BUILT_INS[key].section]}
                      </Typography.Text>
                    </span>
                  ) : null;
                },
              },
              {
                key: 'show',
                title: 'Shows',
                width: 90,
                render: (f) => {
                  const key = fieldRows[f.name]?.key;
                  const locked = !key || !DPR_BUILT_INS[key].canHide || (key === 'lines' && progressFromDpr);
                  return (
                    <Form.Item name={[f.name, 'show']} noStyle valuePropName="checked">
                      <Switch
                        aria-label={`Show ${key ? DPR_BUILT_INS[key].label : 'field'}`}
                        disabled={locked}
                        title={key === 'lines' && progressFromDpr ? 'The company records progress only from the DPR' : undefined}
                        onChange={(on) => {
                          if (!on) form.setFieldValue(['fields', f.name, 'required'], false);
                        }}
                      />
                    </Form.Item>
                  );
                },
              },
              {
                key: 'required',
                title: 'Required',
                width: 100,
                render: (f) => {
                  const row = fieldRows[f.name];
                  if (row?.key === 'photos') return <Typography.Text type="secondary">By count</Typography.Text>;
                  return (
                    <Form.Item name={[f.name, 'required']} noStyle valuePropName="checked">
                      <Checkbox aria-label={`Require ${row?.key ? DPR_BUILT_INS[row.key].label : 'field'}`} disabled={!row?.show} />
                    </Form.Item>
                  );
                },
              },
              {
                key: 'label',
                title: 'Name on the form',
                width: 280,
                render: (f) => {
                  const key = fieldRows[f.name]?.key;
                  return (
                    <Form.Item name={[f.name, 'label']} noStyle>
                      <Input aria-label={`Name of ${key ? DPR_BUILT_INS[key].label : 'field'}`} maxLength={60} placeholder={key ? DPR_BUILT_INS[key].label : undefined} allowClear />
                    </Form.Item>
                  );
                },
              },
            ]}
          />
          <FormGrid cols={3}>
            <Form.Item
              name="minPhotos"
              label="Site photos a report needs"
              style={{ marginTop: 16 }}
              extra={next.fields.find((f) => f.key === 'photos')?.show ? 'A report cannot be sent with fewer.' : 'Photos are hidden, so none are asked for.'}
            >
              <InputNumber min={0} max={MAX_PHOTOS_REQUIRED} precision={0} disabled={!next.fields.find((f) => f.key === 'photos')?.show} style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </FormSection>

        <FormSection title="Work lines">
          <Form.Item name="picker" label="Choosing the activity">
            <Radio.Group options={DPR_PICKERS.map((p) => ({ value: p, label: DPR_PICKER_LABELS[p] }))} />
          </Form.Item>
          <Form.Item name="parts" label="Each line also takes" extra="The activity, where and the quantity are always asked.">
            <Checkbox.Group options={DPR_LINE_PARTS.map((p) => ({ value: p, label: DPR_LINE_PART_LABELS[p] }))} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="crewCategories" label="Trades offered" extra="Offered for the day's labour and each line's. Type to add one.">
              <Select mode="tags" aria-label="Trades offered" tokenSeparators={[',']} placeholder="Mason, Helper…" />
            </Form.Item>
            <Form.Item name="machineNames" label="Machines offered" extra="Offered by name; anything else can still be typed.">
              <Select mode="tags" aria-label="Machines offered" tokenSeparators={[',']} placeholder="JCB 3DX, Tipper…" />
            </Form.Item>
          </FormGrid>
        </FormSection>

        <FormSection title="Fields of your own">
          <Typography.Paragraph type="secondary">
            Up to {MAX_OWN_FIELDS} figures or notes your sites report every day, for the day or for each work line. Once saved, a field keeps its kind and where it is asked, so the reports made on it still
            read; add a new field instead. The Hindi name shows on phones set to Hindi.
          </Typography.Paragraph>
          <LineTable
            name="own"
            label="Field of your own"
            addText="Add field"
            newLine={() => ({ key: '', label: '', kind: 'NUMBER', scope: 'DAY', required: false, options: [] })}
            columns={[
              {
                key: 'label',
                title: 'Name',
                render: (f) => (
                  <Form.Item name={[f.name, 'label']} noStyle rules={[{ required: true, whitespace: true, message: 'Name the field, e.g. Rain hours' }]}>
                    <Input aria-label={`Name of field ${f.name + 1}`} maxLength={60} placeholder="Rain hours" />
                  </Form.Item>
                ),
              },
              {
                key: 'labelHi',
                title: 'Hindi name',
                width: 170,
                render: (f) => (
                  <Form.Item name={[f.name, 'labelHi']} noStyle>
                    <Input aria-label={`Hindi name of field ${f.name + 1}`} maxLength={60} lang="hi" />
                  </Form.Item>
                ),
              },
              {
                key: 'kind',
                title: 'Kind',
                width: 150,
                render: (f) => {
                  const kept = !!rows[f.name]?.key && fixed.has(rows[f.name]!.key!);
                  return (
                    <Form.Item name={[f.name, 'kind']} noStyle>
                      <Select aria-label={`Kind of field ${f.name + 1}`} disabled={kept} title={kept ? 'Saved already; add a new field for another kind' : undefined} options={DPR_FIELD_KINDS.map((k) => ({ value: k, label: DPR_FIELD_KIND_LABELS[k] }))} style={{ width: '100%' }} />
                    </Form.Item>
                  );
                },
              },
              {
                key: 'scope',
                title: 'Asked for',
                width: 150,
                render: (f) => {
                  const kept = !!rows[f.name]?.key && fixed.has(rows[f.name]!.key!);
                  return (
                    <Form.Item name={[f.name, 'scope']} noStyle>
                      <Select aria-label={`Field ${f.name + 1} is asked for`} disabled={kept} options={DPR_FIELD_SCOPES.map((s) => ({ value: s, label: DPR_FIELD_SCOPE_LABELS[s] }))} style={{ width: '100%' }} />
                    </Form.Item>
                  );
                },
              },
              {
                key: 'detail',
                title: 'Unit, range or choices',
                width: 240,
                render: (f) => {
                  const kind = rows[f.name]?.kind;
                  if (kind === 'NUMBER')
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                        <Form.Item name={[f.name, 'unit']} noStyle>
                          <Input aria-label={`Unit of field ${f.name + 1}`} maxLength={12} placeholder="Unit" />
                        </Form.Item>
                        <Form.Item name={[f.name, 'min']} noStyle>
                          <InputNumber aria-label={`Smallest value of field ${f.name + 1}`} placeholder="Min" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name={[f.name, 'max']} noStyle>
                          <InputNumber aria-label={`Largest value of field ${f.name + 1}`} placeholder="Max" style={{ width: '100%' }} />
                        </Form.Item>
                      </div>
                    );
                  if (kind === 'CHOICE')
                    return (
                      <Form.Item name={[f.name, 'options']} noStyle>
                        <Select mode="tags" aria-label={`Choices of field ${f.name + 1}`} tokenSeparators={[',']} placeholder="Day, Night" style={{ width: '100%' }} />
                      </Form.Item>
                    );
                  return <Typography.Text type="secondary">None</Typography.Text>;
                },
              },
              {
                key: 'required',
                title: 'Required',
                width: 90,
                render: (f) => (
                  <Form.Item name={[f.name, 'required']} noStyle valuePropName="checked">
                    <Checkbox aria-label={`Require field ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>

        {problems.length ? (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} title="Fix these to save" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>} />
        ) : null}

        <FormSection title="Preview" extra={<Segmented size="small" aria-label="Preview as" value={mode} onChange={(m) => setMode(m as PreviewMode)} options={[{ value: 'web', label: 'Web' }, { value: 'phone', label: 'Phone' }]} />}>
          <DprFormPreview def={next} mode={mode} locations={type.locations} progressFromDpr={progressFromDpr} />
        </FormSection>
      </Form>
    </FormShell>
  );
}

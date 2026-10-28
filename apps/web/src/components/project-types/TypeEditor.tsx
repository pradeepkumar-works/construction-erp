'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, Checkbox, Form, Input, InputNumber, Select, Switch, Typography } from 'antd';
import {
  CONTRACT_MODELS,
  CONTRACT_MODEL_LABELS,
  MAX_COMPONENT_COUNT,
  PROJECT_TYPE_LABELS,
  TYPE_BASES,
  WORK_LOCATIONS,
  WORK_LOCATION_LABELS,
  projectTypeProblems,
  type ComponentKindDto,
  type ContractModel,
  type ProjectType,
  type ProjectTypeDef,
  type ProjectTypeDto,
  type StartComponent,
  type WorkLocation,
} from '@erp/shared';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { useSaveProjectType } from '@/lib/queries';

interface Values {
  name: string;
  description?: string;
  baseType: ProjectType;
  locations: WorkLocation[];
  pipeNetwork: boolean;
  contractModel: ContractModel;
  kinds: string[];
  active: boolean;
  breakdown: (StartComponent & { weightPct?: number | null })[];
}

const hasPipes = (b: ProjectType | undefined) => b === 'WATER_SUPPLY' || b === 'SEWERAGE';

const breakdownOf = (rows: Values['breakdown'] | undefined): StartComponent[] =>
  (rows ?? []).filter(Boolean).map((b) => ({
    key: String(b.key ?? '').trim(),
    parentKey: b.parentKey || null,
    kind: b.kind,
    name: (b.name ?? '').trim(),
    count: b.parentKey ? 1 : (b.count ?? 1),
    specs: b.specs ?? null,
    weightPct: typeof b.weightPct === 'number' ? b.weightPct : null,
  }));

/** The next free outline number: 5 after 1 to 4, or 4.3 inside 4. */
const nextKey = (rows: Values['breakdown'] | undefined, parent?: string | null) => {
  const list = (rows ?? []).filter(Boolean);
  if (!parent) return String(list.filter((b) => !b.parentKey).reduce((m, b) => Math.max(m, Number(b.key) || 0), 0) + 1);
  const n = list.filter((b) => b.parentKey === parent).reduce((m, b) => Math.max(m, Number(String(b.key).split('.').pop()) || 0), 0);
  return `${parent}.${n + 1}`;
};

/**
 * Change a project type's details and starting breakdown (item 134): what it is built on, the places its work is
 * located by, the components a new project of it usually has and how many. Its loose activities are saved on their tab.
 */
export function TypeEditor({ type, kinds, open, onClose }: { type: ProjectTypeDto; kinds: ComponentKindDto[]; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useSaveProjectType();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      name: type.name,
      description: type.description,
      baseType: type.baseType,
      locations: type.locations,
      pipeNetwork: type.pipeNetwork,
      contractModel: type.contractModel,
      kinds: type.kinds,
      active: type.active,
      breakdown: type.breakdown.map((b) => ({ ...b })),
    });
  }, [open, type, form]);

  const watched = Form.useWatch([], form) as Partial<Values> | undefined;
  const baseType = watched?.baseType ?? type.baseType;
  const rows = watched?.breakdown;
  const def = useMemo<ProjectTypeDef | null>(
    () =>
      watched
        ? {
            code: type.code,
            name: (watched.name ?? '').trim(),
            baseType,
            description: watched.description ?? '',
            locations: watched.locations ?? [],
            pipeNetwork: !!watched.pipeNetwork && hasPipes(baseType),
            contractModel: watched.contractModel ?? type.contractModel,
            kinds: watched.kinds ?? [],
            breakdown: breakdownOf(watched.breakdown),
            activities: type.activities,
            active: watched.active ?? true,
          }
        : null,
    [watched, type, baseType],
  );
  const problems = def ? projectTypeProblems(def, kinds) : [];
  const usable = kinds.filter((k) => k.active || def?.kinds.includes(k.code) || def?.breakdown.some((b) => b.kind === k.code));
  const kindOptions = usable.map((k) => ({ value: k.code, label: k.active ? k.name : `${k.name} (archived)` }));
  const tops = (rows ?? []).filter((b) => b && !b.parentKey && b.key).map((b) => ({ value: String(b.key), label: `${b.key} ${b.name ?? ''}`.trim() }));

  return (
    <FormShell<Values>
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={1000}
      allValues
      title={`Edit ${type.name}`}
      okText="Save type"
      okDisabled={problems.length > 0}
      projectDefault={false}
      onSubmit={async (v) => {
        await save.mutateAsync({
          code: type.code,
          name: v.name.trim(),
          description: v.description?.trim() ?? '',
          baseType: v.baseType,
          locations: v.locations ?? [],
          pipeNetwork: !!v.pipeNetwork && hasPipes(v.baseType),
          contractModel: v.contractModel,
          kinds: v.kinds ?? [],
          breakdown: breakdownOf(v.breakdown),
          active: v.active,
        });
        message.success(`${v.name.trim()} saved. New projects take it; bring older ones up to it with Update projects.`);
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Type">
          <FormGrid cols={3}>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name, e.g. Bridge' }]}>
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="baseType" label="Built on" tooltip={type.projects ? 'Projects use this type, so this stays; make a new type instead.' : 'Sets the project code, the reports a project of it appears in, and the DPR form it starts with.'}>
              <Select disabled={type.projects > 0} options={TYPE_BASES.map((b) => ({ value: b, label: PROJECT_TYPE_LABELS[b] }))} />
            </Form.Item>
            <Form.Item name="active" label="In use" valuePropName="checked" tooltip="Archived, it is no longer offered in New project; its projects stay as they are.">
              <Switch />
            </Form.Item>
          </FormGrid>
          <Form.Item name="description" label="Description">
            <Input.TextArea maxLength={300} autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="locations" label="Work is located by" tooltip="What a DPR line and the sector view name: a chainage, a floor or a village.">
              <Checkbox.Group options={WORK_LOCATIONS.map((l) => ({ value: l, label: WORK_LOCATION_LABELS[l] }))} />
            </Form.Item>
            <Form.Item name="pipeNetwork" label="Pipe network" valuePropName="checked" tooltip={hasPipes(baseType) ? 'Zones and mains with their nodes and pipes, imported from the drawings.' : 'Only a water supply or sewerage type has one.'}>
              <Switch disabled={!hasPipes(baseType)} />
            </Form.Item>
            <Form.Item name="contractModel" label="Usual contract" tooltip="What New project fills in; the project can change it.">
              <Select options={CONTRACT_MODELS.map((m) => ({ value: m, label: CONTRACT_MODEL_LABELS[m] }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="kinds" label="Component kinds offered first" extra="When someone adds a component to a project of this type; the rest of the library follows.">
            <Select mode="multiple" allowClear showSearch={{ optionFilterProp: 'label' }} options={kindOptions} placeholder="Every kind in the library" />
          </Form.Item>
        </FormSection>
        <FormSection title="Starting breakdown">
          <Typography.Paragraph type="secondary">
            The components a new project of this type is offered, each laid out with its kind&apos;s activities. Copies number themselves (Overhead tank 1, 2…); a sub-component goes in every copy of its
            component. Weights are each copy&apos;s share, %; left empty they share what is left by BOQ value.
          </Typography.Paragraph>
          <LineTable
            name="breakdown"
            label="Component"
            addText="Add component"
            newLine={() => ({ key: nextKey(form.getFieldValue('breakdown') as Values['breakdown']), parentKey: null, kind: undefined, name: '', count: 1, weightPct: null })}
            columns={[
              {
                key: 'key',
                title: 'No.',
                width: 80,
                render: (f) => (
                  <Form.Item name={[f.name, 'key']} noStyle rules={[{ required: true, whitespace: true, message: 'Number it' }]}>
                    <Input aria-label="Outline number" maxLength={20} translate="no" />
                  </Form.Item>
                ),
              },
              {
                key: 'parentKey',
                title: 'Inside',
                width: 170,
                render: (f) => (
                  <Form.Item name={[f.name, 'parentKey']} noStyle>
                    <Select
                      aria-label="Inside component"
                      allowClear
                      placeholder="The project"
                      options={tops.filter((t) => t.value !== String(rows?.[f.name]?.key ?? ''))}
                      style={{ width: '100%' }}
                      onChange={(p?: string) => {
                        if (p) form.setFieldValue(['breakdown', f.name, 'count'], 1);
                        form.setFieldValue(['breakdown', f.name, 'key'], nextKey((form.getFieldValue('breakdown') as Values['breakdown']).filter((_, i) => i !== f.name), p));
                      }}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'kind',
                title: 'Kind',
                width: 200,
                render: (f) => (
                  <Form.Item name={[f.name, 'kind']} noStyle rules={[{ required: true, message: 'Choose its kind' }]}>
                    <Select
                      aria-label="Component kind"
                      showSearch={{ optionFilterProp: 'label' }}
                      options={kindOptions}
                      placeholder="Overhead tank"
                      style={{ width: '100%' }}
                      onChange={(k: string) => {
                        if (!form.getFieldValue(['breakdown', f.name, 'name'])) form.setFieldValue(['breakdown', f.name, 'name'], kinds.find((x) => x.code === k)?.name ?? '');
                      }}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'name',
                title: 'Name',
                render: (f) => (
                  <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, whitespace: true, message: 'Name it' }]}>
                    <Input aria-label="Component name" maxLength={120} />
                  </Form.Item>
                ),
              },
              {
                key: 'count',
                title: 'Copies',
                width: 90,
                render: (f) => (
                  <Form.Item name={[f.name, 'count']} noStyle>
                    <InputNumber aria-label="Usual number of copies" min={1} max={MAX_COMPONENT_COUNT} precision={0} disabled={!!rows?.[f.name]?.parentKey} style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
              {
                key: 'weight',
                title: 'Weight',
                width: 110,
                render: (f) => (
                  <Form.Item name={[f.name, 'weightPct']} noStyle>
                    <InputNumber aria-label="Weight of each copy" min={0} max={100} step={0.5} suffix="%" placeholder="Auto" style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
        {problems.length ? (
          <Alert type="warning" showIcon title="Fix these to save" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>} />
        ) : null}
      </Form>
    </FormShell>
  );
}

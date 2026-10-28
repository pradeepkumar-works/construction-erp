'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, Select } from 'antd';
import { useRouter } from 'next/navigation';
import { CODE_PATTERN, PROJECT_TYPE_LABELS, TYPE_BASES, WORK_ELEMENT_TYPES, WORK_ELEMENT_TYPE_LABELS, type ComponentKindDto, type ProjectType, type ProjectTypeDto, type WorkElementType } from '@erp/shared';
import { afterFormLeaves, FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, upper } from '@/components/form/inputs';
import { useCreateComponentKind, useCreateProjectType } from '@/lib/queries';

/** A code from a name: "Bridge works" → BRIDGE_WORKS. */
export const codeFrom = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^[^A-Z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 40);

const codeRules = [
  { required: true, message: 'Enter a code, e.g. BRIDGE' },
  { pattern: CODE_PATTERN, message: 'Use 2 to 40 capital letters, digits or _, starting with a letter' },
];

/** The code box follows the name until someone types in it ("A form fills a box it filled itself"). */
function useCodeFromName(form: { getFieldValue: (name: 'code') => unknown; setFieldValue: (name: 'code', value: string) => void }, open: boolean) {
  const filled = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    if (open) filled.current = undefined;
  }, [open]);
  return (changed: { name?: string }) => {
    if (changed.name === undefined) return;
    const code = form.getFieldValue('code') as string | undefined;
    if (code && code !== filled.current) return;
    filled.current = codeFrom(changed.name ?? '');
    form.setFieldValue('code', filled.current);
  };
}

interface NewTypeValues {
  name: string;
  code: string;
  baseType: ProjectType;
  copyFrom?: string;
  description?: string;
}

/** A new project type of the company's own: built on a built-in kind, empty or a copy of another type. */
export function NewTypeForm({ open, onClose, types }: { open: boolean; onClose: () => void; types: ProjectTypeDto[] }) {
  const [form] = Form.useForm<NewTypeValues>();
  const { message } = App.useApp();
  const router = useRouter();
  const create = useCreateProjectType();
  const onName = useCodeFromName(form, open);
  const copyFrom = Form.useWatch('copyFrom', form);
  return (
    <FormShell<NewTypeValues>
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      title="New project type"
      okText="Make type"
      projectDefault={false}
      draftKey="project-type:new"
      onSubmit={async (v) => {
        const t = await create.mutateAsync({ ...v, name: v.name.trim(), copyFrom: v.copyFrom || undefined });
        message.success(`${t.name} is made. Add its components and activities.`);
        // The form leaves its own history entry first; then the new type's page opens.
        afterFormLeaves(() => router.push(`/project-types/${t.code}`));
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ baseType: 'OTHER' }}
        onValuesChange={(changed: Partial<NewTypeValues>) => {
          onName(changed);
          if (changed.copyFrom) {
            const from = types.find((t) => t.code === changed.copyFrom);
            if (from) form.setFieldValue('baseType', from.baseType);
          }
        }}
      >
        <Form.Item name="copyFrom" label="Start from" extra="A copy takes the type's components, activities and settings; you change them after.">
          <Select
            allowClear
            placeholder="An empty type"
            showSearch={{ optionFilterProp: 'label' }}
            options={types.map((t) => ({ value: t.code, label: t.name }))}
          />
        </Form.Item>
        <FormGrid>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name, e.g. Bridge' }]}>
            <Input maxLength={80} placeholder="Bridge" />
          </Form.Item>
          <Form.Item name="code" label="Code" rules={codeRules} normalize={upper} extra="Fixed once made">
            <Input {...CODE_INPUT} maxLength={40} placeholder="BRIDGE" />
          </Form.Item>
        </FormGrid>
        <Form.Item
          name="baseType"
          label="Built on"
          rules={[{ required: true, message: 'Choose what the type is built on' }]}
          extra="Sets the project code, the reports a project of it appears in, and which DPR form it uses for now."
        >
          <Select disabled={!!copyFrom} showSearch={{ optionFilterProp: 'label' }} options={TYPE_BASES.map((b) => ({ value: b, label: PROJECT_TYPE_LABELS[b] }))} />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea maxLength={300} autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Road bridges and culverts, piled foundations" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface NewKindValues {
  name: string;
  code: string;
  elementType: WorkElementType;
  copyFrom?: string;
}

/** A new component kind: a copy of one (its specs and steps), or one built on a built-in kind's starting steps. */
export function NewKindForm({ open, onClose, kinds, onMade }: { open: boolean; onClose: () => void; kinds: ComponentKindDto[]; onMade: (code: string) => void }) {
  const [form] = Form.useForm<NewKindValues>();
  const { message } = App.useApp();
  const create = useCreateComponentKind();
  const onName = useCodeFromName(form, open);
  const copyFrom = Form.useWatch('copyFrom', form);
  return (
    <FormShell<NewKindValues>
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      title="New component kind"
      okText="Make kind"
      projectDefault={false}
      draftKey="component-kind:new"
      onSubmit={async (v) => {
        await create.mutateAsync({ ...v, name: v.name.trim(), copyFrom: v.copyFrom || undefined });
        message.success(`${v.name.trim()} is made. Set its specs and steps.`);
        onMade(v.code);
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ elementType: 'GENERAL' }}
        onValuesChange={(changed: Partial<NewKindValues>) => {
          onName(changed);
          if (changed.copyFrom) {
            const from = kinds.find((k) => k.code === changed.copyFrom);
            if (from) form.setFieldValue('elementType', from.elementType);
          }
        }}
      >
        <Form.Item name="copyFrom" label="Start from" extra="A copy takes the kind's specs and steps; you change them after.">
          <Select allowClear placeholder="The steps of what it is built on" showSearch={{ optionFilterProp: 'label' }} options={kinds.map((k) => ({ value: k.code, label: k.name }))} />
        </Form.Item>
        <FormGrid>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name, e.g. Bridge pier' }]}>
            <Input maxLength={80} placeholder="Bridge pier" />
          </Form.Item>
          <Form.Item name="code" label="Code" rules={codeRules} normalize={upper} extra="Fixed once made">
            <Input {...CODE_INPUT} maxLength={40} placeholder="BRIDGE_PIER" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="elementType" label="Built on" rules={[{ required: true, message: 'Choose what the kind is built on' }]} extra="Where its components show in reports and stock checks.">
          <Select disabled={!!copyFrom} showSearch={{ optionFilterProp: 'label' }} options={WORK_ELEMENT_TYPES.map((t) => ({ value: t, label: WORK_ELEMENT_TYPE_LABELS[t] }))} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

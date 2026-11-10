'use client';

import React from 'react';
import { Form, Input, Radio, Select, TimePicker, Typography } from 'antd';
import type { FormItemProps } from 'antd';
import dayjs from 'dayjs';
import { CUSTOM_FIELD_ENTITY_INFO, MAX_OWN_TEXT, readCustomValues, type CustomFieldDto, type CustomFieldEntity, type FieldValues } from '@erp/shared';
import { DatePicker } from '@/components/common/DatePicker';
import { FormGrid, FormSection } from '@/components/form/FormShell';
import { useCustomFields } from '@/lib/queries';
import { customValueText } from './values';

type Rule = NonNullable<FormItemProps['rules']>[number];

/** The field read the way the API reads it, so the form says what the API would: "Turnover: enter a number of 0 or more". */
const ruleFor = (f: CustomFieldDto, required: boolean): Rule => ({
  validator: async (_: unknown, v: unknown) => {
    const { problems } = readCustomValues([f], { [f.key]: v }, { required });
    if (problems.length) throw new Error(problems[0]);
  },
});

/** Dates and times are kept as text (YYYY-MM-DD, HH:MM), as the API keeps them. */
const valueProps = (f: CustomFieldDto): Partial<FormItemProps> =>
  f.kind === 'DATE'
    ? { getValueProps: (v?: string) => ({ value: v ? dayjs(v) : undefined }), normalize: (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : undefined) }
    : f.kind === 'TIME'
      ? { getValueProps: (v?: string) => ({ value: v ? dayjs(v, 'HH:mm') : undefined }), normalize: (d?: dayjs.Dayjs | null) => (d ? d.format('HH:mm') : undefined) }
      : {};

function FieldInput({ field: f, ...rest }: { field: CustomFieldDto; value?: unknown; onChange?: (v: unknown) => void; id?: string }) {
  switch (f.kind) {
    case 'LONG_TEXT':
      return <Input.TextArea rows={2} maxLength={MAX_OWN_TEXT} {...(rest as object)} />;
    case 'NUMBER':
      // Text, not a number box: a typed letter is kept so the field can say how to fix it.
      return <Input inputMode="decimal" suffix={f.unit ?? undefined} {...(rest as object)} />;
    case 'YES_NO':
      return (
        <Radio.Group
          optionType="button"
          options={[
            { value: true, label: 'Yes' },
            { value: false, label: 'No' },
          ]}
          {...(rest as object)}
        />
      );
    case 'CHOICE':
      return <Select allowClear placeholder="Choose" options={f.options.map((o) => ({ value: o, label: o }))} {...(rest as object)} />;
    case 'DATE':
      return <DatePicker style={{ width: '100%' }} {...(rest as object)} />;
    case 'TIME':
      return <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} {...(rest as object)} />;
    default:
      return <Input maxLength={200} {...(rest as object)} />;
  }
}

/**
 * The company's own fields on a form, under `customValues` (ARCHITECTURE "Custom fields"): one item per active field,
 * checked as the API checks it. An archived field the record holds a value for is shown, read only. Nothing when the
 * company has no fields for the entity.
 */
export function CustomFieldsFormSection({ entity, stored, title = 'More details' }: { entity: CustomFieldEntity; stored?: FieldValues | null; title?: string }) {
  const { data } = useCustomFields(entity);
  const active = (data ?? []).filter((d) => !d.archived);
  const kept = (data ?? []).filter((d) => d.archived && stored?.[d.key] !== undefined);
  if (!active.length && !kept.length) return null;
  const atSubmit = CUSTOM_FIELD_ENTITY_INFO[entity].requiredAtSubmit;
  return (
    <FormSection title={title}>
      <FormGrid cols={2}>
        {active.map((f) => (
          <Form.Item
            key={f.key}
            name={['customValues', f.key]}
            label={f.label}
            required={f.required && !atSubmit}
            extra={f.required && atSubmit ? 'Needed before it goes for approval' : undefined}
            rules={[ruleFor(f, f.required && !atSubmit)]}
            {...valueProps(f)}
          >
            <FieldInput field={f} />
          </Form.Item>
        ))}
        {kept.map((f) => (
          <Form.Item key={f.key} label={f.label} extra="Archived: kept on this record, no longer asked for">
            <Typography.Text translate="no">{customValueText(f, stored?.[f.key])}</Typography.Text>
          </Form.Item>
        ))}
      </FormGrid>
    </FormSection>
  );
}

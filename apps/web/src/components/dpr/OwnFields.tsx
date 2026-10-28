'use client';

import React from 'react';
import { Form, Input, InputNumber, Radio, Select, TimePicker } from 'antd';
import type { FormItemProps } from 'antd';
import dayjs from 'dayjs';
import { MAX_OWN_TEXT, ownFieldLabel, type DprExtra, type DprOwnField } from '@erp/shared';
import { DatePicker } from '@/components/common/DatePicker';

type Rule = NonNullable<FormItemProps['rules']>[number];

const rangeText = (f: DprOwnField) => {
  const u = f.unit ? ` ${f.unit}` : '';
  if (f.min !== null && f.max !== null) return `from ${f.min} to ${f.max}${u}`;
  if (f.min !== null) return `of ${f.min}${u} or more`;
  if (f.max !== null) return `up to ${f.max}${u}`;
  return '';
};

/** The rules of a field of the company's own (item 134 part 2), as the API checks them; `required` only when it is. */
export function ownFieldRules(f: DprOwnField): Rule[] {
  const rules: Rule[] = [];
  if (f.required) rules.push({ required: true, message: `${f.kind === 'YES_NO' || f.kind === 'CHOICE' ? 'Choose' : 'Fill in'} ${f.label}` });
  if (f.kind === 'NUMBER' && (f.min !== null || f.max !== null))
    rules.push({ type: 'number', ...(f.min !== null ? { min: f.min } : {}), ...(f.max !== null ? { max: f.max } : {}), message: `Enter a number ${rangeText(f)}` });
  return rules;
}

/** The value props of a date or time field, which the form keeps as text (YYYY-MM-DD, HH:MM) like the API. */
const valueProps = (f: DprOwnField): Partial<FormItemProps> =>
  f.kind === 'DATE'
    ? { getValueProps: (v?: string) => ({ value: v ? dayjs(v) : undefined }), normalize: (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : undefined) }
    : f.kind === 'TIME'
      ? { getValueProps: (v?: string) => ({ value: v ? dayjs(v, 'HH:mm') : undefined }), normalize: (d?: dayjs.Dayjs | null) => (d ? d.format('HH:mm') : undefined) }
      : {};

/** The input of one field by its kind. */
export function OwnFieldInput({ field: f, ...rest }: { field: DprOwnField; value?: unknown; onChange?: (v: unknown) => void; id?: string; 'aria-label'?: string; disabled?: boolean }) {
  switch (f.kind) {
    case 'LONG_TEXT':
      return <Input.TextArea rows={2} maxLength={MAX_OWN_TEXT} {...(rest as object)} />;
    case 'NUMBER':
      return <InputNumber min={f.min ?? undefined} max={f.max ?? undefined} suffix={f.unit ?? undefined} inputMode="decimal" style={{ width: '100%' }} {...(rest as object)} />;
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
 * The fields of the company's own as form items, under `path` (['extra'] for the day, ['lines', 2, 'extra'] for a
 * line). Labels in English on the web.
 */
export function OwnFieldItems({ fields, path, disabled }: { fields: DprOwnField[]; path: (string | number)[]; disabled?: boolean }) {
  return (
    <>
      {fields.map((f) => (
        <Form.Item key={f.key} name={[...path, f.key]} label={ownFieldLabel(f)} rules={ownFieldRules(f)} {...valueProps(f)}>
          <OwnFieldInput field={f} disabled={disabled} />
        </Form.Item>
      ))}
    </>
  );
}

/** Own-field values as the form keeps them, for the API: blank ones left out. */
export const extraBody = (v: Record<string, unknown> | undefined): DprExtra =>
  Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => x !== undefined && x !== null && x !== '')) as DprExtra;

'use client';

import React from 'react';
import { Form } from 'antd';
import type { FormItemProps } from 'antd';
import { ownFieldLabel, type DprExtra, type DprOwnField } from '@erp/shared';
import { FieldInput, fieldValueProps } from '@/components/custom-fields/FieldInput';

type Rule = NonNullable<FormItemProps['rules']>[number];

const rangeText = (f: DprOwnField) => {
  const u = f.unit ? ` ${f.unit}` : '';
  if (f.min !== null && f.max !== null) return `from ${f.min} to ${f.max}${u}`;
  if (f.min !== null) return `of ${f.min}${u} or more`;
  if (f.max !== null) return `up to ${f.max}${u}`;
  return '';
};

/** The rules of a field of the company's own, as the API checks them; `required` only when it is. */
export function ownFieldRules(f: DprOwnField): Rule[] {
  const rules: Rule[] = [];
  if (f.required) rules.push({ required: true, message: `${f.kind === 'YES_NO' || f.kind === 'CHOICE' ? 'Choose' : 'Fill in'} ${f.label}` });
  if (f.kind === 'NUMBER' && (f.min !== null || f.max !== null))
    rules.push({ type: 'number', ...(f.min !== null ? { min: f.min } : {}), ...(f.max !== null ? { max: f.max } : {}), message: `Enter a number ${rangeText(f)}` });
  return rules;
}

/**
 * The fields of the company's own as form items, under `path` (['extra'] for the day, ['lines', 2, 'extra'] for a
 * line). Labels in English on the web.
 */
export function OwnFieldItems({ fields, path, disabled }: { fields: DprOwnField[]; path: (string | number)[]; disabled?: boolean }) {
  return (
    <>
      {fields.map((f) => (
        <Form.Item key={f.key} name={[...path, f.key]} label={ownFieldLabel(f)} rules={ownFieldRules(f)} {...fieldValueProps(f)}>
          <FieldInput field={f} disabled={disabled} />
        </Form.Item>
      ))}
    </>
  );
}

/** Own-field values as the form keeps them, for the API: blank ones left out. */
export const extraBody = (v: Record<string, unknown> | undefined): DprExtra =>
  Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => x !== undefined && x !== null && x !== '')) as DprExtra;

'use client';

import React from 'react';
import { Form, Typography } from 'antd';
import type { FormItemProps } from 'antd';
import { CUSTOM_FIELD_ENTITY_INFO, readCustomValues, type CustomFieldDto, type CustomFieldEntity, type FieldValues } from '@erp/shared';
import { FormGrid, FormSection } from '@/components/form/FormShell';
import { useCustomFields } from '@/lib/queries';
import { FieldInput, fieldValueProps } from './FieldInput';
import { customValueText } from './values';

type Rule = NonNullable<FormItemProps['rules']>[number];

/** The field read the way the API reads it, so the form says what the API would: "Turnover: enter a number of 0 or more". */
const ruleFor = (f: CustomFieldDto, required: boolean): Rule => ({
  validator: async (_: unknown, v: unknown) => {
    const { problems } = readCustomValues([f], { [f.key]: v }, { required });
    if (problems.length) throw new Error(problems[0]);
  },
});

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
            {...fieldValueProps(f)}
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

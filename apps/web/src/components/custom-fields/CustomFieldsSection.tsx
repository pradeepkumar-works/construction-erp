'use client';

import React from 'react';
import { Descriptions } from 'antd';
import { filledCustomValues, type CustomFieldDto, type CustomFieldEntity, type FieldValues } from '@erp/shared';
import { Section } from '@/components/common/Section';
import type { RecordSection } from '@/components/record/RecordFrame';
import { useCustomFields } from '@/lib/queries';
import { customValueText } from './values';

const TITLE = 'More details';

function Values({ filled, oneColumn }: { filled: { field: CustomFieldDto; value: FieldValues[string] }[]; oneColumn?: boolean }) {
  return (
    <Descriptions
      size="small"
      column={oneColumn ? 1 : { xs: 1, sm: 2 }}
      items={filled.map(({ field, value }) => ({
        key: field.key,
        label: field.archived ? `${field.label} (archived)` : field.label,
        children: <span translate="no">{customValueText(field, value)}</span>,
      }))}
    />
  );
}

/**
 * A record's values of the company's own fields, in the company's order (ARCHITECTURE "Custom fields"); an archived
 * field's value stays, marked. Nothing when the record holds none.
 */
export function CustomFieldsSection({ entity, values, oneColumn, style }: { entity: CustomFieldEntity; values: FieldValues | null | undefined; oneColumn?: boolean; style?: React.CSSProperties }) {
  const { data } = useCustomFields(entity);
  const filled = filledCustomValues(data ?? [], values);
  if (!filled.length) return null;
  return (
    <Section title={TITLE} style={style}>
      <Values filled={filled} oneColumn={oneColumn} />
    </Section>
  );
}

/** The same values as one of a record's sections (`RecordFrame`), or none when the record holds none. */
export function useCustomFieldsRecordSection(entity: CustomFieldEntity, values: FieldValues | null | undefined): RecordSection[] {
  const { data } = useCustomFields(entity);
  const filled = filledCustomValues(data ?? [], values);
  return filled.length ? [{ key: 'custom-fields', title: TITLE, children: <Values filled={filled} /> }] : [];
}

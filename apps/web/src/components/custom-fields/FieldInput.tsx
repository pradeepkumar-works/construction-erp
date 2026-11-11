'use client';

import React from 'react';
import { Input, InputNumber, Radio, Select, TimePicker } from 'antd';
import type { FormItemProps } from 'antd';
import dayjs from 'dayjs';
import { MAX_OWN_TEXT, type OwnField } from '@erp/shared';
import { DatePicker } from '@/components/common/DatePicker';

/**
 * The value props of a date or time field, which the form keeps as text (YYYY-MM-DD, HH:MM) as the API does. Shared by
 * the DPR's own fields and the company's fields on vendors, projects and orders.
 */
export const fieldValueProps = (f: Pick<OwnField, 'kind'>): Partial<FormItemProps> =>
  f.kind === 'DATE'
    ? { getValueProps: (v?: string) => ({ value: v ? dayjs(v) : undefined }), normalize: (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : undefined) }
    : f.kind === 'TIME'
      ? { getValueProps: (v?: string) => ({ value: v ? dayjs(v, 'HH:mm') : undefined }), normalize: (d?: dayjs.Dayjs | null) => (d ? d.format('HH:mm') : undefined) }
      : {};

/** The input of one field of the company's own, by its kind (the DPR's own fields and the company's alike). */
export function FieldInput({ field: f, ...rest }: { field: OwnField; value?: unknown; onChange?: (v: unknown) => void; id?: string; 'aria-label'?: string; disabled?: boolean }) {
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

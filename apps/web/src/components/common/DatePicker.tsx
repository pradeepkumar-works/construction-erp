'use client';

import React from 'react';
import { DatePicker as AntDatePicker } from 'antd';
import type { DatePickerProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';

/**
 * How a typed date is read (finding 4 of the October review): shown as "13 Oct 2026", and typed any common way:
 * 13/10/2026, 13-10-2026, 13.10.2026, 13 Oct 26 or 2026-10-13. Without these a date typed another way was dropped
 * when the field lost focus, with nothing said.
 */
export const DATE_FORMATS = ['DD MMM YYYY', 'D MMM YYYY', 'DD/MM/YYYY', 'D/M/YYYY', 'DD-MM-YYYY', 'D-M-YYYY', 'DD.MM.YYYY', 'D.M.YYYY', 'YYYY-MM-DD', 'DD MMM YY', 'DD/MM/YY', 'D/M/YY'];

/** Only a plain date takes the formats; a month, week or date-and-time picker keeps its own. */
const plain = (p: { picker?: string; showTime?: unknown }) => (!p.picker || p.picker === 'date') && !p.showTime;

function RangePicker(props: RangePickerProps) {
  return <AntDatePicker.RangePicker {...(plain(props) && !props.format ? { format: DATE_FORMATS } : {})} {...props} />;
}

/** antd's DatePicker, reading the dates people type (`DATE_FORMATS`). Every date field uses this one. */
function DatePickerBase(props: DatePickerProps) {
  return <AntDatePicker {...(plain(props) && !props.format ? { format: DATE_FORMATS } : {})} {...props} />;
}

// Typed as antd's own, so its overloads (multiple, picker) and generics stay as they are.
export const DatePicker = Object.assign(DatePickerBase, { RangePicker }) as unknown as typeof AntDatePicker;

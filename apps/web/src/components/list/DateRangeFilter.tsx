'use client';

import React, { useMemo } from 'react';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { rangePresets } from '@/lib/dates';

/** The list's `from`/`to` filter as one range picker, with the usual presets (this month, financial years…). */
export function DateRangeFilter({ from, to, onChange, placeholder = ['From', 'To'] }: { from?: string; to?: string; onChange: (from?: string, to?: string) => void; placeholder?: [string, string] }) {
  // The same objects while the dates stay the same, so a re-render of the list does not reset the open picker.
  const value = useMemo<[dayjs.Dayjs | null, dayjs.Dayjs | null]>(() => [from ? dayjs(from) : null, to ? dayjs(to) : null], [from, to]);
  return (
    <DatePicker.RangePicker
      allowEmpty={[true, true]}
      presets={rangePresets()}
      placeholder={placeholder}
      value={value}
      onChange={(v) => onChange(v?.[0]?.format('YYYY-MM-DD'), v?.[1]?.format('YYYY-MM-DD'))}
      style={{ width: 260 }}
      aria-label="Dates"
    />
  );
}

'use client';

import React from 'react';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';

/** The list's `from`/`to` filter as one range picker. */
export function DateRangeFilter({ from, to, onChange, placeholder = ['From', 'To'] }: { from?: string; to?: string; onChange: (from?: string, to?: string) => void; placeholder?: [string, string] }) {
  return (
    <DatePicker.RangePicker
      allowEmpty={[true, true]}
      placeholder={placeholder}
      format="D MMM YYYY"
      value={[from ? dayjs(from) : null, to ? dayjs(to) : null]}
      onChange={(v) => onChange(v?.[0]?.format('YYYY-MM-DD'), v?.[1]?.format('YYYY-MM-DD'))}
      style={{ width: 260 }}
      aria-label="Dates"
    />
  );
}

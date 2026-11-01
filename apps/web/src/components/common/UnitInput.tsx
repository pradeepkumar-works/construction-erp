'use client';

import React from 'react';
import { AutoComplete } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { COMMON_UNITS } from '@erp/shared';
import { useUnits } from '@/lib/queries';

const matches = (input: string, opt?: { value?: unknown; name?: string }) => {
  const q = input.trim().toLowerCase();
  return String(opt?.value ?? '').toLowerCase().includes(q) || (opt?.name ?? '').toLowerCase().includes(q);
};

/**
 * Unit field for any quantity: suggests the company's unit master so "Cum" is written the same way every
 * time, and still takes a unit that is not in the list.
 */
export function UnitInput(props: Omit<AutoCompleteProps, 'options' | 'showSearch'>) {
  const { data } = useUnits();
  const options = data
    ? data.filter((u) => u.isActive).map((u) => ({ value: u.code, name: u.name, label: u.name === u.code ? u.code : `${u.code} · ${u.name}` }))
    : COMMON_UNITS.map((u) => ({ value: u, name: u, label: u }));
  return <AutoComplete placeholder="Unit" popupMatchSelectWidth={220} {...props} options={options} showSearch={{ filterOption: matches }} />;
}

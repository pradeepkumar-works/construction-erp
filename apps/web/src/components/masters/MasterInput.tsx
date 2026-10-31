'use client';

import React from 'react';
import { AutoComplete } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { MASTER_LIST_DEFS, type MasterList } from '@erp/shared';
import { useMasterList } from '@/lib/queries';

const matches = (input: string, opt?: { value?: unknown }) => String(opt?.value ?? '').toLowerCase().includes(input.trim().toLowerCase());

/**
 * A field whose words come from one of the company's masters: suggests the entries switched on, so a trade or a
 * category is written the same way every time, and still takes a word that is not in the list (as `UnitInput` does).
 */
export function MasterInput({ list, ...props }: Omit<AutoCompleteProps, 'options' | 'showSearch'> & { list: MasterList }) {
  const { data } = useMasterList(MASTER_LIST_DEFS[list].slug);
  const names = data ? data.entries.filter((e) => e.isActive).map((e) => e.name) : MASTER_LIST_DEFS[list].standard.map((s) => s.name);
  return <AutoComplete popupMatchSelectWidth={260} {...props} options={names.map((n) => ({ value: n }))} showSearch={{ filterOption: matches }} />;
}

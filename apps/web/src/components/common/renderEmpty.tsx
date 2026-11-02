'use client';

import React from 'react';
import type { ConfigProviderProps } from 'antd';
import { tk } from '@/ds';
import { EmptyLine } from '@/components/common/EmptyArt';

/** Pickers whose list came up empty: a line of text in the dropdown, no picture. */
const PICKERS = new Set(['Select', 'TreeSelect', 'Cascader', 'Transfer', 'Mentions', 'AutoComplete']);

export const renderEmpty: NonNullable<ConfigProviderProps['renderEmpty']> = (componentName) =>
  componentName && PICKERS.has(componentName) ? (
    <div style={{ padding: `${tk.space[2]} ${tk.space[1]}`, textAlign: 'center', color: tk.color.text.muted }}>Nothing found</div>
  ) : (
    <EmptyLine title="Nothing here yet" />
  );

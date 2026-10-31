'use client';

import React from 'react';
import type { ConfigProviderProps } from 'antd';
import { EmptyLine } from '@/components/common/EmptyArt';

/** Pickers whose list came up empty: a line of text in the dropdown, no picture. */
const PICKERS = new Set(['Select', 'TreeSelect', 'Cascader', 'Transfer', 'Mentions', 'AutoComplete']);

export const renderEmpty: NonNullable<ConfigProviderProps['renderEmpty']> = (componentName) =>
  componentName && PICKERS.has(componentName) ? (
    <div style={{ padding: '8px 4px', textAlign: 'center', color: 'var(--ant-color-text-secondary)' }}>Nothing found</div>
  ) : (
    <EmptyLine title="Nothing here yet" />
  );

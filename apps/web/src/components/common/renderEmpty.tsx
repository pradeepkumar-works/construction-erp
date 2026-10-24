'use client';

import React from 'react';
import type { ConfigProviderProps } from 'antd';
import { EmptyArt } from '@/components/common/EmptyArt';

/** Pickers whose list came up empty: a line of text in the dropdown, no picture. */
const PICKERS = new Set(['Select', 'TreeSelect', 'Cascader', 'Transfer', 'Mentions', 'AutoComplete']);

/**
 * What an antd component shows when it has nothing and the page gave it no words of its own (both root `ConfigProvider`s):
 * a table or list gets the brand's small empty illustration, a picker a quiet line. A page that knows why it is empty still
 * says so through `locale.emptyText` or `DataTable`'s `empty`.
 */
export const renderEmpty: NonNullable<ConfigProviderProps['renderEmpty']> = (componentName) =>
  componentName && PICKERS.has(componentName) ? (
    <div style={{ padding: '8px 4px', textAlign: 'center', color: 'var(--ant-color-text-secondary)' }}>Nothing found</div>
  ) : (
    <EmptyArt art="entries" size="small" title="Nothing here yet" />
  );

'use client';

import React from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd';
import { useProjects } from '@/lib/queries';

export function ProjectSelect(props: SelectProps<string>) {
  const { data, isLoading } = useProjects();
  return (
    <Select<string>
      showSearch
      allowClear
      optionFilterProp="label"
      placeholder="All projects"
      loading={isLoading}
      options={(data ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
      style={{ minWidth: 260 }}
      {...props}
    />
  );
}

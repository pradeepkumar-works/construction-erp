'use client';

import React from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd';
import { useProjects } from '@/lib/queries';

/** `exclude` leaves one project out (the one being copied into). */
export function ProjectSelect({ exclude, ...props }: SelectProps<string> & { exclude?: string }) {
  const { data, isLoading } = useProjects();
  return (
    <Select<string>
      showSearch={{ optionFilterProp: 'label' }}
      allowClear
      placeholder="All projects"
      loading={isLoading}
      options={(data ?? []).filter((p) => p.id !== exclude).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
      style={{ minWidth: 260 }}
      aria-label="Project"
      {...props}
    />
  );
}

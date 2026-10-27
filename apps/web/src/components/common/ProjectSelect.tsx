'use client';

import React from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd';
import { useProjects } from '@/lib/queries';

/** The projects the signed-in person works on, as picker options. */
function useProjectOptions(exclude?: string) {
  const { data, isLoading } = useProjects();
  return { isLoading, options: (data ?? []).filter((p) => p.id !== exclude).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })) };
}

/** `exclude` leaves one project out (the one being copied into). */
export function ProjectSelect({ exclude, ...props }: SelectProps<string> & { exclude?: string }) {
  const { options, isLoading } = useProjectOptions(exclude);
  return (
    <Select<string>
      showSearch={{ optionFilterProp: 'label' }}
      allowClear
      placeholder="All projects"
      loading={isLoading}
      options={options}
      style={{ minWidth: 260 }}
      aria-label="Project"
      {...props}
    />
  );
}

/** Several projects at once: the teams a new user joins (finding 17 of the October review). */
export function ProjectMultiSelect(props: SelectProps<string[]>) {
  const { options, isLoading } = useProjectOptions();
  return (
    <Select<string[]>
      mode="multiple"
      showSearch={{ optionFilterProp: 'label' }}
      allowClear
      placeholder="Type a project code or name"
      loading={isLoading}
      options={options}
      style={{ width: '100%' }}
      aria-label="Projects"
      {...props}
    />
  );
}

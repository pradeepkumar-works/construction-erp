'use client';

import React from 'react';
import { Select } from 'antd';
import { ProjectOutlined } from '@/components/common/icons';
import { useProjects } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';

const ALL = '';

/** The header's project context: All projects or one, applied to every list's project filter and remembered. */
export function ProjectSwitcher({ width }: { width: number }) {
  const { data, isLoading } = useProjects();
  const [projectId, setProjectId] = useProjectScope();
  return (
    <Select<string>
      aria-label="Project"
      variant="filled"
      prefix={<ProjectOutlined />}
      value={projectId ?? ALL}
      onChange={(v) => setProjectId(v || undefined)}
      loading={isLoading}
      showSearch={{ optionFilterProp: 'label' }}
      popupMatchSelectWidth={360}
      style={{ width }}
      options={[{ value: ALL, label: 'All projects' }, ...(data ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))]}
    />
  );
}

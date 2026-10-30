'use client';

import React, { useMemo } from 'react';
import { Select } from 'antd';
import { byVertical, inVertical, isGuest, NO_VERTICAL } from '@erp/shared';
import { ProjectOutlined } from '@/components/common/icons';
import { useAuth } from '@/lib/auth';
import { useMasterList, useProjects } from '@/lib/queries';
import { useProjectScope, useVerticalScope } from '@/lib/project-scope';

const ALL = '';
const V = 'v:';

/**
 * The header's project context: All projects or one, applied to every list's project filter and remembered. Where the
 * company files its projects by vertical (item 167), the projects are grouped by vertical and a whole vertical can be
 * chosen, which narrows the projects offered here, the Projects list and the management dashboard and reports.
 */
export function ProjectSwitcher({ width }: { width: number }) {
  const { user } = useAuth();
  const { data, isLoading } = useProjects();
  const [projectId, setProjectId] = useProjectScope();
  const [vertical, setVertical] = useVerticalScope();
  const usesVerticals = !!data?.some((p) => p.verticalCode);
  const { data: master } = useMasterList('vertical', false, usesVerticals && !!user && !isGuest(user.roleKey));

  const options = useMemo(() => {
    const projects = data ?? [];
    const item = (p: (typeof projects)[number]) => ({ value: p.id, label: `${p.code} - ${p.name}` });
    if (!usesVerticals) return [{ value: ALL, label: 'All projects' }, ...projects.map(item)];
    const groups = byVertical(projects, (p) => p.verticalCode, master?.entries ?? []);
    return [
      {
        label: 'Verticals',
        title: 'Verticals',
        options: [{ value: ALL, label: 'All projects' }, ...groups.map((g) => ({ value: V + (g.code ?? NO_VERTICAL), label: g.code ? `${g.name}: all projects` : 'Projects with no vertical' }))],
      },
      ...groups.filter((g) => inVertical(g.code, vertical)).map((g) => ({ label: g.name, title: g.name, options: g.rows.map(item) })),
    ];
  }, [data, master, usesVerticals, vertical]);

  const choose = (v: string) => {
    if (v === ALL) {
      setVertical(undefined);
      setProjectId(undefined);
    } else if (v.startsWith(V)) {
      setVertical(v.slice(V.length));
      setProjectId(undefined);
    } else setProjectId(v);
  };
  const value = projectId ?? (usesVerticals && vertical ? V + vertical : ALL);
  return (
    <Select<string>
      aria-label="Project"
      variant="filled"
      prefix={<ProjectOutlined />}
      value={value}
      onChange={choose}
      loading={isLoading}
      showSearch={{ optionFilterProp: 'label' }}
      popupMatchSelectWidth={360}
      style={{ width }}
      options={options}
    />
  );
}

'use client';

import React, { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Flex, Select } from 'antd';
import { tk } from '@/ds';
import { useProject, useProjects } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { EmptyArt } from '@/components/common/EmptyArt';
import { PipeNetworkPanel } from '@/components/pipes/PipeNetworkPanel';

/**
 * Pipeline layout, in Drawings: a water project's pipelines as drawn in Google Earth (KMZ or KML), by the design office
 * (EPANET) or in a sheet, uploaded through Import network and shown as pipes, valves and chainages. The same panel as the
 * project's Pipe network tab, so a pipeline comes in only through its one import.
 */
export function PipelineLayoutPage() {
  const [scoped, setScoped] = useProjectScope(useSearchParams().get('projectId') ?? undefined);
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const piped = useMemo(() => (projects ?? []).filter((p) => p.pipeNetwork), [projects]);
  // The header's project only where it has pipelines; else the one water project there is.
  const projectId = piped.some((p) => p.id === scoped) ? scoped : piped.length === 1 ? piped[0].id : undefined;
  const { data: project, isLoading, error, refetch } = useProject(projectId);

  return (
    <div className="page-container">
      <PageHeader title="Pipeline layout" subtitle="Upload a pipeline drawn in Google Earth (KMZ or KML), an EPANET file or an Excel sheet, and see its pipes, valves and chainages." />
      <Flex gap={tk.space[3]} wrap align="center" style={{ marginBottom: tk.space[4] }}>
        <Select<string>
          showSearch={{ optionFilterProp: 'label' }}
          allowClear
          loading={loadingProjects}
          aria-label="Water project"
          placeholder="Choose a water project"
          value={projectId}
          onChange={(v) => setScoped(v)}
          options={piped.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
          style={{ minWidth: 260, maxWidth: '100%' }}
        />
      </Flex>
      {!projectId ? (
        <Card size="small">
          <EmptyArt art="entries" title={loadingProjects || piped.length ? 'Choose a water project to upload its pipeline' : 'No project here has pipelines'}>
            {loadingProjects || piped.length ? null : 'Pipelines are kept on water supply projects. A project of another type has no pipe network.'}
          </EmptyArt>
        </Card>
      ) : isLoading ? (
        <PageSkeleton shape="list" header={false} />
      ) : error || !project ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Card size="small">
          <PipeNetworkPanel project={project} />
        </Card>
      )}
    </div>
  );
}

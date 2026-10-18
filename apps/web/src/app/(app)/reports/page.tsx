'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Select } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { useProjectScope } from '@/lib/project-scope';
import { useProjects } from '@/lib/queries';
import { ProgressReportView } from '@/components/reports/ProgressReportView';
import { PageSkeleton } from '@/components/common/QueryState';

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <PageSkeleton />
        </div>
      }
    >
      <Reports />
    </Suspense>
  );
}

function Reports() {
  const params = useSearchParams();
  const { data: projects } = useProjects();
  // The header's project (a link's ?projectId= switches it), else the first: the same project as every list (UX item 84).
  const [scope, setProjectId] = useProjectScope(params.get('projectId') ?? undefined);
  const projectId = scope ?? projects?.[0]?.id;

  return (
    <div className="page-container">
      <PageHeader title="Progress Reports" subtitle="Weekly and monthly progress report from approved data, ready to print or save as PDF." />
      <ProgressReportView
        projectId={projectId}
        picker={
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            style={{ width: 340 }}
            placeholder="Project"
            aria-label="Project"
            value={projectId}
            onChange={setProjectId}
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
          />
        }
      />
    </div>
  );
}

'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Select, Skeleton } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { useProjectScope } from '@/lib/project-scope';
import { useProjects } from '@/lib/queries';
import { ProgressReportView } from '@/components/reports/ProgressReportView';

export default function ReportsPage() {
  return (
    <Suspense fallback={<Skeleton active />}>
      <Reports />
    </Suspense>
  );
}

function Reports() {
  const params = useSearchParams();
  const { data: projects } = useProjects();
  const [scope] = useProjectScope();
  const [projectId, setProjectId] = useState<string | undefined>(params.get('projectId') ?? undefined);

  useEffect(() => {
    // The project chosen in the header, else the first.
    if (!projectId && projects?.length) setProjectId(scope ?? projects[0].id);
  }, [projects, projectId, scope]);

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
            value={projectId}
            onChange={setProjectId}
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
          />
        }
      />
    </div>
  );
}

'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Segmented, Select } from 'antd';
import type { OfficialReportKind } from '@erp/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { useProjectScope } from '@/lib/project-scope';
import { useProjects } from '@/lib/queries';
import { ProgressReportView } from '@/components/reports/ProgressReportView';
import { OfficialReportView } from '@/components/reports/official/OfficialReportView';
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

type Choice = OfficialReportKind | 'CUSTOM';
const CHOICES: { value: Choice; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly (MPR)' },
  { value: 'CUSTOM', label: 'Custom dates' },
];

function Reports() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: projects } = useProjects();
  // The header's project (a link's ?projectId= switches it), else the first: the same project as every list.
  const [scope, setProjectId] = useProjectScope(params.get('projectId') ?? undefined);
  const projectId = scope ?? projects?.find((p) => p.type !== 'STORE' && p.type !== 'PLANT')?.id ?? projects?.[0]?.id;
  // The report is in the address (?report=weekly), so a link opens the same one.
  const asked = (params.get('report') ?? 'weekly').toUpperCase();
  const choice: Choice = (CHOICES.some((c) => c.value === asked) ? asked : 'WEEKLY') as Choice;
  const choose = (c: Choice) => {
    const next = new URLSearchParams(params.toString());
    next.set('report', c.toLowerCase());
    router.replace(`/reports?${next.toString()}`, { scroll: false });
  };

  const picker = (
    <Select
      showSearch={{ optionFilterProp: 'label' }}
      style={{ width: 320, maxWidth: '100%' }}
      placeholder="Project"
      aria-label="Project"
      value={projectId}
      onChange={setProjectId}
      options={(projects ?? []).filter((p) => p.type !== 'STORE' && p.type !== 'PLANT').map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
    />
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Progress reports"
        subtitle="Daily, weekly and monthly reports for the client in your company’s name, as PDF, Word or Excel, numbered and kept as issued."
        extra={<Segmented aria-label="Report" value={choice} onChange={(v) => choose(v as Choice)} options={CHOICES} />}
      />
      {choice === 'CUSTOM' ? (
        <ProgressReportView projectId={projectId} picker={picker} only="CUSTOM" />
      ) : (
        <OfficialReportView key={choice} projectId={projectId} kind={choice} picker={picker} />
      )}
    </div>
  );
}

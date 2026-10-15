'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { RiskList } from '@/components/risks/RiskList';

function RisksPage() {
  const search = useSearchParams();
  // A "delay / risk raised" notification links here with ?id=...
  const id = search.get('id') ?? undefined;
  const projectId = search.get('projectId') ?? undefined;
  return (
    <div className="page-container">
      <PageHeader title="Delays & Risks" subtitle="What has held up work (days lost, who caused it, extension of time) and what might, scored probability × impact, with owners and due dates." />
      <Card size="small">
        <RiskList key={`${id ?? ''}|${projectId ?? ''}`} initialOpenId={id} initialProject={projectId} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RisksPage />
    </Suspense>
  );
}

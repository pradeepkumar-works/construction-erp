'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { SafetyPanel, type SafetyTab } from '@/components/safety/SafetyPanel';

function SafetyPage() {
  const search = useSearchParams();
  // A safety notification links here with ?tab=...&id=...
  const tab = (search.get('tab') as SafetyTab | null) ?? undefined;
  const id = search.get('id') ?? undefined;
  return (
    <div className="page-container">
      <PageHeader title="Safety" subtitle="Incidents and near misses with their root cause and corrective action, toolbox talks, and permits to work for risky jobs." />
      <Card size="small">
        <SafetyPanel key={`${tab ?? ''}|${id ?? ''}`} initialTab={tab} initialId={id} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SafetyPage />
    </Suspense>
  );
}

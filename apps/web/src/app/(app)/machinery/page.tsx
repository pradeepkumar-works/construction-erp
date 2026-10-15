'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { MachineryPanel, type MachineryTab } from '@/components/machinery/MachineryPanel';

function MachineryPage() {
  const search = useSearchParams();
  // A machinery notification links here with ?tab=...&id=...
  const tab = (search.get('tab') as MachineryTab | null) ?? undefined;
  const id = search.get('id') ?? undefined;
  return (
    <div className="page-container">
      <PageHeader title="Machinery" subtitle="Daily hours, idle time, breakdowns and diesel per machine; job cards, service schedule, vehicle papers and drivers; and the equipment master." />
      <Card size="small">
        <MachineryPanel key={`${tab ?? ''}|${id ?? ''}`} initialTab={tab} initialId={id} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MachineryPage />
    </Suspense>
  );
}

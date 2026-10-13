'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { StockActions, StockPanel } from '@/components/stock/StockPanel';

function StockPage() {
  const search = useSearchParams();
  // A low-stock notification links here with ?projectId=...&low=1
  const projectId = search.get('projectId') ?? undefined;
  const low = search.get('low') === '1';
  return (
    <div className="page-container">
      <PageHeader title="Stock" subtitle="Material received against approved requests, issued at site, and the balance per project." extra={<StockActions />} />
      <Card className="table-card" size="small">
        <StockPanel key={`${projectId ?? ''}|${low}`} initialLow={low} initialProject={projectId} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StockPage />
    </Suspense>
  );
}

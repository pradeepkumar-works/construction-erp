'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { MrList } from '@/components/material/MrList';

function MaterialRequestsPage() {
  const search = useSearchParams();
  return (
    <div className="page-container">
      <PageHeader title="Material Requests" subtitle="Material indents raised from site, with vendor quotations and the purchase orders raised on them" />
      <Card className="table-card" size="small">
        <MrList newLabel="New material request" openId={search.get('id')} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MaterialRequestsPage />
    </Suspense>
  );
}

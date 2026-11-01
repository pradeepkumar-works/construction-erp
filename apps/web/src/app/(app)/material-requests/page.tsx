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
      <PageHeader title="Indents" subtitle="Indents raised from site, with vendor quotations and the purchase orders made on them" />
      <Card size="small">
        <MrList newLabel="New indent" openId={search.get('id')} />
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

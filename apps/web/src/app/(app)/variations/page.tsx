'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { navNode } from '@erp/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { VariationsPanel } from '@/components/variations/VariationsPanel';

function VariationsPage() {
  const search = useSearchParams();
  return (
    <div className="page-container">
      <PageHeader title="Variations" subtitle={navNode('billing.variations')?.description} />
      <Card size="small">
        <VariationsPanel openId={search.get('id')} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VariationsPage />
    </Suspense>
  );
}

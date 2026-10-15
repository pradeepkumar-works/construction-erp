'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { WorkOrderList } from '@/components/subcontracts/WorkOrderList';

function WorkOrdersPage() {
  const search = useSearchParams();
  return (
    <div className="page-container">
      <PageHeader title="Work Orders" subtitle="Work given to subcontractors at agreed rates, with the retention, advance and TDS terms their bills follow." />
      <Card size="small">
        <WorkOrderList openId={search.get('id')} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WorkOrdersPage />
    </Suspense>
  );
}

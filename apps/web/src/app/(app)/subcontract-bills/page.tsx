'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { SubBillList } from '@/components/subcontracts/SubBillList';

function SubcontractBillsPage() {
  const search = useSearchParams();
  return (
    <div className="page-container">
      <PageHeader title="Subcontractor Bills" subtitle="Running bills on work orders: work as measured, less retention, advance, TDS and material issued to them." />
      <Card size="small">
        <SubBillList openId={search.get('id')} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SubcontractBillsPage />
    </Suspense>
  );
}

'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { BillList } from '@/components/bills/BillList';

function BillsPage() {
  const search = useSearchParams();
  return (
    <div className="page-container">
      <PageHeader title="RA Bills" subtitle="Running-account bills from the approved measurements, with GST and the contract deductions, through approval, the client's certificate and payment." />
      <Card size="small">
        <BillList openId={search.get('id')} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BillsPage />
    </Suspense>
  );
}

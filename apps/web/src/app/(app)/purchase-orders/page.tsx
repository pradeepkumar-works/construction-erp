'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { PurchaseOrderList } from '@/components/purchasing/PurchaseOrderList';

function PurchaseOrdersPage() {
  const search = useSearchParams();
  return (
    <div className="page-container">
      <PageHeader title="Purchase Orders" subtitle="Orders on vendors from approved material requests and their quotations, through approval, receipt at site (GRN) and the vendor's bill." />
      <Card className="table-card" size="small">
        <PurchaseOrderList openId={search.get('id')} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PurchaseOrdersPage />
    </Suspense>
  );
}

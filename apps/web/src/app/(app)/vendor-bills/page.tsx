'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { VendorBillList } from '@/components/purchasing/VendorBillList';

function VendorBillsPage() {
  const search = useSearchParams();
  return (
    <div className="page-container">
      <PageHeader title="Vendor Bills" subtitle="Suppliers' invoices matched against the purchase order and what was received, with the due date (45 days at most for micro and small enterprises)." />
      <Card className="table-card" size="small">
        <VendorBillList openId={search.get('id')} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VendorBillsPage />
    </Suspense>
  );
}

'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { PageHeader } from '@/components/common/PageHeader';
import { PurchaseOrderList } from '@/components/purchasing/PurchaseOrderList';
import { ProcurementStatusPanel } from '@/components/purchasing/ProcurementStatusPanel';

function PurchaseOrdersPage() {
  const search = useSearchParams();
  const router = useRouter();
  const tab = search.get('tab') === 'status' ? 'status' : 'orders';
  return (
    <div className="page-container">
      <PageHeader title="Purchase orders" subtitle="Orders on vendors from approved indents and their quotations, through approval, receipt at site (GRN) and the vendor's bill." />
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => router.replace(k === 'status' ? '/purchase-orders?tab=status' : '/purchase-orders')}
          variant="page"
          destroyOnHidden
          items={[
            { key: 'orders', label: 'Purchase orders', children: <PurchaseOrderList openId={search.get('id')} /> },
            { key: 'status', label: 'Delivery status', children: <ProcurementStatusPanel /> },
          ]}
        />
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

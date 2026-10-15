'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Tabs } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { PurchaseOrderList } from '@/components/purchasing/PurchaseOrderList';
import { ProcurementStatusPanel } from '@/components/purchasing/ProcurementStatusPanel';

function PurchaseOrdersPage() {
  const search = useSearchParams();
  const router = useRouter();
  const tab = search.get('tab') === 'status' ? 'status' : 'orders';
  return (
    <div className="page-container">
      <PageHeader title="Purchase Orders" subtitle="Orders on vendors from approved material requests and their quotations, through approval, receipt at site (GRN) and the vendor's bill." />
      <Card size="small">
        <Tabs
          activeKey={tab}
          onChange={(k) => router.replace(k === 'status' ? '/purchase-orders?tab=status' : '/purchase-orders')}
          tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
          destroyOnHidden
          items={[
            { key: 'orders', label: 'Orders', children: <PurchaseOrderList openId={search.get('id')} /> },
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

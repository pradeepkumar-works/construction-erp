'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { canRecordVendorBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useWaitingReceipts } from '@/lib/queries';
import { AppTabs } from '@/components/common/AppTabs';
import { PageHeader } from '@/components/common/PageHeader';
import { VendorBillList } from '@/components/purchasing/VendorBillList';
import { WaitingReceipts } from '@/components/stock/WaitingReceipts';

function VendorBillsPage() {
  const search = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  // Received, not billed: accounts' queue of goods received against an order with no supplier bill yet.
  const recorder = !!user && canRecordVendorBill(user.roleKey);
  const { data: unbilled } = useWaitingReceipts('BILL', { pageSize: 1 }, recorder);
  const tab = recorder && search.get('tab') === 'to-bill' ? 'to-bill' : 'bills';
  return (
    <div className="page-container">
      <PageHeader title="Vendor bills" subtitle="Suppliers' invoices matched against the purchase order and what was received, machine hire from the logs, workshop and other service bills, with the due date (45 days at most for micro and small enterprises)." />
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => router.replace(k === 'to-bill' ? '/vendor-bills?tab=to-bill' : '/vendor-bills', { scroll: false })}
          variant="page"
          destroyOnHidden
          items={[
            { key: 'bills', label: 'Vendor bills', children: <VendorBillList openId={search.get('id')} /> },
            ...(recorder ? [{ key: 'to-bill', label: 'Received, not billed', count: unbilled?.total, countLabel: 'waiting for a bill', attention: true, children: <WaitingReceipts waiting="BILL" /> }] : []),
          ]}
        />
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

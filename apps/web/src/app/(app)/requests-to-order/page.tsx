'use client';

import React, { Suspense } from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { RequestsToOrderList } from '@/components/purchasing/RequestsToOrderList';

/** Purchases › Requests to order: purchase's own list of approved material requests to buy. */
function RequestsToOrderPage() {
  return (
    <div className="page-container">
      <PageHeader title="Requests to order" subtitle="Approved indents with something still to buy, by the day they are needed. Open one to send the enquiry, record quotations, finalise L1 and make the purchase order." />
      <Card size="small">
        <RequestsToOrderList />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RequestsToOrderPage />
    </Suspense>
  );
}

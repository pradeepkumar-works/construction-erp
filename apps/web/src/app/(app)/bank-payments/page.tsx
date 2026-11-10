'use client';

import React, { Suspense } from 'react';
import { Card } from 'antd';
import { canRecordPayment } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { NoAccess } from '@/components/common/NoAccess';
import { PaymentBatches } from '@/components/payables/PaymentBatches';

function BankPaymentsPage() {
  const { user } = useAuth();
  if (user && !canRecordPayment(user.roleKey))
    return (
      <div className="page-container">
        <PageHeader title="Bank payments" />
        <NoAccess title="Bank payments are made by accounts" />
      </div>
    );
  return (
    <div className="page-container">
      <PageHeader
        title="Bank payments"
        help="Approved payment requests paid in one upload to the bank. Make bank file writes the file in your bank's layout and records each payment; import the bank's UTRs to give every payment its reference, which the bank book then matches."
      />
      <Card size="small">
        <PaymentBatches />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BankPaymentsPage />
    </Suspense>
  );
}

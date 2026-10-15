'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { CompliancePanel } from '@/components/compliance/CompliancePanel';

function CompliancePage() {
  // An expiry notification links here with ?id=...
  const id = useSearchParams().get('id') ?? undefined;
  return (
    <div className="page-container">
      <PageHeader title="Guarantees & Licences" subtitle="Bank guarantees, EMDs, insurance policies and licences, soonest expiry first. Accounts and admins are reminded 30 days before each expires." />
      <Card className="table-card" size="small">
        <CompliancePanel key={id ?? ''} initialId={id} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CompliancePage />
    </Suspense>
  );
}

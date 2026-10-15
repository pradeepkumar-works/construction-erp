'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { ImprestPanel } from '@/components/imprest/ImprestPanel';

function ImprestPage() {
  // A top-up notification links here with ?id=...
  const id = useSearchParams().get('id') ?? undefined;
  return (
    <div className="page-container">
      <PageHeader title="Site Imprest" subtitle="Petty cash floats held at the sites: the cash in hand after each holder's cash expenses, and top-ups to bring it back to the float." />
      <Card className="table-card" size="small">
        <ImprestPanel key={id ?? ''} initialId={id} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ImprestPage />
    </Suspense>
  );
}

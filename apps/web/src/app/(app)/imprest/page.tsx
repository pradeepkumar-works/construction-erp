'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { canRequestFunds, canViewPaymentRequests } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { ImprestPanel } from '@/components/imprest/ImprestPanel';
import { PaymentRequestList } from '@/components/payables/PaymentRequestList';

function ImprestPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  // A top-up notification links here with ?id=...
  const id = params.get('id') ?? undefined;
  // Fund requests: a site asks head office for money, released into its imprest or paid to a party.
  const funds = !!user && (canRequestFunds(user.roleKey) || canViewPaymentRequests(user.roleKey));
  const tab = funds && params.get('tab') === 'funds' ? 'funds' : 'imprests';
  const setTab = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete('id');
    if (key === 'funds') next.set('tab', 'funds');
    else next.delete('tab');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };
  const panel = <ImprestPanel key={id ?? ''} initialId={id} />;
  return (
    <div className="page-container">
      <PageHeader title="Site imprest" subtitle="Petty cash floats held at the sites: the cash in hand after each holder's cash expenses, top-ups to bring it back to the float, and the sites' requests for funds." />
      <Card size="small">
        {funds ? (
          <AppTabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: 'imprests', label: 'Imprests', children: panel },
              { key: 'funds', label: 'Fund requests', children: <PaymentRequestList fund /> },
            ]}
          />
        ) : (
          panel
        )}
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

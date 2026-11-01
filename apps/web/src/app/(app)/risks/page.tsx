'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { canViewContract, navNode } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { RiskList } from '@/components/risks/RiskList';
import { LdExposureTable } from '@/components/contracts/LdExposure';

function RisksPage() {
  const search = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  // A "delay / risk raised" notification links here with ?id=...
  const id = search.get('id') ?? undefined;
  const projectId = search.get('projectId') ?? undefined;
  const register = <RiskList key={`${id ?? ''}|${projectId ?? ''}`} initialOpenId={id} initialProject={projectId} />;
  const seesLd = !!user && canViewContract(user.roleKey);
  return (
    <div className="page-container">
      <PageHeader title="Delays and risks" subtitle={navNode('site.risks')?.description} />
      <Card size="small">
        {seesLd ? (
          <AppTabs
            activeKey={search.get('tab') === 'ld' ? 'ld' : 'register'}
            onChange={(k) => router.replace(k === 'ld' ? '/risks?tab=ld' : '/risks')}
            variant="page"
            destroyOnHidden
            items={[
              { key: 'register', label: 'Register', children: register },
              { key: 'ld', label: 'Liquidated damages', children: <LdExposureTable /> },
            ]}
          />
        ) : (
          register
        )}
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RisksPage />
    </Suspense>
  );
}

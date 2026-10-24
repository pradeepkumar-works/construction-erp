'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, Result } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { canManageBiometric } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { Punches } from '@/components/biometric/Punches';
import { DeviceUsers } from '@/components/biometric/DeviceUsers';
import { Devices } from '@/components/biometric/Devices';

const TABS = ['punches', 'users', 'devices'] as const;

function BiometricPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const raw = search.get('tab');
  const tab = TABS.find((t) => t === raw) ?? 'punches';
  if (user && !canManageBiometric(user.roleKey))
    return (
      <div className="page-container">
        <PageHeader title="Biometric devices" />
        <Result status="403" title="Only HR, management or an admin manage the biometric devices" />
      </div>
    );
  return (
    <div className="page-container">
      <PageHeader title="Biometric devices" subtitle="Fingerprint and face devices, the people enrolled on them, and their punches turned into attendance." />
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
          variant="page"
          destroyOnHidden
          items={[
            { key: 'punches', label: 'Punches', children: <Punches /> },
            { key: 'users', label: 'People on devices', children: <DeviceUsers /> },
            { key: 'devices', label: 'Devices', children: <Devices /> },
          ]}
        />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BiometricPage />
    </Suspense>
  );
}

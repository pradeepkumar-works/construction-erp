'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, Result } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { canManageIntegrations } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { ResultMark } from '@/components/common/ResultMark';
import { Connections } from '@/components/integrations/Connections';
import { Connectors } from '@/components/integrations/Connectors';
import { Devices } from '@/components/integrations/Devices';
import { EventLog } from '@/components/integrations/EventLog';

const TABS = ['connections', 'connectors', 'devices', 'log'] as const;

function ConnectionsPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const raw = search.get('tab');
  const tab = TABS.find((t) => t === raw) ?? 'connections';
  if (user && !canManageIntegrations(user.roleKey))
    return (
      <div className="page-container">
        <PageHeader title="Connections" />
        <Result icon={<ResultMark kind="no-access" />} title="Only an admin or management manage the connections" />
      </div>
    );
  return (
    <div className="page-container">
      <PageHeader title="Connections" subtitle="Outside systems joined to the company: web addresses for their services, Connectors on site computers, the devices they report on and the log." />
      <Card size="small">
        <AppTabs
          activeKey={tab}
          onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
          variant="page"
          destroyOnHidden
          items={[
            { key: 'connections', label: 'Connections', children: <Connections /> },
            { key: 'connectors', label: 'Connectors', children: <Connectors /> },
            { key: 'devices', label: 'Devices', children: <Devices /> },
            { key: 'log', label: 'Log', children: <EventLog /> },
          ]}
        />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConnectionsPage />
    </Suspense>
  );
}

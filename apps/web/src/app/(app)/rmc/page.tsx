'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, Result } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { canBillRmc, canSellRmc, canViewRmc } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { usePlantBatches, useRmcPlants } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { DayView } from '@/components/rmc/DayView';
import { Orders } from '@/components/rmc/Orders';
import { Batches } from '@/components/rmc/Batches';
import { Batcher } from '@/components/rmc/Batcher';
import { usePlantScope } from '@/components/rmc/rmcUi';
import { MixDesigns } from '@/components/rmc/MixDesigns';
import { Bills } from '@/components/rmc/Bills';
import { ResultMark } from '@/components/common/ResultMark';

const TABS = ['day', 'orders', 'batcher', 'batches', 'designs', 'bills'] as const;

function RmcPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const allowed = !!user && canViewRmc(user.roleKey);
  const { data: plants, isLoading } = useRmcPlants(allowed);
  const sees = !!user && (canSellRmc(user.roleKey) || canBillRmc(user.roleKey));
  const [plantId] = usePlantScope();
  const { data: board } = usePlantBatches(plantId, allowed && !!plants?.length);
  const raw = search.get('tab');
  const tab = TABS.find((t) => t === raw && (t !== 'bills' || sees)) ?? 'day';
  return (
    <div className="page-container">
      <PageHeader title="RMC plant" subtitle="Ready-mix concrete: the plant's day, quotes and orders, trucks and their challans, mix designs approved by quality, and bills with GST." />
      {!allowed ? (
        <Result icon={<ResultMark kind="no-access" />} title="Your role does not see RMC" />
      ) : !isLoading && !plants?.length ? (
        <Result status="info" title="No RMC plant yet" subTitle="Add a project of type RMC plant (Projects, New project); its store, materials and staff work as at any site. You see the plants you are a member of." />
      ) : (
        <Card size="small">
          <AppTabs
            activeKey={tab}
            onChange={(k) => router.replace(`${pathname}?tab=${k}`, { scroll: false })}
            variant="page"
            destroyOnHidden
            items={[
              { key: 'day', label: 'The day at the plant', children: <DayView /> },
              { key: 'orders', label: 'Quotes and orders', children: <Orders /> },
              {
                key: 'batcher',
                label: 'From the batcher',
                count: board?.controllers.length ? board.waiting.length : null,
                countLabel: 'batches waiting for a challan',
                attention: !!board?.late,
                children: <Batcher />,
              },
              { key: 'batches', label: 'Challans', children: <Batches /> },
              { key: 'designs', label: 'Mix designs', children: <MixDesigns /> },
              ...(sees ? [{ key: 'bills', label: 'Bills and money received', children: <Bills /> }] : []),
            ]}
          />
        </Card>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RmcPage />
    </Suspense>
  );
}

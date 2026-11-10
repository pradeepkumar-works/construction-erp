'use client';

import React, { Suspense } from 'react';
import { Card } from 'antd';
import { canManageFixedAssets } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useUrlTab } from '@/lib/url-state';
import { PageHeader } from '@/components/common/PageHeader';
import { AppTabs } from '@/components/common/AppTabs';
import { NoAccess } from '@/components/common/NoAccess';
import { AssetRegister } from '@/components/fixed-assets/AssetRegister';
import { IncomeTaxBlocks, RunsList } from '@/components/fixed-assets/RunsAndTax';

const TABS = ['register', 'runs', 'tax'] as const;
type Tab = (typeof TABS)[number];

function FixedAssetsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useUrlTab<Tab>(TABS, 'register', { param: 'tab' });
  if (user && !canManageFixedAssets(user.roleKey))
    return (
      <div className="page-container">
        <PageHeader title="Fixed assets" />
        <NoAccess title="The fixed asset register is kept by accounts" />
      </div>
    );
  return (
    <div className="page-container">
      <PageHeader
        title="Fixed assets"
        help="What the company owns for use over years: its cost, the depreciation charged each month or year under Schedule II, and its book value. Depreciation goes to the books, never to a project's cost."
      />
      <Card size="small">
        <AppTabs
          variant="page"
          activeKey={tab}
          onChange={(k) => setTab(k as Tab)}
          items={[
            { key: 'register', label: 'Register', children: <AssetRegister /> },
            { key: 'runs', label: 'Depreciation runs', children: <RunsList /> },
            { key: 'tax', label: 'Income Tax', children: <IncomeTaxBlocks /> },
          ]}
        />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FixedAssetsPage />
    </Suspense>
  );
}

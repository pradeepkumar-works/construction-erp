'use client';

import React from 'react';
import { Card, Result } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { canViewCost } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useUrlTab } from '@/lib/url-state';
import { PageHeader } from '@/components/common/PageHeader';
import { CostOverview } from '@/components/cost/CostOverview';
import { CashFlowPanel } from '@/components/cost/CashFlowPanel';
import { ResultMark } from '@/components/common/ResultMark';

const TABS = ['cost', 'cash-flow'] as const;

export default function Page() {
  const { user } = useAuth();
  // The open tab is `?tab=` in the URL, so Reports' Cash flow tile and a reload open the right one.
  const [tab, setTab] = useUrlTab<(typeof TABS)[number]>(TABS, 'cost', { param: 'tab' });
  if (user && !canViewCost(user.roleKey)) return <Result icon={<ResultMark kind="no-access" />} title="Project cost is for approvers and accounts" />;
  return (
    <div className="page-container">
      <PageHeader title="Project cost" subtitle="Cost against the work done, and the money expected in and out over the coming months." />
      <Card size="small">
        <AppTabs
          variant="page"
          activeKey={tab}
          onChange={(k) => setTab(k as (typeof TABS)[number])}
          items={[
            { key: 'cost', label: 'Project cost', children: <CostOverview /> },
            { key: 'cash-flow', label: 'Cash flow', children: <CashFlowPanel /> },
          ]}
        />
      </Card>
    </div>
  );
}

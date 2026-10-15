'use client';

import React from 'react';
import { Card, Result, Tabs } from 'antd';
import { canViewCost } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { CostOverview } from '@/components/cost/CostOverview';
import { CashFlowPanel } from '@/components/cost/CashFlowPanel';

export default function Page() {
  const { user } = useAuth();
  if (user && !canViewCost(user.roleKey)) return <Result status="403" title="Project cost is for approvers and accounts" />;
  return (
    <div className="page-container">
      <PageHeader title="Project Cost" subtitle="Cost against the value of work executed, and the cash expected in and out over the coming months." />
      <Card size="small">
        <Tabs
          style={{ padding: '0 12px' }}
          items={[
            { key: 'cost', label: 'Cost', children: <CostOverview /> },
            { key: 'cash-flow', label: 'Cash flow', children: <CashFlowPanel /> },
          ]}
        />
      </Card>
    </div>
  );
}

'use client';

import React from 'react';
import { Card, Result } from 'antd';
import { canViewCost } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { CostOverview } from '@/components/cost/CostOverview';

export default function Page() {
  const { user } = useAuth();
  if (user && !canViewCost(user.roleKey)) return <Result status="403" title="Project cost is for approvers and accounts" />;
  return (
    <div className="page-container">
      <PageHeader title="Project Cost" subtitle="Expenses, material, machinery, labour and subcontractors against the value of work executed." />
      <Card className="table-card" size="small">
        <CostOverview />
      </Card>
    </div>
  );
}

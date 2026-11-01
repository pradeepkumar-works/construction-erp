'use client';

import React from 'react';
import { Card } from 'antd';
import { navNode } from '@erp/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { DprList } from '@/components/dpr/DprList';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Daily reports" subtitle={navNode('site.dpr')?.description} />
      <Card size="small">
        <DprList newLabel="New daily report" />
      </Card>
    </div>
  );
}

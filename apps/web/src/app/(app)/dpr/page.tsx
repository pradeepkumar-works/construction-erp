'use client';

import React from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { DprList } from '@/components/dpr/DprList';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Daily Progress Reports" subtitle="Site diary: manpower, machinery, work executed, safety and issues" />
      <Card size="small">
        <DprList newLabel="New DPR" />
      </Card>
    </div>
  );
}

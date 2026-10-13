'use client';

import React from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { MachineryPanel } from '@/components/machinery/MachineryPanel';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Machinery" subtitle="Daily hours, idle time, breakdowns and diesel per machine, approved by the PM, and the equipment master." />
      <Card className="table-card" size="small">
        <MachineryPanel />
      </Card>
    </div>
  );
}

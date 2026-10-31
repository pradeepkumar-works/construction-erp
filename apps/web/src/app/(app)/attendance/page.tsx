'use client';

import React from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { AttendancePanel } from '@/components/workers/AttendancePanel';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Labour attendance" subtitle="Daily head count by contractor and trade, which fills the manpower of that day's DPR, and the named worker register with its roll call and muster." />
      <Card size="small">
        <AttendancePanel />
      </Card>
    </div>
  );
}

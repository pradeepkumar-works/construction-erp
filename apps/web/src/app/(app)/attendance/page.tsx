'use client';

import React from 'react';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { AttendanceList } from '@/components/attendance/AttendanceList';

export default function Page() {
  return (
    <div className="page-container">
      <PageHeader title="Attendance" subtitle="Daily head count by contractor and trade. It fills the manpower of that day's DPR." />
      <Card className="table-card" size="small">
        <AttendanceList />
      </Card>
    </div>
  );
}

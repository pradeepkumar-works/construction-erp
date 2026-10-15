'use client';

import React, { useState } from 'react';
import { Tabs } from 'antd';
import { canViewWorkers } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { AttendanceList } from '@/components/attendance/AttendanceList';
import { RollCallPanel } from './RollCallPanel';
import { WorkerList } from './WorkerList';
import { MusterPanel } from './MusterPanel';

export type AttendanceTab = 'headcount' | 'rollcall' | 'workers' | 'muster';

/**
 * Attendance page and project tab: the daily head count, and for those who keep it the named worker register with its
 * roll call, muster and output per man-day (v4 item 44).
 */
export function AttendancePanel({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<AttendanceTab>('headcount');
  if (!user || !canViewWorkers(user.roleKey)) return <AttendanceList projectId={projectId} />;
  return (
    <Tabs
      className="attendance-tabs"
      activeKey={tab}
      onChange={(k) => setTab(k as AttendanceTab)}
      tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
      items={[
        { key: 'headcount', label: 'Head count', children: <AttendanceList projectId={projectId} /> },
        { key: 'rollcall', label: 'Roll call', children: <RollCallPanel projectId={projectId} /> },
        { key: 'workers', label: 'Workers', children: <WorkerList projectId={projectId} /> },
        { key: 'muster', label: 'Muster & output', children: <MusterPanel projectId={projectId} /> },
      ]}
    />
  );
}

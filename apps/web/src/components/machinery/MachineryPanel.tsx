'use client';

import React, { useState } from 'react';
import { Tabs } from 'antd';
import { MachineryList } from './MachineryList';
import { EquipmentTable } from './EquipmentTable';

/** Daily logs and the equipment master, for one project (project tab) or the whole fleet (Machinery page). */
export function MachineryPanel({ projectId }: { projectId?: string }) {
  const [tab, setTab] = useState('logs');
  return (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
      items={[
        { key: 'logs', label: 'Daily logs', children: <MachineryList projectId={projectId} /> },
        { key: 'equipment', label: projectId ? 'Equipment here' : 'Equipment', children: <EquipmentTable projectId={projectId} /> },
      ]}
    />
  );
}

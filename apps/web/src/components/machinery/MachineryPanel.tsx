'use client';

import React from 'react';
import { Tabs } from 'antd';
import { useMaintenanceSummary } from '@/lib/queries';
import { MachineryList } from './MachineryList';
import { EquipmentTable } from './EquipmentTable';
import { MaintenancePanel } from '@/components/maintenance/MaintenancePanel';
import { PapersPanel } from '@/components/maintenance/PapersPanel';
import { useUrlTab } from '@/lib/url-state';

const FLEET_TABS = ['logs', 'maintenance', 'papers', 'equipment'] as const;
// Papers and drivers belong to the fleet, not to a project.
const PROJECT_TABS = ['logs', 'maintenance', 'equipment'] as const;
export type MachineryTab = (typeof FLEET_TABS)[number];

/**
 * Daily logs, maintenance, papers and drivers, and the equipment master, for one project (project tab) or the whole
 * fleet (Machinery page). Papers and drivers belong to the fleet, so a project shows only its maintenance. The open tab
 * is `?sub=` in the URL (UX item 84).
 */
export function MachineryPanel({ projectId, initialTab, initialId }: { projectId?: string; initialTab?: MachineryTab; initialId?: string }) {
  const [tab, setTab] = useUrlTab<MachineryTab>(projectId ? PROJECT_TABS : FLEET_TABS, 'logs', { initial: initialTab });
  const { data: s } = useMaintenanceSummary(projectId);
  const due = s ? s.documentsDue.length + s.licencesDue.length : 0;
  return (
    <Tabs
      activeKey={tab}
      onChange={(k) => setTab(k as MachineryTab)}
      tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
      items={[
        { key: 'logs', label: 'Daily logs', children: <MachineryList projectId={projectId} /> },
        {
          key: 'maintenance',
          label: `Maintenance${s && s.openBreakdowns ? ` (${s.openBreakdowns} down)` : ''}`,
          children: <MaintenancePanel projectId={projectId} initialOpenId={initialTab === 'maintenance' ? initialId : undefined} />,
        },
        ...(projectId ? [] : [{ key: 'papers', label: `Papers & drivers${due ? ` (${due} due)` : ''}`, children: <PapersPanel /> }]),
        { key: 'equipment', label: projectId ? 'Equipment here' : 'Equipment', children: <EquipmentTable projectId={projectId} /> },
      ]}
    />
  );
}

'use client';

import React, { useState } from 'react';
import { Badge, Tabs } from 'antd';
import { useQualitySummary } from '@/lib/queries';
import { InspectionList } from '@/components/inspections/InspectionList';
import { ChecklistsPanel } from '@/components/inspections/ChecklistsPanel';
import { TestList } from './TestList';
import { NcrList } from './NcrList';
import { NcrDrawer } from './NcrDrawer';

export const QUALITY_TABS = ['inspections', 'tests', 'ncrs', 'checklists'] as const;
export type QualityTab = (typeof QUALITY_TABS)[number];

const count = (label: string, n: number | undefined, title: string) => (
  <span>
    {label}
    {n ? <Badge count={n} size="small" title={title} style={{ marginLeft: 6 }} /> : null}
  </span>
);

/**
 * Inspections, tests and NCRs: on the Quality page (with the checklists) and as a project tab. `openId` opens a test
 * or an NCR from a notification link.
 */
export function QualityTabs({ projectId, tab, onTab, openId, withChecklists }: { projectId?: string; tab: QualityTab; onTab: (t: QualityTab) => void; openId?: string; withChecklists?: boolean }) {
  const { data: summary } = useQualitySummary(projectId);
  const [ncrId, setNcrId] = useState<string | null>(tab === 'ncrs' ? (openId ?? null) : null);
  return (
    <>
      <Tabs
        activeKey={tab}
        onChange={(k) => onTab(k as QualityTab)}
        tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
        items={[
          { key: 'inspections', label: count('Inspections', summary?.inspectionsWaiting, 'Waiting for QA/QC'), children: <InspectionList projectId={projectId} /> },
          { key: 'tests', label: count('Tests', summary?.testsOverdue, 'Results overdue'), children: <TestList projectId={projectId} initialOpenId={tab === 'tests' ? openId : undefined} onOpenNcr={setNcrId} /> },
          { key: 'ncrs', label: count('NCRs', summary?.ncrsOpen, 'Not closed'), children: <NcrList projectId={projectId} onOpen={setNcrId} /> },
          ...(withChecklists ? [{ key: 'checklists', label: 'Checklists', children: <ChecklistsPanel /> }] : []),
        ]}
      />
      <NcrDrawer id={ncrId} open={!!ncrId} onClose={() => setNcrId(null)} />
    </>
  );
}

/** A project's Quality tab: its inspections, tests and NCRs. */
export function ProjectQualityTab({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<QualityTab>('inspections');
  return <QualityTabs projectId={projectId} tab={tab} onTab={setTab} />;
}

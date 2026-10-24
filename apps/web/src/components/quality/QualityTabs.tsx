'use client';

import React, { useState } from 'react';
import { AppTabs } from '@/components/common/AppTabs';
import { useQualitySummary } from '@/lib/queries';
import { InspectionList } from '@/components/inspections/InspectionList';
import { ChecklistsPanel } from '@/components/inspections/ChecklistsPanel';
import { TestList } from './TestList';
import { NcrList } from './NcrList';
import { NcrDrawer } from './NcrDrawer';
import { useUrlTab } from '@/lib/url-state';

export const QUALITY_TABS = ['inspections', 'tests', 'ncrs', 'checklists'] as const;
export type QualityTab = (typeof QUALITY_TABS)[number];

/** A tab with what waits in it: "NCRs", 2, "not closed". */
const count = (label: string, n: number | null | undefined, countLabel: string) => ({ label, count: n, countLabel, attention: true });

/**
 * Inspections, tests and NCRs: on the Quality page (with the checklists) and as a project tab. `openId` opens a test
 * or an NCR from a notification link.
 */
export function QualityTabs({ projectId, tab, onTab, openId, withChecklists }: { projectId?: string; tab: QualityTab; onTab: (t: QualityTab) => void; openId?: string; withChecklists?: boolean }) {
  const { data: summary } = useQualitySummary(projectId);
  const [ncrId, setNcrId] = useState<string | null>(tab === 'ncrs' ? (openId ?? null) : null);
  return (
    <>
      <AppTabs
        activeKey={tab}
        onChange={(k) => onTab(k as QualityTab)}
        variant="page"
        items={[
          { key: 'inspections', ...count('Inspections', summary?.inspectionsWaiting, 'waiting for QA/QC'), children: <InspectionList projectId={projectId} /> },
          { key: 'tests', ...count('Tests', summary?.testsOverdue, 'results overdue'), children: <TestList projectId={projectId} initialOpenId={tab === 'tests' ? openId : undefined} onOpenNcr={setNcrId} /> },
          { key: 'ncrs', ...count('NCRs', summary?.ncrsOpen, 'not closed'), children: <NcrList projectId={projectId} onOpen={setNcrId} /> },
          ...(withChecklists ? [{ key: 'checklists', label: 'Checklists', children: <ChecklistsPanel /> }] : []),
        ]}
      />
      <NcrDrawer id={ncrId} open={!!ncrId} onClose={() => setNcrId(null)} />
    </>
  );
}

/** A project's Quality tab: its inspections, tests and NCRs; the one open is `?sub=` in the URL (UX item 84). */
export function ProjectQualityTab({ projectId }: { projectId: string }) {
  const [tab, setTab] = useUrlTab<QualityTab>(QUALITY_TABS, 'inspections');
  return <QualityTabs projectId={projectId} tab={tab} onTab={setTab} />;
}

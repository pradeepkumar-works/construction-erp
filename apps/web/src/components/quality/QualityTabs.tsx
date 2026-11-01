'use client';

import React, { useState } from 'react';
import { AppTabs } from '@/components/common/AppTabs';
import { canCheckGrn } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useQualitySummary, useWaitingReceipts } from '@/lib/queries';
import { WaitingReceipts } from '@/components/stock/WaitingReceipts';
import { InspectionList } from '@/components/inspections/InspectionList';
import { ChecklistsPanel } from '@/components/inspections/ChecklistsPanel';
import { TestList } from './TestList';
import { NcrList } from './NcrList';
import { NcrDrawer } from './NcrDrawer';
import { useUrlTab } from '@/lib/url-state';

export const QUALITY_TABS = ['inspections', 'grns', 'tests', 'ncrs', 'checklists'] as const;
export type QualityTab = (typeof QUALITY_TABS)[number];

/** A tab with what waits in it: "NCRs", 2, "not closed". */
const count = (label: string, n: number | null | undefined, countLabel: string) => ({ label, count: n, countLabel, attention: true });

/**
 * Inspections, material to check, tests and NCRs: on the Quality page (with the checklists) and as a project tab.
 * `openId` opens a test or an NCR from a notification link. Material to check is QA/QC's queue of receipts nobody has
 * accepted or rejected yet, so a lot is checked from here instead of the store register.
 */
export function QualityTabs({ projectId, tab, onTab, openId, withChecklists }: { projectId?: string; tab: QualityTab; onTab: (t: QualityTab) => void; openId?: string; withChecklists?: boolean }) {
  const { data: summary } = useQualitySummary(projectId);
  const { user } = useAuth();
  const checker = !!user && canCheckGrn(user.roleKey);
  const { data: unchecked } = useWaitingReceipts('CHECK', { pageSize: 1, projectId }, checker);
  const [ncrId, setNcrId] = useState<string | null>(tab === 'ncrs' ? (openId ?? null) : null);
  return (
    <>
      <AppTabs
        activeKey={tab}
        onChange={(k) => onTab(k as QualityTab)}
        variant="page"
        items={[
          { key: 'inspections', ...count('Inspections', summary?.inspectionsWaiting, 'waiting for QA/QC'), children: <InspectionList projectId={projectId} /> },
          ...(checker ? [{ key: 'grns', ...count('Material to check', unchecked?.total, 'not checked'), children: <WaitingReceipts waiting="CHECK" projectId={projectId} /> }] : []),
          { key: 'tests', ...count('Material tests', summary?.testsOverdue, 'results overdue'), children: <TestList projectId={projectId} initialOpenId={tab === 'tests' ? openId : undefined} onOpenNcr={setNcrId} /> },
          { key: 'ncrs', ...count('NCRs', summary?.ncrsOpen, 'not closed'), children: <NcrList projectId={projectId} onOpen={setNcrId} /> },
          ...(withChecklists ? [{ key: 'checklists', label: 'Checklists', children: <ChecklistsPanel /> }] : []),
        ]}
      />
      <NcrDrawer id={ncrId} open={!!ncrId} onClose={() => setNcrId(null)} />
    </>
  );
}

/** A project's Quality tab: its inspections, tests and NCRs; the one open is `?sub=` in the URL. */
export function ProjectQualityTab({ projectId }: { projectId: string }) {
  const [tab, setTab] = useUrlTab<QualityTab>(QUALITY_TABS, 'inspections');
  return <QualityTabs projectId={projectId} tab={tab} onTab={setTab} />;
}

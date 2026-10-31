'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { usePortalBills, usePortalInspections, usePortalProject, usePortalRfis } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { PortalOverview } from '@/components/portal/PortalOverview';
import { PortalDprs } from '@/components/portal/PortalDprs';
import { PortalBills } from '@/components/portal/PortalBills';
import { PortalInspections } from '@/components/portal/PortalInspections';
import { PortalRfis } from '@/components/portal/PortalRfis';
import { ProgressReportView } from '@/components/reports/ProgressReportView';

const TABS = ['overview', 'dprs', 'report', 'bills', 'inspections', 'rfis'] as const;
type Tab = (typeof TABS)[number];

function PortalProject() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, error, refetch } = usePortalProject(id);
  const bills = usePortalBills(id);
  const inspections = usePortalInspections(id);
  const rfis = usePortalRfis(id);
  const [billId, setBillId] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [rfiId, setRfiId] = useState<string | null>(null);
  const raw = search.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'overview';
  const go = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });

  // A notification links here with ?open=<bill, inspection or RFI id>.
  const open = search.get('open');
  useEffect(() => {
    if (!open) return;
    if (bills.data?.some((b) => b.id === open)) {
      setBillId(open);
      router.replace(`${pathname}?tab=bills`, { scroll: false });
    } else if (inspections.data?.some((i) => i.id === open)) {
      setInspectionId(open);
      router.replace(`${pathname}?tab=inspections`, { scroll: false });
    } else if (rfis.data?.some((r) => r.id === open)) {
      setRfiId(open);
      router.replace(`${pathname}?tab=rfis`, { scroll: false });
    }
  }, [open, bills.data, inspections.data, rfis.data, pathname, router]);

  const toCertify = bills.data?.filter((b) => b.stage === 'SENT').length ?? 0;
  const requested = inspections.data?.filter((i) => i.status === 'SUBMITTED').length ?? 0;
  const toAnswer = rfis.data?.filter((r) => r.status === 'OPEN').length ?? 0;

  return (
    <div className="page-container">
      <PageHeader title={data ? data.name : 'Project'} subtitle={data ? [data.code, data.clientName, data.location].filter(Boolean).join(' · ') : undefined} crumbs={[{ title: 'My projects', href: '/portal' }]} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton shape="workspace" header={false} /> : null}
      {data ? (
        <Card size="small">
          <AppTabs
            activeKey={tab}
            onChange={(k) => go(k as Tab)}
            variant="page"
            items={[
              { key: 'overview', label: 'Progress', children: <PortalOverview project={data} /> },
              { key: 'dprs', label: 'Daily reports', children: <PortalDprs projectId={data.id} /> },
              { key: 'report', label: 'Progress report', children: <div style={{ padding: 12 }}><ProgressReportView projectId={data.id} portal /></div> },
              {
                key: 'bills',
                label: 'RA bills',
                count: toCertify,
                countLabel: 'waiting for your certificate',
                attention: true,
                children: <PortalBills bills={bills} openId={billId} onOpen={setBillId} />,
              },
              {
                key: 'inspections',
                label: 'Inspections',
                count: requested || null,
                countLabel: 'requested',
                children: <PortalInspections inspections={inspections} openId={inspectionId} onOpen={setInspectionId} />,
              },
              {
                key: 'rfis',
                label: 'RFIs',
                count: toAnswer,
                countLabel: 'waiting for your answer',
                attention: true,
                children: <PortalRfis rfis={rfis} openId={rfiId} onOpen={setRfiId} />,
              },
            ]}
          />
        </Card>
      ) : null}
    </div>
  );
}

export default function PortalProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <PageSkeleton shape="workspace" />
        </div>
      }
    >
      <PortalProject />
    </Suspense>
  );
}

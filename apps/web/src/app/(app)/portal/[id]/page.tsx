'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Badge, Card, Skeleton, Tabs } from 'antd';
import { usePortalBills, usePortalInspections, usePortalProject } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { PortalOverview } from '@/components/portal/PortalOverview';
import { PortalDprs } from '@/components/portal/PortalDprs';
import { PortalBills } from '@/components/portal/PortalBills';
import { PortalInspections } from '@/components/portal/PortalInspections';
import { ProgressReportView } from '@/components/reports/ProgressReportView';

const TABS = ['overview', 'dprs', 'report', 'bills', 'inspections'] as const;
type Tab = (typeof TABS)[number];

function PortalProject() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, error, refetch } = usePortalProject(id);
  const bills = usePortalBills(id);
  const inspections = usePortalInspections(id);
  const [billId, setBillId] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const raw = search.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'overview';
  const go = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });

  // A notification links here with ?open=<bill or inspection id>.
  const open = search.get('open');
  useEffect(() => {
    if (!open) return;
    if (bills.data?.some((b) => b.id === open)) {
      setBillId(open);
      router.replace(`${pathname}?tab=bills`, { scroll: false });
    } else if (inspections.data?.some((i) => i.id === open)) {
      setInspectionId(open);
      router.replace(`${pathname}?tab=inspections`, { scroll: false });
    }
  }, [open, bills.data, inspections.data, pathname, router]);

  const toCertify = bills.data?.filter((b) => b.stage === 'SENT').length ?? 0;
  const requested = inspections.data?.filter((i) => i.status === 'SUBMITTED').length ?? 0;

  return (
    <div className="page-container">
      <PageHeader title={data ? data.name : 'Project'} subtitle={data ? [data.code, data.clientName, data.location].filter(Boolean).join(' · ') : undefined} extra={<Link href="/portal" className="text-link">All my projects</Link>} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <Skeleton active /> : null}
      {data ? (
        <Card size="small">
          <Tabs
            activeKey={tab}
            onChange={(k) => go(k as Tab)}
            tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
            items={[
              { key: 'overview', label: 'Progress', children: <PortalOverview project={data} /> },
              { key: 'dprs', label: 'Daily reports', children: <PortalDprs projectId={data.id} /> },
              { key: 'report', label: 'Progress report', children: <div style={{ padding: 12 }}><ProgressReportView projectId={data.id} portal /></div> },
              {
                key: 'bills',
                label: (
                  <span>
                    RA bills
                    {toCertify ? <Badge count={toCertify} size="small" title="Waiting for your certificate" style={{ marginLeft: 6 }} /> : null}
                  </span>
                ),
                children: <PortalBills bills={bills} openId={billId} onOpen={setBillId} />,
              },
              {
                key: 'inspections',
                label: (
                  <span>
                    Inspections
                    {requested ? <Badge count={requested} size="small" color="purple" title="Requested" style={{ marginLeft: 6 }} /> : null}
                  </span>
                ),
                children: <PortalInspections inspections={inspections} openId={inspectionId} onOpen={setInspectionId} />,
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
    <Suspense fallback={<Skeleton active />}>
      <PortalProject />
    </Suspense>
  );
}

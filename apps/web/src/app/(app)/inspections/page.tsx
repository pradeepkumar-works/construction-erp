'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { QUALITY_TABS, QualityTabs, type QualityTab } from '@/components/quality/QualityTabs';

function QualityPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = search.get('tab');
  const tab: QualityTab = QUALITY_TABS.includes(raw as QualityTab) ? (raw as QualityTab) : 'inspections';
  // Test and NCR notifications link here with ?tab=...&id=...
  const id = search.get('id') ?? undefined;
  return (
    <div className="page-container">
      <PageHeader
        title="Quality"
        subtitle="Inspections requested by site and passed by QA/QC, material and field tests against their specification, and non-conformance reports through to closure."
      />
      <Card size="small">
        <QualityTabs key={id ?? ''} tab={tab} onTab={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })} openId={id} withChecklists />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QualityPage />
    </Suspense>
  );
}

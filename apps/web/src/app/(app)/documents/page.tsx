'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from 'antd';
import { PageHeader } from '@/components/common/PageHeader';
import { DOCUMENT_TABS, DocumentTabs, type DocumentTab } from '@/components/documents/DocumentTabs';

function DocumentsPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = search.get('tab');
  const tab: DocumentTab = DOCUMENT_TABS.includes(raw as DocumentTab) ? (raw as DocumentTab) : 'register';
  // "Drawing issued" notifications link here with ?id=<document>
  const id = search.get('id') ?? undefined;
  // Delays link their letters with ?tab=letters&letter=<id>
  const letter = search.get('letter') ?? undefined;
  // RFI notifications and Search link with ?tab=rfis&rfi=<id>
  const rfi = search.get('rfi') ?? undefined;
  return (
    <div className="page-container">
      <PageHeader title="Documents" subtitle="Drawings and documents with their current revision, transmittals sent with what was signed for, letters in and out, and RFIs waiting for an answer." />
      <Card size="small">
        <DocumentTabs key={`${id ?? ''}:${letter ?? ''}:${rfi ?? ''}`} tab={tab} onTab={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })} openId={id} openLetterId={letter} openRfiId={rfi} />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DocumentsPage />
    </Suspense>
  );
}

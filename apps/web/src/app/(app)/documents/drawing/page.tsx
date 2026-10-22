'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { DrawingViewer } from '@/components/drawings/DrawingViewer';

/** A drawing opened to view and mark up (item 109): `?id=<document>&rev=<revision>&file=<attachment>&page=<n>&mark=<mark>`. */
function DrawingPage() {
  const id = useSearchParams().get('id');
  if (!id) return <QueryError error={{ response: { status: 404 } }} />;
  return <DrawingViewer key={id} documentId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton shape="record" />}>
      <DrawingPage />
    </Suspense>
  );
}

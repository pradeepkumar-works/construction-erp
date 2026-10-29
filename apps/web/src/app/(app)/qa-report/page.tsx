'use client';

import React, { Suspense } from 'react';
import { ReportPage } from '@/components/qa/ReportPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportPage />
    </Suspense>
  );
}

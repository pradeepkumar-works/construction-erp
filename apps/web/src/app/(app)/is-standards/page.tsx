'use client';

import React, { Suspense } from 'react';
import { IsStandardsPage } from '@/components/qa/IsStandardsPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <IsStandardsPage />
    </Suspense>
  );
}

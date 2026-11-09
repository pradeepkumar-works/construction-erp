'use client';

import React, { Suspense } from 'react';
import { IsCompliancePage } from '@/components/qa/IsCompliancePage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <IsCompliancePage />
    </Suspense>
  );
}

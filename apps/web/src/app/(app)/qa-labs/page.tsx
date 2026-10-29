'use client';

import React, { Suspense } from 'react';
import { LabsPage } from '@/components/qa/LabsPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LabsPage />
    </Suspense>
  );
}

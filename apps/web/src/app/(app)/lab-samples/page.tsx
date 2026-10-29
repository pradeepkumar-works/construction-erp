'use client';

import React, { Suspense } from 'react';
import { SamplesPage } from '@/components/qa/SamplesPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SamplesPage />
    </Suspense>
  );
}

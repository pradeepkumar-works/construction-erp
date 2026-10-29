'use client';

import React, { Suspense } from 'react';
import { TestsDuePage } from '@/components/qa/TestsDuePage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TestsDuePage />
    </Suspense>
  );
}

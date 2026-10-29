'use client';

import React, { Suspense } from 'react';
import { TestTypesPage } from '@/components/qa/TestTypesPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TestTypesPage />
    </Suspense>
  );
}

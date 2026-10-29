'use client';

import React, { Suspense } from 'react';
import { PoursPage } from '@/components/qa/PoursPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PoursPage />
    </Suspense>
  );
}

'use client';

import React, { Suspense } from 'react';
import { AuditsPage } from '@/components/qa/AuditsPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AuditsPage />
    </Suspense>
  );
}

'use client';

import React, { Suspense } from 'react';
import { QualityPlanPage } from '@/components/qa/QualityPlanPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QualityPlanPage />
    </Suspense>
  );
}

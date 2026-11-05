'use client';

import React, { Suspense } from 'react';
import { PipelineLayoutPage } from '@/components/design/PipelineLayoutPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PipelineLayoutPage />
    </Suspense>
  );
}

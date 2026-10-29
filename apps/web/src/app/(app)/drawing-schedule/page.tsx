'use client';

import React, { Suspense } from 'react';
import { DrawingSchedulePage } from '@/components/design/DrawingSchedulePage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DrawingSchedulePage />
    </Suspense>
  );
}

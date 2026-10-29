'use client';

import React, { Suspense } from 'react';
import { CalibrationPage } from '@/components/qa/CalibrationPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CalibrationPage />
    </Suspense>
  );
}

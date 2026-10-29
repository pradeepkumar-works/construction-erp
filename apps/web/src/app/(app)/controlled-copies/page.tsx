'use client';

import { Suspense } from 'react';
import { ControlledCopiesPage } from '@/components/design/ControlledCopiesPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ControlledCopiesPage />
    </Suspense>
  );
}

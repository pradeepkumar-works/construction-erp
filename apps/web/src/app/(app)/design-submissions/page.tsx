'use client';

import { Suspense } from 'react';
import { DesignSubmissionsPage } from '@/components/design/DesignSubmissionsPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DesignSubmissionsPage />
    </Suspense>
  );
}

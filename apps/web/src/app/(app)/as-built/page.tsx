'use client';

import React, { Suspense } from 'react';
import { AsBuiltPage } from '@/components/design/AsBuiltPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AsBuiltPage />
    </Suspense>
  );
}

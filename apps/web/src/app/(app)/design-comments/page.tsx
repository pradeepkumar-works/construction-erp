'use client';

import React, { Suspense } from 'react';
import { DesignCommentsPage } from '@/components/design/DesignCommentsPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DesignCommentsPage />
    </Suspense>
  );
}

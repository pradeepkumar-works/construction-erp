'use client';

import React, { Suspense } from 'react';
import { ComponentDrawingsPage } from '@/components/design/ComponentDrawingsPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ComponentDrawingsPage />
    </Suspense>
  );
}

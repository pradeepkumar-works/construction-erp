'use client';

import React, { Suspense } from 'react';
import { CertificatesPage } from '@/components/qa/CertificatesPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CertificatesPage />
    </Suspense>
  );
}

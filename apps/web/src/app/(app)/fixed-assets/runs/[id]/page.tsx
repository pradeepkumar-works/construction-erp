'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RunRecord } from '@/components/fixed-assets/RunRecord';

/** One depreciation run, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <RunRecord id={id} onClose={() => router.push('/fixed-assets?tab=runs')} />;
}

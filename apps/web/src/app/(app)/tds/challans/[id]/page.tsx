'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChallanRecord } from '@/components/tds/ChallanRecord';

/** One TDS challan, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <ChallanRecord id={id} onClose={() => router.push('/tds?tab=challans')} />;
}

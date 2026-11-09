'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WoAmendmentRecord } from '@/components/subcontracts/WoAmendmentRecord';

/** One work order amendment, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <WoAmendmentRecord mode="page" id={id} onClose={() => router.push('/work-orders')} />;
}

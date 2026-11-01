'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SupplierChoiceRecord } from '@/components/purchasing/SupplierChoiceRecord';

/** One supplier choice sent for approval, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <SupplierChoiceRecord mode="page" id={id} onClose={() => router.push('/requests-to-order')} />;
}

'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { RequestToOrderScreen } from '@/components/purchasing/RequestToOrderScreen';

/** One request as purchase works it: enquiry, quotations, Finalise L1, purchase order. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <RequestToOrderScreen id={id} />
    </Suspense>
  );
}

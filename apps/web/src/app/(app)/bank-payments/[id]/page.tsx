'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PaymentBatchRecord } from '@/components/payables/PaymentBatchRecord';

/** One bank payment batch, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <PaymentBatchRecord id={id} onClose={() => router.push('/bank-payments')} />;
}

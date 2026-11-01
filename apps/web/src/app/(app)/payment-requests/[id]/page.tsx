'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { PaymentRequestDto } from '@erp/shared';
import { PaymentRequestRecord } from '@/components/payables/PaymentRequestRecord';
import { PaymentRequestFormModal } from '@/components/payables/PaymentRequestFormModal';

/** One payment request, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<PaymentRequestDto | null>(null);
  return (
    <>
      <PaymentRequestRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/payables?tab=requests')} />
      <PaymentRequestFormModal open={!!editing} request={editing} onClose={() => setEditing(null)} />
    </>
  );
}

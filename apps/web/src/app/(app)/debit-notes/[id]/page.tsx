'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DebitNoteRecord } from '@/components/payables/DebitNoteRecord';

/** One debit note, as its own page (v5 item 91). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <DebitNoteRecord mode="page" id={id} onClose={() => router.push('/payables?tab=debit-notes')} />;
}

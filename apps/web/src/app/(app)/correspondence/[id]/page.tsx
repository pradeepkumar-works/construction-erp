'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LetterRecord } from '@/components/correspondence/LetterRecord';

/** One letter, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <LetterRecord mode="page" id={id} onClose={() => router.push('/correspondence')} />;
}

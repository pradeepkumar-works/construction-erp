'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ProgressEntryDto } from '@erp/shared';
import { ProgressRecord } from '@/components/progress/ProgressDrawer';
import { ProgressFormModal } from '@/components/progress/ProgressFormModal';

/** One progress entry, as its own page (UI roadmap item 57). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<ProgressEntryDto | null>(null);
  return (
    <>
      <ProgressRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/progress')} />
      <ProgressFormModal open={!!editing} entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { MaterialRequestDto } from '@erp/shared';
import { MrRecord } from '@/components/material/MrDrawer';
import { MrFormModal } from '@/components/material/MrFormModal';

/** One material request, as its own page (UI roadmap item 57). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<MaterialRequestDto | null>(null);
  return (
    <>
      <MrRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/material-requests')} />
      <MrFormModal open={!!editing} entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

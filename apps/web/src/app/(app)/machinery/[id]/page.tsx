'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { MachineryLogDto } from '@erp/shared';
import { MachineryRecord } from '@/components/machinery/MachineryDrawer';
import { MachineryFormModal } from '@/components/machinery/MachineryFormModal';

/** One day's machinery log, as its own page (UI roadmap item 61). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<MachineryLogDto | null>(null);
  return (
    <>
      <MachineryRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/machinery')} />
      <MachineryFormModal open={!!editing} log={editing} onClose={() => setEditing(null)} />
    </>
  );
}

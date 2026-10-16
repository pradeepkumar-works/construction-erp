'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { DailyReportDto } from '@erp/shared';
import { DprRecord } from '@/components/dpr/DprDrawer';
import { DprFormModal } from '@/components/dpr/DprFormModal';

/** One daily report, as its own page (UI roadmap item 57). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<DailyReportDto | null>(null);
  return (
    <>
      <DprRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/dpr')} />
      <DprFormModal open={!!editing} entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

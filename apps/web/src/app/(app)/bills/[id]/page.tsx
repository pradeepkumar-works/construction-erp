'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { RaBillDto } from '@erp/shared';
import { BillRecord } from '@/components/bills/BillDrawer';
import { BillFormModal } from '@/components/bills/BillFormModal';

/** One RA bill, as its own page (UI roadmap item 57). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<RaBillDto | null>(null);
  return (
    <>
      <BillRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/bills')} />
      <BillFormModal open={!!editing} bill={editing} onClose={() => setEditing(null)} />
    </>
  );
}

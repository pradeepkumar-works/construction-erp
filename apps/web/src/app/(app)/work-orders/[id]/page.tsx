'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { WorkOrderDto } from '@erp/shared';
import { WorkOrderRecord } from '@/components/subcontracts/WorkOrderDrawer';
import { WorkOrderFormModal } from '@/components/subcontracts/WorkOrderFormModal';

/** One work order, as its own page (UI roadmap item 61). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<WorkOrderDto | null>(null);
  return (
    <>
      <WorkOrderRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/work-orders')} />
      <WorkOrderFormModal open={!!editing} order={editing} onClose={() => setEditing(null)} />
    </>
  );
}

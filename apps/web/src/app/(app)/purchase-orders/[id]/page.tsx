'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { PurchaseOrderDto } from '@erp/shared';
import { PurchaseOrderRecord } from '@/components/purchasing/PurchaseOrderDrawer';
import { PurchaseOrderFormModal } from '@/components/purchasing/PurchaseOrderFormModal';

/** One purchase order, as its own page (UI roadmap item 57). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<PurchaseOrderDto | null>(null);
  return (
    <>
      <PurchaseOrderRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/purchase-orders')} />
      <PurchaseOrderFormModal open={!!editing} order={editing} onClose={() => setEditing(null)} />
    </>
  );
}

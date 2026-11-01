'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { SubcontractBillDto } from '@erp/shared';
import { SubBillRecord } from '@/components/subcontracts/SubBillDrawer';
import { SubBillFormModal } from '@/components/subcontracts/SubBillFormModal';

/** One subcontractor's bill, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<SubcontractBillDto | null>(null);
  return (
    <>
      <SubBillRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/subcontract-bills')} />
      <SubBillFormModal open={!!editing} bill={editing} onClose={() => setEditing(null)} />
    </>
  );
}

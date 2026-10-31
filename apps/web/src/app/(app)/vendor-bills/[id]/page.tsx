'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { VendorBillDto } from '@erp/shared';
import { VendorBillRecord } from '@/components/purchasing/VendorBillDrawer';
import { VendorBillForm } from '@/components/purchasing/VendorBillFormModal';

/** One vendor bill, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<VendorBillDto | null>(null);
  return (
    <>
      <VendorBillRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/vendor-bills')} />
      <VendorBillForm open={!!editing} bill={editing} onClose={() => setEditing(null)} />
    </>
  );
}

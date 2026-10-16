'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { InspectionDto } from '@erp/shared';
import { InspectionRecord } from '@/components/inspections/InspectionDrawer';
import { InspectionFormModal } from '@/components/inspections/InspectionFormModal';

/** One inspection request, as its own page (UI roadmap item 61). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<InspectionDto | null>(null);
  return (
    <>
      <InspectionRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/inspections')} />
      <InspectionFormModal open={!!editing} inspection={editing} onClose={() => setEditing(null)} />
    </>
  );
}

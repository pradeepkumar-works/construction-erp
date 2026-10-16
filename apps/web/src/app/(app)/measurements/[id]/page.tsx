'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { MeasurementSheetDto } from '@erp/shared';
import { MeasurementRecord } from '@/components/measurements/MeasurementDrawer';
import { MeasurementFormModal } from '@/components/measurements/MeasurementFormModal';

/** One measurement book sheet, as its own page (UI roadmap item 61). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<MeasurementSheetDto | null>(null);
  return (
    <>
      <MeasurementRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/measurements')} />
      <MeasurementFormModal open={!!editing} sheet={editing} onClose={() => setEditing(null)} />
    </>
  );
}

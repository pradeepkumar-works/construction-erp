'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ExpenseDto } from '@erp/shared';
import { ExpenseRecord } from '@/components/expenses/ExpenseDrawer';
import { ExpenseFormModal } from '@/components/expenses/ExpenseFormModal';

/** One site expense, as its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState<ExpenseDto | null>(null);
  return (
    <>
      <ExpenseRecord mode="page" id={id} onEdit={setEditing} onClose={() => router.push('/expenses')} />
      <ExpenseFormModal open={!!editing} expense={editing} onClose={() => setEditing(null)} />
    </>
  );
}

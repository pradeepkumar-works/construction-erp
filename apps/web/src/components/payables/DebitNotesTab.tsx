'use client';

import React from 'react';
import { canRaiseDebitNote } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useWaitingReceipts } from '@/lib/queries';
import { useUrlTab } from '@/lib/url-state';
import { AppTabs } from '@/components/common/AppTabs';
import { WaitingReceipts } from '@/components/stock/WaitingReceipts';
import { DebitNoteList } from './DebitNoteList';

const SUBS = ['raised', 'to-raise'] as const;

/**
 * Payables › Debit notes: the notes raised, and for those who raise them the material QA/QC rejected or the store sent
 * back with no note yet, each with Raise debit note, so a rejection reaches the supplier's account without anyone
 * looking for it in the store register.
 */
export function DebitNotesTab({ projectId, vendorId }: { projectId?: string; vendorId?: string }) {
  const { user } = useAuth();
  const raiser = !!user && canRaiseDebitNote(user.roleKey);
  const { data: waiting } = useWaitingReceipts('DEBIT_NOTE', { pageSize: 1, projectId }, raiser);
  const [sub, setSub] = useUrlTab<(typeof SUBS)[number]>(SUBS, 'raised');
  if (!raiser) return <DebitNoteList projectId={projectId} vendorId={vendorId} />;
  return (
    <AppTabs
      activeKey={sub}
      onChange={(k) => setSub(k as (typeof SUBS)[number])}
      items={[
        { key: 'raised', label: 'Raised', children: <DebitNoteList projectId={projectId} vendorId={vendorId} /> },
        { key: 'to-raise', label: 'To raise', count: waiting?.total, countLabel: 'with no debit note', attention: true, children: <WaitingReceipts waiting="DEBIT_NOTE" projectId={projectId} /> },
      ]}
    />
  );
}

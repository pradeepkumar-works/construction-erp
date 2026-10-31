'use client';

import React, { useState } from 'react';
import { Button, Table, Typography } from 'antd';
import type { DebitNoteDto } from '@erp/shared';
import { DEBIT_NOTE_REASON_LABELS, canRaiseDebitNote, canViewDebitNotes } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useDebitNotes } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { RecordLink } from '@/components/record/RecordLink';
import { DebitNoteDrawer, DebitNoteTag } from './DebitNoteRecord';
import { DebitNoteFormModal, type DebitNoteBill } from './DebitNoteFormModal';

/** Whether a bill's record shows its debit notes: approved, and the user may see them. */
export const showsDebitNotes = (role: Parameters<typeof canViewDebitNotes>[0] | undefined, status: string) => !!role && status === 'APPROVED' && canViewDebitNotes(role);

/** The debit notes on one approved vendor or subcontract bill, with "Raise debit note" while some is unpaid. */
export function BillDebitNotes({ bill }: { bill: DebitNoteBill }) {
  const { user } = useAuth();
  const [raising, setRaising] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const filter = bill.billType === 'VENDOR_BILL' ? { vendorBillId: bill.billId } : { subcontractBillId: bill.billId };
  const { data } = useDebitNotes({ ...filter, includeCancelled: true, pageSize: 50, sortBy: 'noteNo', sortOrder: 'asc' }, !!user && canViewDebitNotes(user.roleKey));
  const raiser = !!user && canRaiseDebitNote(user.roleKey);
  const rows = data?.items ?? [];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <Typography.Text type="secondary">Short supply, billed in excess, rejected or returned material, a rate difference: taken off what is unpaid.</Typography.Text>
        {raiser && toNumber(bill.outstanding) > 0 ? (
          <Button size="small" onClick={() => setRaising(true)}>
            Raise debit note
          </Button>
        ) : null}
      </div>
      <Table<DebitNoteDto>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 560 }}
        locale={{ emptyText: 'No debit note on this bill' }}
        columns={[
          {
            title: 'Note',
            dataIndex: 'noteNo',
            width: 150,
            render: (v: string, r) => (
              <RecordLink href={`/debit-notes/${r.id}`} onOpen={() => setOpened(r.id)} className="mono">
                {v}
              </RecordLink>
            ),
          },
          { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
          { title: 'Reason', dataIndex: 'reason', render: (v: DebitNoteDto['reason']) => DEBIT_NOTE_REASON_LABELS[v] },
          {
            title: 'Total',
            dataIndex: 'total',
            width: 130,
            align: 'right',
            render: (v) => (
              <strong className="mono" translate="no">
                {formatINR(v, true)}
              </strong>
            ),
          },
          { title: 'State', key: 'state', width: 150, render: (_, r) => <DebitNoteTag note={r} /> },
        ]}
      />
      <DebitNoteFormModal open={raising} bill={bill} onClose={() => setRaising(false)} />
      <DebitNoteDrawer id={opened} open={!!opened} onClose={() => setOpened(null)} />
    </>
  );
}

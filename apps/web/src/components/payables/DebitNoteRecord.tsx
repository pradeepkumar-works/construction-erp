'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Form, Input, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DebitNoteDto, DebitNoteLineDto } from '@erp/shared';
import { DEBIT_NOTE_REASON_LABELS, canRaiseDebitNote, unitLabel } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useDebitNote } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, formatPct, formatQty, NO_VALUE } from '@/lib/format';
import { FormShell } from '@/components/form/FormShell';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';

const money = (v: string | number, strong?: boolean) =>
  strong ? (
    <strong className="mono" translate="no">
      {formatINR(v, true)}
    </strong>
  ) : (
    <span className="mono" translate="no">
      {formatINR(v, true)}
    </span>
  );

/** Where a debit note's bill lives. */
export const debitNoteBillHref = (n: Pick<DebitNoteDto, 'vendorBillId' | 'subcontractBillId'>) => (n.vendorBillId ? `/vendor-bills/${n.vendorBillId}` : `/subcontract-bills/${n.subcontractBillId}`);

export const DebitNoteTag = ({ note }: { note: Pick<DebitNoteDto, 'cancelledAt' | 'exportedToTally'> }) =>
  note.cancelledAt ? (
    <AppTag style={{ margin: 0 }}>Cancelled</AppTag>
  ) : note.exportedToTally ? (
    <AppTag tone="info" style={{ margin: 0 }}>
      In Tally
    </AppTag>
  ) : (
    <AppTag tone="success" style={{ margin: 0 }}>
      Taken off the bill
    </AppTag>
  );

/** Cancel a debit note with a reason; the bill's payable goes back up. */
function CancelDebitNoteModal({ note, onClose }: { note: DebitNoteDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ note: string }>();
  const qc = useQueryClient();
  const notify = useNotify();
  const cancel = useMutation({
    mutationFn: async (v: { note: string }) => (await api.post<DebitNoteDto>(`/debit-notes/${note!.id}/cancel`, { note: v.note.trim() })).data,
    onSuccess: (n) => {
      notify.saved(`${n.noteNo} cancelled; ${n.billLabel} is payable in full again`);
      for (const k of ['debit-notes', 'vendor-bills', 'subcontract-bills', 'payables', 'payment-requests']) qc.invalidateQueries({ queryKey: [k] });
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!note} onClose={onClose} form={form} layout="modal" title={`Cancel ${note?.noteNo ?? 'debit note'}`} okText="Cancel debit note" cancelText="Keep it" onSubmit={(v) => cancel.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Typography.Paragraph>The note stops reducing {note?.billLabel}, and what it took off becomes payable again.</Typography.Paragraph>
        <Form.Item name="note" label="Why it is cancelled" rules={[{ required: true, whitespace: true, message: 'Say why the note is cancelled' }]}>
          <Input.TextArea rows={2} maxLength={500} placeholder="e.g. Supplier replaced the short bags" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
}

/** A debit note: what a vendor owes back on a bill, in a drawer or at `/debit-notes/<id>`. */
export function DebitNoteRecord({ id, mode, open, onClose }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const { data, isLoading, error, refetch } = useDebitNote(id ?? undefined);
  const raiser = !!user && canRaiseDebitNote(user.roleKey);

  return (
    <>
      <RecordFrame
        mode={mode}
        open={open}
        onClose={onClose}
        drawerSize={760}
        kind="Debit note"
        list={{ href: '/payables?tab=debit-notes', label: 'Debit notes' }}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        record={
          data && {
            href: `/debit-notes/${data.id}`,
            title: `${data.noteNo} · ${data.vendorName}`,
            tags: <DebitNoteTag note={data} />,
            facts: [
              { key: 'reason', label: 'Reason', children: DEBIT_NOTE_REASON_LABELS[data.reason] },
              { key: 'date', label: 'Date', children: formatDate(data.date) },
              {
                key: 'bill',
                label: 'Against',
                children: (
                  <Link href={debitNoteBillHref(data)} className="mono" translate="no">
                    {data.billLabel}
                  </Link>
                ),
              },
              { key: 'total', label: 'Total', children: money(data.total, true) },
              {
                key: 'vendor',
                label: 'Vendor',
                children: (
                  <span>
                    {data.vendorName}
                    {data.vendorGstin ? (
                      <span className="text-muted">
                        {' '}
                        · GSTIN <span translate="no">{data.vendorGstin}</span>
                      </span>
                    ) : null}
                  </span>
                ),
              },
              { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}`}>{data.projectName}</Link> },
              ...(data.stockEntryNo ? [{ key: 'grn', label: 'From', children: <span className="mono">{data.stockEntryNo}</span> }] : []),
              { key: 'by', label: 'Raised by', children: `${data.createdByName}, ${formatDateTime(data.createdAt)}` },
              ...(data.cancelledAt ? [{ key: 'cancelled', label: 'Cancelled', span: 2, children: `${data.cancelledByName ?? ''}, ${formatDateTime(data.cancelledAt)}: ${data.cancelNote ?? ''}` }] : []),
              ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', span: 2, children: <span style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</span> }] : []),
            ],
            sections: [
              {
                key: 'lines',
                title: 'Lines',
                count: data.lines.length,
                children: (
                  <Table<DebitNoteLineDto>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={data.lines}
                    scroll={{ x: 640 }}
                    columns={[
                      { title: 'What for', dataIndex: 'description' },
                      { title: 'Quantity', key: 'qty', width: 120, align: 'right', render: (_, l) => (l.quantity ? `${formatQty(l.quantity)} ${unitLabel(l.unit ?? '')}` : NO_VALUE) },
                      { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v: string | null) => (v ? money(v) : NO_VALUE) },
                      { title: 'GST', dataIndex: 'gstRate', width: 70, align: 'right', render: (v) => formatPct(v) },
                      { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v) => money(v, true) },
                    ]}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={4} align="right">
                          <Typography.Text type="secondary">
                            Before GST {formatINR(data.subtotal, true)} · GST {formatINR(data.gstAmount, true)} · Total
                          </Typography.Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          {money(data.total, true)}
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                ),
              },
            ],
            more: raiser && !data.cancelledAt ? [{ key: 'cancel', label: data.exportedToTally ? 'Cancel debit note (undo its Tally export first)' : 'Cancel debit note', danger: true, disabled: data.exportedToTally, onSelect: () => setCancelling(true) }] : [],
          }
        }
      />
      <CancelDebitNoteModal note={cancelling && data ? data : null} onClose={() => setCancelling(false)} />
    </>
  );
}

export function DebitNoteDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <DebitNoteRecord mode="drawer" {...props} />;
}

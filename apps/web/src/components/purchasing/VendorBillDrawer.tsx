'use client';

import React from 'react';
import Link from 'next/link';
import { App, Button, Divider, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VendorBillDto, VendorBillLineDto, VendorBillSourceDto } from '@erp/shared';
import { EXPENSE_CATEGORY_LABELS, MSME_CATEGORY_LABELS, VENDOR_BILL_KIND_LABELS, canEditSubmission, canRecordVendorBill, canResubmit, canViewPaymentRequests, canViewPayables } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useVendorBill } from '@/lib/queries';
import { formatDate, formatINR, formatQty, toNumber, NO_VALUE, formatMonthLong } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { BillPayments, PaidTag } from '@/components/payables/BillPayments';
import { TargetRequests } from '@/components/payables/TargetRequests';
import { BillDebitNotes, showsDebitNotes } from '@/components/payables/BillDebitNotes';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { checksSection } from '@/components/checks/ChecksSection';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { themeFontSize } from '@/lib/theme';
import { Section } from '@/components/common/Section';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';

const money = (v: string | number) => <span className="mono" translate="no">{formatINR(v, true)}</span>;

/** Whether a bill matches its PO and GRNs, or (a bill without a PO) passed its own checks. */
export const MatchTag = ({ matched, po = true }: { matched: boolean; po?: boolean }) =>
  matched ? (
    <AppTag tone="success" style={{ margin: 0 }}>
      {po ? 'Matches' : 'Checked'}
    </AppTag>
  ) : (
    <AppTag tone="danger" style={{ margin: 0 }}>
      Does not match
    </AppTag>
  );

/** Days past the due date of an approved bill not yet paid in full; null when it is not yet due or is settled. */
export const overdueDays = (b: Pick<VendorBillDto, 'dueDate' | 'status' | 'paidDate'>) => {
  const d = dayjs().startOf('day').diff(dayjs(b.dueDate), 'day');
  return b.status === 'APPROVED' && !b.paidDate && d > 0 ? d : null;
};

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (b: VendorBillDto) => void;
}

/**
 * A vendor bill, in a drawer or at `/vendor-bills/<id>`: against a PO with its three-way match against the order and the
 * GRNs, or (v5 item 91) a hire bill with the machine's logs, a workshop bill with its job cards, or another service bill.
 */
export function VendorBillRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, dataUpdatedAt } = useVendorBill(id ?? undefined);
  const recorder = !!user && canRecordVendorBill(user.roleKey);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['vendor-bills'] });
    qc.invalidateQueries({ queryKey: ['purchase-orders'] });
  };
  const submit = useMutation({
    mutationFn: async () => (await api.post<VendorBillDto>(`/vendor-bills/${id}/submit`)).data,
    onSuccess: (b) => done(`${b.billNo} submitted for approval`),
    meta: FAIL_NOTICE,
  });
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/vendor-bills/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-bills'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      onClose?.();
    },
    meta: FAIL_NOTICE,
  });

  const editable = !!data && !!user && recorder && canEditSubmission(user, data) && data.status !== 'APPROVED';
  const late = data ? overdueDays(data) : null;
  const payments = data?.status === 'APPROVED' && !!user && canViewPayables(user.roleKey);
  const requests = data?.status === 'APPROVED' && !!user && canViewPaymentRequests(user.roleKey);
  const adjusted = data ? toNumber(data.advanceAdjusted) : 0;
  const fuel = data ? toNumber(data.fuelRecovery) : 0;
  const debited = data ? toNumber(data.debitNoteAmount) : 0;
  const withPo = !!data?.purchaseOrderId;
  const notes = !!data && showsDebitNotes(user?.roleKey, data.status);

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={980}
      kind="Vendor bill"
      list={{ href: '/vendor-bills', label: 'Vendor bills' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/vendor-bills/${data.id}`,
          title: `${data.billNo} · ${data.vendorName}`,
          tags: (
            <>
              <StatusTag status={data.status} /> <MatchTag matched={data.matched} po={withPo} /> <PaidTag bill={data} />
            </>
          ),
          facts: [
            {
              key: 'vendor',
              label: 'Vendor',
              span: 2,
              children: (
                <span>
                  {data.vendorName}
                  {data.vendorGstin && <span className="text-muted"> · GSTIN <span translate="no">{data.vendorGstin}</span></span>}
                  {data.vendorMsme && <AppTag color={data.vendorMsme === 'MEDIUM' ? 'default' : 'orange'} style={{ marginLeft: 8 }}>{MSME_CATEGORY_LABELS[data.vendorMsme]}</AppTag>}
                </span>
              ),
            },
            ...(withPo
              ? [{ key: 'po', label: 'Purchase order', children: <Link href={`/purchase-orders/${data.purchaseOrderId}`}>{data.poNo}</Link> }]
              : [
                  { key: 'kind', label: 'Kind', children: VENDOR_BILL_KIND_LABELS[data.kind] },
                  ...(data.equipmentCode
                    ? [{ key: 'machine', label: 'Machine', children: `${data.equipmentCode} · ${data.equipmentName ?? ''}${data.hireMonth ? `, ${formatMonthLong(data.hireMonth)}` : ''}` }]
                    : []),
                  ...(data.expenseCategory ? [{ key: 'head', label: 'Cost head', children: EXPENSE_CATEGORY_LABELS[data.expenseCategory] }] : []),
                ]),
            { key: 'invoice', label: 'Invoice', children: `${data.invoiceNo}, ${formatDate(data.invoiceDate)}` },
            { key: 'total', label: 'Invoice total', children: <strong>{money(data.total)}</strong> },
            ...(withPo && (adjusted > 0 || toNumber(data.poAdvancePaid) > 0)
              ? [
                  {
                    key: 'advance',
                    label: 'Advance adjusted',
                    children: (
                      <span>
                        {money(data.advanceAdjusted)} <span className="text-muted">of {formatINR(data.poAdvancePaid, true)} paid on the PO</span>
                      </span>
                    ),
                  },
                ]
              : []),
            {
              key: 'due',
              label: 'Due',
              children: (
                <span>
                  {formatDate(data.dueDate)} {late ? <AppTag tone="danger">{late} days overdue</AppTag> : null}
                </span>
              ),
            },
            ...(fuel > 0 ? [{ key: 'fuel', label: 'Fuel recovered', children: <span>{money(data.fuelRecovery)} <span className="text-muted">for {formatQty(data.fuelLitres)} L at {formatINR(data.fuelRate, true)}</span></span> }] : []),
            ...(debited > 0 ? [{ key: 'debit', label: 'Debit notes', children: money(data.debitNoteAmount) }] : []),
            { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}`}>{data.projectName}</Link> },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status' && i.key !== 'project'),
          ],
          lifecycle: submissionLifecycle(data, [
            { title: 'Paid', done: !!data.paidDate, content: data.status !== 'APPROVED' ? undefined : data.paidDate ? formatDate(data.paidDate) : `${formatINR(data.outstanding, true)} to pay` },
          ]),
          sections: [
            checksSection('vendor-bill', data.id, dataUpdatedAt),
            {
              key: 'items',
              title: withPo ? 'Items, matched against the PO and GRNs' : 'Lines',
              count: data.lines.length,
              children: (
                <>
                  <Table<VendorBillLineDto>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={data.lines}
                    scroll={{ x: withPo ? 950 : 700 }}
                    columns={withPo ? [
                      { title: 'Item', dataIndex: 'itemName' },
                      {
                        title: 'Billed',
                        dataIndex: 'quantity',
                        width: 110,
                        align: 'right',
                        render: (v, l) => {
                          const over = toNumber(v) > toNumber(l.receivedQty) - toNumber(l.billedElsewhere) + 1e-9;
                          return <Typography.Text type={over ? 'danger' : undefined} className="mono">{formatQty(v)} {l.unit}</Typography.Text>;
                        },
                      },
                      { title: 'Received', dataIndex: 'receivedQty', width: 90, align: 'right', render: (v) => <span className="mono" translate="no">{formatQty(v)}</span> },
                      { title: 'On other bills', dataIndex: 'billedElsewhere', width: 110, align: 'right', render: (v) => <span className="mono" translate="no">{formatQty(v)}</span> },
                      {
                        title: 'Rate',
                        dataIndex: 'rate',
                        width: 150,
                        align: 'right',
                        render: (v, l) => (
                          <span>
                            <Typography.Text type={toNumber(v) > toNumber(l.poRate) ? 'danger' : undefined} className="mono">
                              {formatINR(v, true)}
                            </Typography.Text>
                            {v !== l.poRate && <div className="text-muted mono" translate="no" style={{ fontSize: themeFontSize('fontSizeSM') }}>PO {formatINR(l.poRate, true)}</div>}
                          </span>
                        ),
                      },
                      {
                        title: 'GST',
                        dataIndex: 'gstRate',
                        width: 80,
                        align: 'right',
                        render: (v, l) => <Typography.Text type={toNumber(v) !== toNumber(l.poGstRate) ? 'danger' : undefined}>{v}%</Typography.Text>,
                      },
                      { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong>{money(v)}</strong> },
                      { title: 'GST amount', dataIndex: 'gstAmount', width: 120, align: 'right', render: (v) => money(v) },
                    ] : [
                      { title: 'Line', dataIndex: 'itemName' },
                      { title: 'Quantity', dataIndex: 'quantity', width: 130, align: 'right', render: (v, l) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                      { title: 'Rate', dataIndex: 'rate', width: 130, align: 'right', render: (v) => money(v) },
                      { title: 'GST', dataIndex: 'gstRate', width: 70, align: 'right', render: (v) => `${v}%` },
                      { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong>{money(v)}</strong> },
                      { title: 'GST amount', dataIndex: 'gstAmount', width: 120, align: 'right', render: (v) => money(v) },
                    ]}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <Section style={{ width: 320 }}>
                      {[
                        ['Items', data.subtotal],
                        ['GST', data.gstAmount],
                        ...(toNumber(data.freight) > 0 ? [['Freight', data.freight]] : []),
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>{k}</span>
                          {money(v)}
                        </div>
                      ))}
                      <Divider style={{ margin: '6px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>Invoice total</span>
                        {money(data.total)}
                      </div>
                      {adjusted + fuel + debited > 0 && (
                        <>
                          {(
                            [
                              ['Less advance adjusted', adjusted],
                              ['Less diesel recovered', fuel],
                              ['Less debit notes', debited],
                            ] as const
                          )
                            .filter(([, v]) => v > 0)
                            .map(([k, v]) => (
                              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                <span>{k}</span>
                                {money(-v)}
                              </div>
                            ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                            <span>Payable</span>
                            {money(data.payable)}
                          </div>
                        </>
                      )}
                    </Section>
                  </div>
                </>
              ),
            },
            ...(data.sources?.length
              ? [
                  {
                    key: 'sources',
                    title: data.kind === 'HIRE' ? 'Machine logs billed' : 'Job cards billed',
                    count: data.sources.length,
                    children: <BillSources kind={data.kind} rows={data.sources} />,
                  },
                ]
              : []),
            ...(notes
              ? [
                  {
                    key: 'debit-notes',
                    title: 'Debit notes',
                    children: (
                      <BillDebitNotes bill={{ billType: 'VENDOR_BILL', billId: data.id, label: `${data.billNo} · ${data.invoiceNo}`, vendorName: data.vendorName, billDate: data.invoiceDate, outstanding: data.outstanding }} />
                    ),
                  },
                ]
              : []),
            ...(payments
              ? [
                  {
                    key: 'payments',
                    title: 'Payments',
                    children: (
                      <BillPayments
                        approved
                        heading={false}
                        target={{
                          billType: 'VENDOR_BILL',
                          billId: data.id,
                          billLabel: data.billNo,
                          vendorName: data.vendorName,
                          billDate: data.invoiceDate,
                          dueDate: data.dueDate,
                          payable: data.payable,
                          outstanding: data.outstanding,
                          paidAmount: data.paidAmount,
                        }}
                      />
                    ),
                  },
                ]
              : []),
            ...(requests ? [{ key: 'requests', title: 'Payment requests', children: <TargetRequests approved target={{ kind: 'BILL', vendorBillId: data.id, label: data.billNo, vendorName: data.vendorName }} base={data.outstanding} /> }] : []),
            { key: 'invoice', title: 'Invoice', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> },
          ],
          activity: { type: 'vendor_bill', id: data.id, submission: data },
          actions: (size) => (
            <>
              {editable && data.status === 'DRAFT' && user && canResubmit(user, data) ? (
                <Button size={size} type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
                  Submit for approval
                </Button>
              ) : null}
              {editable && data.status === 'DRAFT' ? (
                <Button size={size} onClick={() => onEdit?.(data)}>
                  Edit
                </Button>
              ) : (
                recorder && <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              )}
              <ReviewActions type="vendor_bill" id={data.id} status={data.status} amount={data.total} size={size} />
            </>
          ),
          // Delete is a tap from Approve no longer (finding 15 of the October review).
          more: editable ? [{ key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: `vendor bill ${data.billNo}`, onConfirm: () => remove.mutateAsync() }) }] : [],
        }
      }
    >
      {deleteDialog}
    </RecordFrame>
  );
}

/** The machine logs a hire bill is made from, or the job cards a workshop bills (v5 item 91). */
function BillSources({ kind, rows }: { kind: VendorBillDto['kind']; rows: VendorBillSourceDto[] }) {
  const hire = kind === 'HIRE';
  return (
    <Table<VendorBillSourceDto>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={rows}
      scroll={{ x: 560 }}
      columns={[
        {
          title: hire ? 'Machine' : 'Job card',
          dataIndex: 'label',
          width: 140,
          render: (v: string, r) =>
            hire ? (
              <Link href={`/machinery/${r.id}`}>{formatDate(v)}</Link>
            ) : (
              <Link href={`/machinery?tab=maintenance&id=${r.id}`} className="mono">
                {v}
              </Link>
            ),
        },
        ...(hire ? [] : [{ title: 'Closed', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) }]),
        { title: hire ? 'Hours' : 'Work', dataIndex: 'detail' },
        ...(hire ? [] : [{ title: 'Labour and parts', dataIndex: 'amount', width: 150, align: 'right' as const, render: (v: string | null) => (v ? money(v) : NO_VALUE) }]),
      ]}
    />
  );
}

export function VendorBillDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <VendorBillRecord mode="drawer" {...props} />;
}

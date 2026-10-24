'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Divider, Form, Input, Progress, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { ImportOutlined, MailOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PurchaseOrderDto, PurchaseOrderLineDto, SupplierDispatchStatus } from '@erp/shared';
import { MSME_CATEGORY_LABELS, canViewMaterialApprovals, canEditSubmission, canKeepStock, canPurchase, canRecordVendorBill, canResubmit, canViewPaymentRequests, canViewVendorBills } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useMakeCheck, usePurchaseOrder } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, formatPct, formatQty, toNumber } from '@/lib/format';
import { DispatchStatusTag } from '@/components/supplier/supplierUi';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { ReceiptModal } from '@/components/stock/ReceiptModal';
import { VendorBillFormModal } from './VendorBillFormModal';
import { makeWarningText } from './PurchaseOrderFormModal';
import { openPoPrint } from './poPrint';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { FormShell } from '@/components/form/FormShell';
import { themeFontSize } from '@/lib/theme';
import { Section } from '@/components/common/Section';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { TargetRequests } from '@/components/payables/TargetRequests';

const money = (v: string | number) => <span className="mono" translate="no" style={{ whiteSpace: 'nowrap' }}>{formatINR(v, true)}</span>;

/** Tag for where an approved order stands: open, fully received or closed short. */
export function PoStateTag({ order }: { order: Pick<PurchaseOrderDto, 'status' | 'closedAt' | 'open'> }) {
  if (order.status !== 'APPROVED') return null;
  if (order.closedAt) return <AppTag style={{ margin: 0 }}>Closed</AppTag>;
  return order.open ? <AppTag tone="info" style={{ margin: 0 }}>Open</AppTag> : <AppTag tone="success" style={{ margin: 0 }}>Received</AppTag>;
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (o: PurchaseOrderDto) => void;
}

/** A purchase order: lines with what is received and billed, approval, print, GRNs and vendor bills against it; in a drawer or at `/purchase-orders/<id>`. */
export function PurchaseOrderRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = usePurchaseOrder(id ?? undefined);
  const makeCheck = useMakeCheck(
    user && canViewMaterialApprovals(user.roleKey) ? data?.projectId : undefined,
    (data?.lines ?? []).map((l) => ({ itemName: l.itemName, make: l.make })),
  );
  const makeWarnings = makeCheck.data ?? [];
  // Leakage checks (item 121): lines above what another site paid for the item in the 30 days before the order
  const rateChecks = (data?.lines ?? []).flatMap((line) => (line.rateCheck ? [{ line, check: line.rateCheck }] : []));
  const [receiving, setReceiving] = useState(false);
  const [billing, setBilling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeForm] = Form.useForm<{ note: string }>();
  const buyer = !!user && canPurchase(user.roleKey);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    qc.invalidateQueries({ queryKey: ['material-requests'] });
  };
  const submit = useMutation({
    mutationFn: async () => (await api.post<PurchaseOrderDto>(`/purchase-orders/${id}/submit`)).data,
    onSuccess: (o) => done(`${o.poNo} submitted for approval`),
    meta: FAIL_NOTICE,
  });
  const close = useMutation({
    mutationFn: async (note: string) => (await api.post<PurchaseOrderDto>(`/purchase-orders/${id}/close`, { note })).data,
    onSuccess: (o) => done(`${o.poNo} closed`),
    meta: FAIL_NOTICE,
  });
  const emailAgain = useMutation({
    mutationFn: async () => (await api.post<PurchaseOrderDto>(`/purchase-orders/${id}/email`)).data,
    onSuccess: (o) => done(`${o.poNo} emailed to ${o.supplierEmailTo}`),
    onError: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/purchase-orders/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['material-requests'] });
      onClose?.();
    },
    meta: FAIL_NOTICE,
  });

  const editable = !!data && !!user && buyer && canEditSubmission(user, data) && data.status !== 'APPROVED';
  const approved = data?.status === 'APPROVED';

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={1000}
      kind="Purchase order"
      list={{ href: '/purchase-orders', label: 'Purchase orders' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/purchase-orders/${data.id}`,
          title: `${data.poNo} · ${data.vendorName}`,
          tags: (
            <>
              <StatusTag status={data.status} /> <PoStateTag order={data} />
            </>
          ),
          print: () => {
            if (!openPoPrint(data, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups to print the order.');
          },
          notices: (
            <>
              {data.status === 'DRAFT' && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Draft: check the items and rates, then submit it for approval. Once approved, it is emailed to the vendor." />}
              {data.closedAt && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={`Closed on ${formatDateTime(data.closedAt)}`} description={data.closeNote ?? undefined} />}
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
            { key: 'date', label: 'PO date', children: formatDate(data.poDate) },
            { key: 'total', label: 'Order total', children: <strong>{money(data.total)}</strong> },
            ...(toNumber(data.advancePaid) > 0 || toNumber(data.advanceRequested) > 0
              ? [
                  {
                    key: 'advance',
                    label: 'Advance',
                    children: (
                      <span>
                        {money(data.advancePaid)} paid
                        <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                          {formatINR(data.advanceRequested, true)} asked for, {formatINR(data.advanceAdjusted, true)} adjusted on bills
                        </div>
                      </span>
                    ),
                  },
                ]
              : []),
            { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}`}>{data.projectName}</Link> },
            { key: 'mr', label: 'Material request', children: data.requestNo ? <Link href={`/material-requests/${data.materialRequestId}`}>{data.requestNo}</Link> : '-' },
            { key: 'deliver', label: 'Deliver by', children: data.deliveryBy ? formatDate(data.deliveryBy) : '-' },
            { key: 'address', label: 'Delivery address', children: data.deliveryAddress ?? '-' },
            { key: 'pay', label: 'Payment', children: data.paymentTerms ?? (data.paymentDays !== null ? `${data.paymentDays} days from invoice` : '-') },
            ...(approved ? [{ key: 'recv', label: 'Received', children: <Progress percent={data.receivedPct} size="small" style={{ maxWidth: 240, margin: 0 }} format={() => formatPct(data.receivedPct)} aria-label={`${formatPct(data.receivedPct)} received`} /> }] : []),
            ...(data.selectionReason ? [{ key: 'why', label: 'Why this vendor', span: 2, children: data.selectionReason }] : []),
            ...(approved && (data.supplierEmailedAt || data.supplierEmailError)
              ? [
                  {
                    key: 'emailed',
                    label: 'Sent to vendor',
                    children: data.supplierEmailError ? (
                      <Typography.Text type="warning">Not emailed: {data.supplierEmailError}</Typography.Text>
                    ) : (
                      <span>
                        Emailed to <span translate="no">{data.supplierEmailTo}</span> on {formatDateTime(data.supplierEmailedAt!)}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(data.supplierAcceptedAt
              ? [{ key: 'accepted', label: 'Supplier accepted', children: `${formatDateTime(data.supplierAcceptedAt)}${data.supplierAcceptedBy ? ` by ${data.supplierAcceptedBy}` : ''}${data.supplierNote ? `: ${data.supplierNote}` : ''}` }]
              : []),
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status' && i.key !== 'project'),
          ],
          lifecycle: submissionLifecycle(data, [
            data.closedAt
              ? { title: 'Closed', done: true, content: `${formatPct(data.receivedPct)} received` }
              : { title: 'Received', done: !data.open, content: approved ? `${formatPct(data.receivedPct)} received` : undefined },
          ]),
          sections: [
            {
              key: 'items',
              title: 'Items',
              count: data.lines.length,
              children: (
                <>
                  {makeWarnings.length ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      title={`${makeWarnings.length === 1 ? '1 line is' : `${makeWarnings.length} lines are`} not in a make approved for this project`}
                      description={
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {makeWarnings.map((w) => (
                            <li key={w.index}>{makeWarningText(w)}</li>
                          ))}
                        </ul>
                      }
                    />
                  ) : null}
                  {rateChecks.length ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      title={`${rateChecks.length === 1 ? '1 line is' : `${rateChecks.length} lines are`} above what another site paid in the 30 days before`}
                      description={
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {rateChecks.map(({ line: l, check: c }) => (
                            <li key={l.id}>
                              <span translate="no">{l.itemName}</span>: {formatINR(l.rate, true)} against {formatINR(c.bestRate, true)} paid by <span translate="no">{c.projectName}</span> to <span translate="no">{c.vendorName}</span> on {formatDate(c.poDate)} (
                              <Link href={`/purchase-orders/${c.purchaseOrderId}`} className="text-link" translate="no">
                                {c.poNo}
                              </Link>
                              ), {formatPct(c.abovePct)} more: <span translate="no">{formatINR(c.extra)}</span> on this order
                            </li>
                          ))}
                        </ul>
                      }
                    />
                  ) : null}
                  <Table<PurchaseOrderLineDto>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={data.lines}
                    scroll={{ x: 760 }}
                    columns={[
                      { title: 'Item', render: (_, l) => <div>{l.itemName}{l.make || l.specification ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{[l.make ? `Make: ${l.make}` : null, l.specification].filter(Boolean).join(' · ')}</div> : null}</div> },
                      { title: 'Quantity', dataIndex: 'quantity', width: 120, align: 'right', render: (v, l) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                      { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v) => money(v) },
                      { title: 'GST', dataIndex: 'gstRate', width: 60, align: 'right', render: (v) => formatPct(v) },
                      { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong>{money(v)}</strong> },
                      ...(approved
                        ? [
                            {
                              title: 'Received',
                              dataIndex: 'receivedQty',
                              width: 100,
                              align: 'right' as const,
                              render: (v: string, l: PurchaseOrderLineDto) => <Typography.Text type={toNumber(v) >= toNumber(l.quantity) ? 'success' : toNumber(v) > 0 ? 'warning' : undefined} className="mono">{formatQty(v)}</Typography.Text>,
                            },
                            { title: 'Billed', dataIndex: 'billedQty', width: 90, align: 'right' as const, render: (v: string) => <span className="mono" translate="no">{formatQty(v)}</span> },
                          ]
                        : []),
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
                        <span>Order total</span>
                        {money(data.total)}
                      </div>
                    </Section>
                  </div>
                </>
              ),
            },
            ...(data.dispatches?.length
              ? [
                  {
                    key: 'dispatches',
                    title: 'Dispatch notes from the supplier',
                    count: data.dispatches.length,
                    children: (
                      <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={data.dispatches}
                        scroll={{ x: 560 }}
                        columns={[
                          { title: 'Challan', dataIndex: 'dispatchNo', render: (v: string) => <span className="mono" translate="no">{v}</span> },
                          { title: 'Sent', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
                          { title: 'Vehicle', dataIndex: 'vehicleNo', width: 130, render: (v: string | null) => <span translate="no">{v ?? '-'}</span> },
                          {
                            title: 'State',
                            dataIndex: 'status',
                            width: 180,
                            render: (st: SupplierDispatchStatus, d: { grnNo: string | null }) => (
                              <span>
                                <DispatchStatusTag status={st} />
                                {d.grnNo ? <span className="mono" translate="no">{d.grnNo}</span> : null}
                              </span>
                            ),
                          },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
            ...(approved
              ? [
                  {
                    key: 'grns',
                    title: 'GRNs',
                    count: data.grns?.length ?? 0,
                    children: (
                      <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={data.grns ?? []}
                        locale={{ emptyText: 'Nothing received yet' }}
                        columns={[
                          { title: 'GRN', dataIndex: 'entryNo', width: 160, className: 'mono' },
                          { title: 'Date', dataIndex: 'date', width: 120, render: (v) => formatDate(v) },
                          { title: 'Lines', dataIndex: 'lines' },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
            ...(approved && user && canViewVendorBills(user.roleKey)
              ? [
                  {
                    key: 'bills',
                    title: 'Vendor bills',
                    count: data.bills?.length ?? 0,
                    children: (
                      <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={data.bills ?? []}
                        locale={{ emptyText: 'No bill recorded yet' }}
                        scroll={{ x: 640 }}
                        columns={[
                          { title: 'Bill', dataIndex: 'billNo', width: 140, render: (v, b) => <Link href={`/vendor-bills/${b.id}`} className="mono">{v}</Link> },
                          { title: 'Invoice', dataIndex: 'invoiceNo', render: (v, b) => `${v}, ${formatDate(b.invoiceDate)}` },
                          { title: 'Total', dataIndex: 'total', width: 140, align: 'right', render: (v) => money(v) },
                          { title: 'Match', dataIndex: 'matched', width: 110, render: (v) => (v ? <AppTag tone="success">Matches</AppTag> : <AppTag tone="danger">Exceptions</AppTag>) },
                          { title: 'Status', dataIndex: 'status', width: 130, render: (st) => <StatusTag status={st} /> },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
            ...(approved && !data.closedAt && user && canViewPaymentRequests(user.roleKey)
              ? [{ key: 'advances', title: 'Advance requests', children: <TargetRequests approved target={{ kind: 'PO_ADVANCE', purchaseOrderId: data.id, label: data.poNo, vendorName: data.vendorName }} base={String(toNumber(data.total) - toNumber(data.advanceRequested))} /> }]
              : []),
            { key: 'documents', title: 'Documents', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> },
          ],
          activity: { type: 'purchase_order', id: data.id, submission: data },
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
                buyer && <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              )}
              <ReviewActions type="purchase_order" id={data.id} status={data.status} amount={data.total} size={size} />
              {data.open && user && canKeepStock(user.roleKey) ? (
                <Button size={size} type="primary" icon={<ImportOutlined />} onClick={() => setReceiving(true)}>
                  Receive material
                </Button>
              ) : null}
              {approved && user && canRecordVendorBill(user.roleKey) ? (
                <Button size={size} onClick={() => setBilling(true)}>
                  Record vendor bill
                </Button>
              ) : null}
              {approved && !data.closedAt && buyer ? (
                <Button size={size} icon={<MailOutlined />} loading={emailAgain.isPending} onClick={() => emailAgain.mutate()}>
                  {data.supplierEmailedAt ? 'Email vendor again' : 'Email to vendor'}
                </Button>
              ) : null}
              {data.open && buyer ? (
                <Button
                  size={size}
                  onClick={() => {
                    closeForm.resetFields();
                    setClosing(true);
                  }}
                >
                  Close short
                </Button>
              ) : null}
              {editable ? (
                <ConfirmDelete what={`purchase order ${data.poNo}`} onConfirm={() => remove.mutateAsync()}>
                  <Button size={size} danger loading={remove.isPending}>
                    Delete
                  </Button>
                </ConfirmDelete>
              ) : null}
            </>
          ),
        }
      }
    >
      <FormShell open={closing} onClose={() => setClosing(false)} form={closeForm} layout="modal" title={data ? `Close ${data.poNo} short` : 'Close order'} okText="Close order" onSubmit={(v) => close.mutateAsync(v.note)}>
        <Typography.Paragraph type="secondary">Nothing more can be received against it, and what was not received can be ordered again. What was received can still be billed.</Typography.Paragraph>
        <Form form={closeForm} layout="vertical">
          <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why the balance is not needed' }]}>
            <Input.TextArea rows={2} maxLength={500} placeholder="Balance not required; vendor informed" />
          </Form.Item>
        </Form>
      </FormShell>
      <ReceiptModal open={receiving} onClose={() => setReceiving(false)} projectId={data?.projectId} purchaseOrderId={data?.id} />
      <VendorBillFormModal open={billing} purchaseOrderId={data?.id} onClose={() => setBilling(false)} />
    </RecordFrame>
  );
}

export function PurchaseOrderDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <PurchaseOrderRecord mode="drawer" {...props} />;
}

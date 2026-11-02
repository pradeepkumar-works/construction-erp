'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Divider, Form, Input, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import { ImportOutlined, MailOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BillCheckDto, PurchaseOrderDto, PurchaseOrderLineDto, SupplierDispatchStatus } from '@erp/shared';
import { MSME_CATEGORY_LABELS, PO_RECEIPT_STATE_LABELS, canViewMaterialApprovals, canEditSubmission, canKeepStock, canPurchase, canRecordVendorBill, canResubmit, canViewCost, canViewPaymentRequests, canViewVendorBills, figure } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useMakeCheck, usePurchaseOrder } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, formatPct, formatQty, toNumber, NO_VALUE } from '@/lib/format';
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
import { Section } from '@/components/common/Section';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { OrderBudget, OrderQuotes } from './OrderDecision';
import { TargetRequests, useTargetRequests } from '@/components/payables/TargetRequests';
import { CheckRows } from '@/components/checks/ChecksSection';
import { projectContext } from '@/components/record/RecordParts';
import { Money } from '@/components/common/Money';


/** A line the vendor has billed more of than has come in on GRNs. */
const billedAboveReceived = (l: PurchaseOrderLineDto) => toNumber(l.billedQty) > toNumber(l.receivedQty) + 1e-9;

/** A check that passed or found something, in the shape the checks pattern draws. */
const check = (key: string, ok: boolean, title: string, detail: string | null = null, links: BillCheckDto['links'] = []): BillCheckDto => ({ key, ok, title, detail, links, accepted: null });

/** Tag for where an approved order stands: open, fully received or closed short. */
export function PoStateTag({ order }: { order: Pick<PurchaseOrderDto, 'status' | 'closedAt' | 'open'> }) {
  if (order.status !== 'APPROVED') return null;
  if (order.closedAt) return <AppTag kind="poReceipt" status="CLOSED" style={{ margin: 0 }}>{PO_RECEIPT_STATE_LABELS.CLOSED}</AppTag>;
  return order.open ? <AppTag kind="poReceipt" status="OPEN" style={{ margin: 0 }}>{PO_RECEIPT_STATE_LABELS.OPEN}</AppTag> : <AppTag meaning="done" style={{ margin: 0 }}>{PO_RECEIPT_STATE_LABELS.RECEIVED}</AppTag>;
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
  // Leakage checks: lines above what another site paid for the item in the 30 days before the order
  const rateChecks = (data?.lines ?? []).flatMap((line) => (line.rateCheck ? [{ line, check: line.rateCheck }] : []));
  // The order's checks, in the one checks pattern: makes approved for the project, and rates against other sites.
  const checks: BillCheckDto[] = data
    ? [
        ...(makeCheck.data ? (makeWarnings.length ? makeWarnings.map((w) => check(`make-${w.index}`, false, makeWarningText(w))) : [check('make', true, 'Makes approved for this project')]) : []),
        ...(rateChecks.length
          ? rateChecks.map(({ line: l, check: c }) =>
              check(
                `rate-${l.id}`,
                false,
                `${l.itemName}: ${formatPct(c.abovePct)} above what another site paid in the 30 days before`,
                `${formatINR(l.rate, true)} against ${formatINR(c.bestRate, true)} paid by ${c.projectName} to ${c.vendorName} on ${formatDate(c.poDate)}, ${formatINR(c.extra)} more on this order`,
                [{ label: c.poNo, href: `/purchase-orders/${c.purchaseOrderId}` }],
              ),
            )
          : [check('rate', true, 'Rates within what other sites paid')]),
      ]
    : [];
  const flags = checks.filter((c) => !c.ok).length;
  const [receiving, setReceiving] = useState(false);
  const [billing, setBilling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeForm] = Form.useForm<{ note: string }>();
  const buyer = !!user && canPurchase(user.roleKey);
  const [askDelete, deleteDialog] = useConfirmDelete();

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
  const aboveReceived = data?.lines.filter(billedAboveReceived).length ?? 0;
  const advances = approved && !data?.closedAt && !!user && canViewPaymentRequests(user.roleKey);
  const asked = useTargetRequests({ purchaseOrderId: data?.id }, advances);

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
          context: projectContext(data),
          headline: [figure('orderValue', data.total), approved && figure('receivedShare', data.receivedPct), approved && figure('billedAboveReceived', aboveReceived)],
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
              {data.status === 'DRAFT' && <Alert type="info" showIcon style={{ marginBottom: tk.space[3] }} title="Draft: check the items and rates, then submit it for approval. Once approved, it is emailed to the vendor." />}
              {data.closedAt && <Alert type="warning" showIcon style={{ marginBottom: tk.space[3] }} title={`Closed on ${formatDateTime(data.closedAt)}`} description={data.closeNote ?? undefined} />}
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
                  {data.vendorMsme && <AppTag variant="kind" style={{ marginLeft: tk.space[2] }}>{MSME_CATEGORY_LABELS[data.vendorMsme]}</AppTag>}
                </span>
              ),
            },
            { key: 'date', label: 'PO date', children: formatDate(data.poDate) },
            ...(toNumber(data.advancePaid) > 0 || toNumber(data.advanceRequested) > 0
              ? [
                  {
                    key: 'advance',
                    label: 'Advance',
                    children: (
                      <span>
                        <Money value={data.advancePaid} paise /> paid
                        <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                          {formatINR(data.advanceRequested, true)} asked for, {formatINR(data.advanceAdjusted, true)} adjusted on bills
                        </div>
                      </span>
                    ),
                  },
                ]
              : []),
            { key: 'mr', label: 'Indent', children: data.requestNo ? <Link href={`/material-requests/${data.materialRequestId}`}>{data.requestNo}</Link> : NO_VALUE },
            { key: 'deliver', label: 'Deliver by', children: data.deliveryBy ? formatDate(data.deliveryBy) : NO_VALUE },
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
            ...submissionMetaItems(data),
          ],
          details: [
            { key: 'address', label: 'Delivery address', children: data.deliveryAddress ?? NO_VALUE },
            { key: 'pay', label: 'Payment', children: data.paymentTerms ?? (data.paymentDays !== null ? `${data.paymentDays} days from invoice` : NO_VALUE) },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
          ],
          lifecycle: submissionLifecycle(data, [
            data.closedAt
              ? { title: 'Closed', done: true, content: `${formatPct(data.receivedPct)} received` }
              : { title: 'Received', done: !data.open, waits: true, content: approved ? `${formatPct(data.receivedPct)} received` : undefined },
          ]),
          // Sections in the order the reader needs them: before approval what decides it (the items, who else quoted, the
          // budget); once approved, what has come in and been billed against it.
          sections: approved
            ? [
                { key: 'checks', title: 'Checks', count: flags, children: <CheckRows checks={checks} /> },
                {
                  key: 'items',
                  title: 'Items',
                  count: data.lines.length,
                  children: (
                    <>
                      <Table<PurchaseOrderLineDto>
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={data.lines}
                        scroll={{ x: 760 }}
                        columns={[
                          { title: 'Item', width: 220, render: (_, l) => <div>{l.itemName}{l.make || l.specification ? <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>{[l.make ? `Make: ${l.make}` : null, l.specification].filter(Boolean).join(' · ')}</div> : null}</div> },
                          { title: 'Quantity', dataIndex: 'quantity', width: 120, align: 'right', render: (v, l) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                          ...(approved
                            ? [
                                { title: 'Received', dataIndex: 'receivedQty', width: 120, align: 'right' as const, render: (v: string, l: PurchaseOrderLineDto) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                                {
                                  title: 'Billed',
                                  dataIndex: 'billedQty',
                                  width: 150,
                                  align: 'right' as const,
                                  render: (v: string, l: PurchaseOrderLineDto) => (
                                    <span>
                                      <span className="mono" translate="no">
                                        {formatQty(v)} {l.unit}
                                      </span>
                                      {billedAboveReceived(l) ? (
                                        <div>
                                          <AppTag meaning="failed">Billed above received</AppTag>
                                        </div>
                                      ) : null}
                                    </span>
                                  ),
                                },
                              ]
                            : []),
                          { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v) => <Money value={v} paise /> },
                          { title: 'GST', dataIndex: 'gstRate', width: 60, align: 'right', render: (v) => formatPct(v) },
                          { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong><Money value={v} paise /></strong> },
                        ]}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: tk.space[3] }}>
                        <Section style={{ width: 320 }}>
                          {[
                            ['Items', data.subtotal],
                            ['GST', data.gstAmount],
                            ...(toNumber(data.freight) > 0 ? [['Freight', data.freight]] : []),
                          ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: `${tk.space.half} 0` }}>
                              <span>{k}</span>
                              <Money value={v} paise />
                            </div>
                          ))}
                          <Divider style={{ margin: `${tk.space[2]} 0` }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: tk.type.title.fontWeight }}>
                            <span>Order total</span>
                            <Money value={data.total} paise />
                          </div>
                        </Section>
                      </div>
                    </>
                  ),
                },
                ...(approved && user && canViewVendorBills(user.roleKey)
                  ? [
                      {
                        key: 'bills',
                        title: 'Vendor bills',
                        count: data.bills?.length ?? 0,
                        empty: !data.bills?.length,
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
                              { title: 'Match', dataIndex: 'matched', width: 130, render: (v) => (v ? <AppTag meaning="done">Matches</AppTag> : <AppTag meaning="failed">Does not match</AppTag>) },
                              { title: 'Status', dataIndex: 'status', width: 130, render: (st) => <StatusTag status={st} /> },
                              { title: 'Total', dataIndex: 'total', width: 140, align: 'right', render: (v) => <Money value={v} paise /> },
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
                        empty: !data.grns?.length,
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
                ...(data.dispatches?.length
                  ? [
                      {
                        key: 'dispatches',
                        title: 'Dispatch notes from the vendor',
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
                              { title: 'Vehicle', dataIndex: 'vehicleNo', width: 130, render: (v: string | null) => <span translate="no">{v ?? NO_VALUE}</span> },
                              {
                                title: 'Status',
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
                ...(advances
                  ? [{ key: 'advances', title: 'Advance requests', empty: asked.loaded && asked.rows.length === 0, children: <TargetRequests approved target={{ kind: 'PO_ADVANCE', purchaseOrderId: data.id, label: data.poNo, vendorName: data.vendorName }} base={String(toNumber(data.total) - toNumber(data.advanceRequested))} /> }]
                  : []),
                ...(data.materialRequestId ? [{ key: 'quotes', title: 'Quotations on the indent', children: <OrderQuotes order={data} /> }] : []),
                ...(user && canViewCost(user.roleKey) ? [{ key: 'budget', title: 'Against the budget', children: <OrderBudget order={data} /> }] : []),
                { key: 'documents', title: 'Documents', count: data.attachments.length, empty: data.attachments.length === 0, children: <AttachmentGallery attachments={data.attachments} emptyText="No documents" /> },
              ]
            : [
                { key: 'checks', title: 'Checks', count: flags, children: <CheckRows checks={checks} /> },
                {
                  key: 'items',
                  title: 'Items',
                  count: data.lines.length,
                  children: (
                    <>
                      <Table<PurchaseOrderLineDto>
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={data.lines}
                        scroll={{ x: 760 }}
                        columns={[
                          { title: 'Item', width: 220, render: (_, l) => <div>{l.itemName}{l.make || l.specification ? <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>{[l.make ? `Make: ${l.make}` : null, l.specification].filter(Boolean).join(' · ')}</div> : null}</div> },
                          { title: 'Quantity', dataIndex: 'quantity', width: 120, align: 'right', render: (v, l) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                          ...(approved
                            ? [
                                { title: 'Received', dataIndex: 'receivedQty', width: 120, align: 'right' as const, render: (v: string, l: PurchaseOrderLineDto) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
                                {
                                  title: 'Billed',
                                  dataIndex: 'billedQty',
                                  width: 150,
                                  align: 'right' as const,
                                  render: (v: string, l: PurchaseOrderLineDto) => (
                                    <span>
                                      <span className="mono" translate="no">
                                        {formatQty(v)} {l.unit}
                                      </span>
                                      {billedAboveReceived(l) ? (
                                        <div>
                                          <AppTag meaning="failed">Billed above received</AppTag>
                                        </div>
                                      ) : null}
                                    </span>
                                  ),
                                },
                              ]
                            : []),
                          { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v) => <Money value={v} paise /> },
                          { title: 'GST', dataIndex: 'gstRate', width: 60, align: 'right', render: (v) => formatPct(v) },
                          { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong><Money value={v} paise /></strong> },
                        ]}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: tk.space[3] }}>
                        <Section style={{ width: 320 }}>
                          {[
                            ['Items', data.subtotal],
                            ['GST', data.gstAmount],
                            ...(toNumber(data.freight) > 0 ? [['Freight', data.freight]] : []),
                          ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: `${tk.space.half} 0` }}>
                              <span>{k}</span>
                              <Money value={v} paise />
                            </div>
                          ))}
                          <Divider style={{ margin: `${tk.space[2]} 0` }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: tk.type.title.fontWeight }}>
                            <span>Order total</span>
                            <Money value={data.total} paise />
                          </div>
                        </Section>
                      </div>
                    </>
                  ),
                },
                ...(data.materialRequestId ? [{ key: 'quotes', title: 'Quotations on the indent', children: <OrderQuotes order={data} /> }] : []),
                ...(user && canViewCost(user.roleKey) ? [{ key: 'budget', title: 'Against the budget', children: <OrderBudget order={data} /> }] : []),
                { key: 'documents', title: 'Documents', count: data.attachments.length, empty: data.attachments.length === 0, children: <AttachmentGallery attachments={data.attachments} emptyText="No documents" /> },
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
                  Receive material (GRN)
                </Button>
              ) : null}
              {approved && user && canRecordVendorBill(user.roleKey) ? (
                <Button size={size} onClick={() => setBilling(true)}>
                  Record vendor bill
                </Button>
              ) : null}
              {approved && !data.closedAt && buyer ? (
                <Button size={size} icon={<MailOutlined />} loading={emailAgain.isPending} onClick={() => emailAgain.mutate()}>
                  Email vendor
                </Button>
              ) : null}
            </>
          ),
          // Delete is a tap from Approve no longer.
          more: [
            ...(data.open && buyer
              ? [
                  {
                    key: 'close',
                    label: 'Close short',
                    danger: true,
                    onSelect: () => {
                      closeForm.resetFields();
                      setClosing(true);
                    },
                  },
                ]
              : []),
            ...(editable ? [{ key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: `purchase order ${data.poNo}`, onConfirm: () => remove.mutateAsync() }) }] : []),
          ],
        }
      }
    >
      <FormShell open={closing} onClose={() => setClosing(false)} form={closeForm} layout="modal" title={data ? `Close ${data.poNo} short?` : 'Close short'} okText="Close short" onSubmit={(v) => close.mutateAsync(v.note)}>
        <Typography.Paragraph type="secondary">The rest will not be received: nothing more can be received against it, and what was not received can be ordered again. What was received can still be billed.</Typography.Paragraph>
        <Form form={closeForm} layout="vertical">
          <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Enter why the balance is not needed' }]}>
            <Input.TextArea rows={2} maxLength={500} placeholder="e.g. Balance not required; vendor informed" />
          </Form.Item>
        </Form>
      </FormShell>
      {deleteDialog}
      <ReceiptModal open={receiving} onClose={() => setReceiving(false)} projectId={data?.projectId} purchaseOrderId={data?.id} />
      <VendorBillFormModal open={billing} purchaseOrderId={data?.id} onClose={() => setBilling(false)} />
    </RecordFrame>
  );
}

export function PurchaseOrderDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <PurchaseOrderRecord mode="drawer" {...props} />;
}

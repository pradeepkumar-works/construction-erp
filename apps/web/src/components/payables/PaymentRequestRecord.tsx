'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PaymentRequestDto, VendorPaymentDto } from '@erp/shared';
import { FUND_PURPOSE_LABELS, MSME_CATEGORY_LABELS, PAYMENT_REQUEST_KIND_LABELS, RECEIPT_MODE_LABELS, canEditSubmission, canRecordPayment, canReleaseFunds, canRequestFunds, canRequestPayment } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { usePaymentRequest, useVendorPayments } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { PaymentFormModal, requestPayTarget } from './PaymentFormModal';
import { ReleaseFundsModal } from './FundRequestFormModal';

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

/** Where a request's bill or order lives; a fund request's imprest (none for one paid to a party on account). */
export const requestTargetHref = (r: Pick<PaymentRequestDto, 'vendorBillId' | 'subcontractBillId' | 'purchaseOrderId' | 'workOrderId' | 'imprestId'>) =>
  r.vendorBillId
    ? `/vendor-bills/${r.vendorBillId}`
    : r.subcontractBillId
      ? `/subcontract-bills/${r.subcontractBillId}`
      : r.purchaseOrderId
        ? `/purchase-orders/${r.purchaseOrderId}`
        : r.workOrderId
          ? `/work-orders/${r.workOrderId}`
          : r.imprestId
            ? `/imprest?id=${r.imprestId}`
            : null;

/** Who a request pays: the party, or for a fund request into an imprest (v6 item 107) its holder. */
export const requestPayee = (r: Pick<PaymentRequestDto, 'vendorName' | 'imprestHolderName'>) => r.vendorName ?? (r.imprestHolderName ? `${r.imprestHolderName}'s imprest` : '-');

/** Paying an approved request: a fund request into an imprest is released, anything else paid. */
export const requestReleases = (r: Pick<PaymentRequestDto, 'kind' | 'imprestId'>) => r.kind === 'FUND_REQUEST' && !!r.imprestId;

/** How much of an approved request is paid (or, a fund request into an imprest, released). */
export function RequestPaidTag({ request }: { request: Pick<PaymentRequestDto, 'status' | 'paidAmount' | 'paidDate' | 'kind' | 'imprestId'> }) {
  if (request.status !== 'APPROVED') return null;
  const released = requestReleases(request);
  if (request.paidDate)
    return (
      <AppTag tone="success" style={{ margin: 0 }}>
        {released ? 'Released' : 'Paid'}
      </AppTag>
    );
  if (toNumber(request.paidAmount) > 0)
    return (
      <AppTag tone="pending" style={{ margin: 0 }}>
        {released ? 'Part released' : 'Part paid'}
      </AppTag>
    );
  return <AppTag style={{ margin: 0 }}>{released ? 'To release' : 'To pay'}</AppTag>;
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (r: PaymentRequestDto) => void;
}

/**
 * A payment request (v5 item 90): a bill to pay or an advance to release, or a site's fund request (v6 item 107), in a
 * drawer or at `/payment-requests/<id>`.
 */
export function PaymentRequestRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const { data, isLoading, error, refetch } = usePaymentRequest(id ?? undefined);
  const { data: payments } = useVendorPayments(
    {
      paymentRequestId: id ?? undefined,
      pageSize: 100,
      sortBy: 'paymentDate',
      sortOrder: 'asc',
    },
    !!data && data.status === 'APPROVED' && !!data.vendorId,
  );
  const fund = data?.kind === 'FUND_REQUEST';
  const releases = !!data && requestReleases(data);
  const accounts = !!user && (releases ? canReleaseFunds(user.roleKey) : canRecordPayment(user.roleKey));
  const requester = !!user && (fund ? canRequestFunds(user.roleKey) : canRequestPayment(user.roleKey));
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/payment-requests/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-requests'] });
      qc.invalidateQueries({ queryKey: ['payables'] });
      onClose?.();
    },
    meta: FAIL_NOTICE,
  });
  const removable = !!data && !!user && requester && canEditSubmission(user, data) && data.status !== 'APPROVED' && data.status !== 'SUBMITTED';
  const advance = data?.kind !== 'BILL';
  const targetHref = data ? requestTargetHref(data) : null;

  return (
    <>
      <RecordFrame
        mode={mode}
        open={open}
        onClose={onClose}
        drawerSize={760}
        kind="Payment request"
        list={{ href: '/payables?tab=requests', label: 'Payment requests' }}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        record={
          data && {
            href: `/payment-requests/${data.id}`,
            title: `${data.requestNo} · ${requestPayee(data)}`,
            tags: (
              <>
                <StatusTag status={data.status} /> <RequestPaidTag request={data} />
              </>
            ),
            facts: [
              {
                key: 'kind',
                label: 'For',
                children: fund && data.purpose ? `${PAYMENT_REQUEST_KIND_LABELS[data.kind]}: ${FUND_PURPOSE_LABELS[data.purpose].toLowerCase()}` : PAYMENT_REQUEST_KIND_LABELS[data.kind],
              },
              ...(data.raisedAtProjectName
                ? [
                    {
                      key: 'raisedAt',
                      label: 'Asked from',
                      children: data.raisedAtProjectName,
                    },
                  ]
                : []),
              ...(fund
                ? []
                : [
                  {
                    key: 'target',
                    label: advance ? 'Order' : 'Bill',
                    children: (
                      <span>
                        <Link href={targetHref ?? '#'} className="mono" translate="no">
                          {data.targetLabel}
                        </Link>{' '}
                        <span className="text-muted">
                          {advance ? 'value' : 'payable'} {formatINR(data.targetValue, true)}
                          {data.dueDate ? `, due ${formatDate(data.dueDate)}` : ''}
                        </span>
                      </span>
                    ),
                  },
                  ]),
              {
                key: 'vendor',
                label: releases ? 'Release into' : 'Pay to',
                children: (
                  <span>
                    {releases && targetHref ? <Link href={targetHref}>{requestPayee(data)}</Link> : requestPayee(data)}
                    {fund && !releases ? <span className="text-muted"> · on account</span> : null}
                    {data.vendorMsme && data.vendorMsme !== 'MEDIUM' ? (
                      <AppTag tone="pending" style={{ marginLeft: 8 }}>
                        {MSME_CATEGORY_LABELS[data.vendorMsme]}
                      </AppTag>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'amount',
                label: 'Amount',
                children: money(data.amount, true),
              },
              {
                key: 'neededBy',
                label: 'Needed by',
                children: data.neededBy ? formatDate(data.neededBy) : '-',
              },
              {
                key: 'mode',
                label: 'Pay by',
                children: RECEIPT_MODE_LABELS[data.mode],
              },
              ...(data.targetOpen !== null && data.status !== 'APPROVED'
                ? [
                    {
                      key: 'open',
                      label: 'Most it may ask',
                      children: money(data.targetOpen),
                    },
                  ]
                : []),
              ...(data.status === 'APPROVED'
                ? [
                    {
                      key: 'paid',
                      label: releases ? 'Released' : 'Paid',
                      children: (
                        <span>
                          {money(data.paidAmount)} {toNumber(data.outstanding) > 0 ? <span className="text-muted">· {formatINR(data.outstanding, true)} left</span> : null}
                        </span>
                      ),
                    },
                  ]
                : []),
              ...(data.reason
                ? [
                    {
                      key: 'reason',
                      label: 'Reason',
                      span: 2,
                      children: <span style={{ whiteSpace: 'pre-wrap' }}>{data.reason}</span>,
                    },
                  ]
                : []),
              ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
            ],
            lifecycle: submissionLifecycle(data, [
              {
                title: releases ? 'Released' : 'Paid',
                done: !!data.paidDate,
                content: data.status !== 'APPROVED' ? undefined : data.paidDate ? formatDate(data.paidDate) : `${formatINR(data.outstanding, true)} ${releases ? 'to release' : 'to pay'}`,
              },
            ]),
            sections: [
              ...(data.status === 'APPROVED' && !releases
                ? [
                    {
                      key: 'payments',
                      title: 'Payments',
                      count: payments?.total ?? 0,
                      children: (
                        <Table<VendorPaymentDto>
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={payments?.items ?? []}
                          locale={{ emptyText: 'Nothing paid yet' }}
                          scroll={{ x: 520 }}
                          columns={[
                            {
                              title: 'Date',
                              dataIndex: 'paymentDate',
                              width: 110,
                              render: (v) => formatDate(v),
                            },
                            {
                              title: 'Paid',
                              dataIndex: 'amount',
                              width: 130,
                              align: 'right',
                              render: (v) => money(v, true),
                            },
                            {
                              title: 'Deducted',
                              key: 'ded',
                              width: 120,
                              align: 'right',
                              render: (_, p) => money(toNumber(p.tdsAmount) + toNumber(p.otherDeduction)),
                            },
                            {
                              title: 'Mode / reference',
                              key: 'ref',
                              render: (_, p) => (
                                <span>
                                  {RECEIPT_MODE_LABELS[p.mode]}
                                  {p.reference ? (
                                    <span className="mono text-muted" translate="no">
                                      {' '}
                                      · {p.reference}
                                    </span>
                                  ) : null}
                                </span>
                              ),
                            },
                          ]}
                        />
                      ),
                    },
                  ]
                : []),
              {
                key: 'files',
                title: fund ? 'Wage sheet, quotation or letter' : 'Proforma or letter',
                count: data.attachments.length,
                children: data.attachments.length > 0 ? <AttachmentGallery attachments={data.attachments} /> : <Typography.Text type="secondary">Nothing attached.</Typography.Text>,
              },
            ],
            activity: {
              type: 'payment_request',
              id: data.id,
              submission: data,
            },
            actions: (size) => (
              <>
                {accounts && data.status === 'APPROVED' && toNumber(data.outstanding) > 0 ? (
                  <Button size={size} type="primary" onClick={() => (releases ? setReleasing(true) : setPaying(true))}>
                    {releases ? 'Release' : 'Pay'} {formatINR(data.outstanding)}
                  </Button>
                ) : null}
                {requester && <EditResubmitButton entry={data} onEdit={onEdit} size={size} />}
                <ReviewActions type="payment_request" id={data.id} status={data.status} amount={data.amount} size={size} />
              </>
            ),
            // Delete is a tap from Approve no longer (finding 15 of the October review).
            more: removable ? [{ key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: `payment request ${data.requestNo}`, onConfirm: () => remove.mutateAsync() }) }] : [],
          }
        }
      />
      <PaymentFormModal open={paying && !!data} bill={data ? requestPayTarget(data) : null} onClose={() => setPaying(false)} />
      <ReleaseFundsModal request={releasing && data ? data : null} onClose={() => setReleasing(false)} />
      {deleteDialog}
    </>
  );
}

export function PaymentRequestDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <PaymentRequestRecord mode="drawer" {...props} />;
}

/** Pay (or, a fund request into an imprest, release) an approved request from anywhere it is listed. */
export function PayRequestModal({ request, onClose }: { request: PaymentRequestDto | null; onClose: () => void }) {
  if (request && requestReleases(request)) return <ReleaseFundsModal request={request} onClose={onClose} />;
  return <PaymentFormModal open={!!request} bill={request ? requestPayTarget(request) : null} onClose={onClose} />;
}

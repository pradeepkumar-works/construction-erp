'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Table, Tag, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PaymentRequestDto, VendorPaymentDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, PAYMENT_REQUEST_KIND_LABELS, RECEIPT_MODE_LABELS, canEditSubmission, canRecordPayment, canRequestPayment } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { usePaymentRequest, useVendorPayments } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { PaymentFormModal, requestPayTarget } from './PaymentFormModal';

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

/** Where a request's bill or order lives. */
export const requestTargetHref = (r: Pick<PaymentRequestDto, 'vendorBillId' | 'subcontractBillId' | 'purchaseOrderId' | 'workOrderId'>) =>
  r.vendorBillId
    ? `/vendor-bills/${r.vendorBillId}`
    : r.subcontractBillId
      ? `/subcontract-bills/${r.subcontractBillId}`
      : r.purchaseOrderId
        ? `/purchase-orders/${r.purchaseOrderId}`
        : `/work-orders/${r.workOrderId}`;

/** How much of an approved request is paid. */
export function RequestPaidTag({ request }: { request: Pick<PaymentRequestDto, 'status' | 'paidAmount' | 'paidDate'> }) {
  if (request.status !== 'APPROVED') return null;
  if (request.paidDate)
    return (
      <Tag color="green" style={{ margin: 0 }}>
        Paid
      </Tag>
    );
  if (toNumber(request.paidAmount) > 0)
    return (
      <Tag color="gold" style={{ margin: 0 }}>
        Part paid
      </Tag>
    );
  return <Tag style={{ margin: 0 }}>To pay</Tag>;
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (r: PaymentRequestDto) => void;
}

/** A payment request (v5 item 90): a bill to pay or an advance to release, in a drawer or at `/payment-requests/<id>`. */
export function PaymentRequestRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const { data, isLoading, error, refetch } = usePaymentRequest(id ?? undefined);
  const { data: payments } = useVendorPayments(
    {
      paymentRequestId: id ?? undefined,
      pageSize: 100,
      sortBy: 'paymentDate',
      sortOrder: 'asc',
    },
    !!data && data.status === 'APPROVED',
  );
  const accounts = !!user && canRecordPayment(user.roleKey);
  const requester = !!user && canRequestPayment(user.roleKey);
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
            title: `${data.requestNo} · ${data.vendorName}`,
            tags: (
              <>
                <StatusTag status={data.status} /> <RequestPaidTag request={data} />
              </>
            ),
            facts: [
              {
                key: 'kind',
                label: 'For',
                children: PAYMENT_REQUEST_KIND_LABELS[data.kind],
              },
              {
                key: 'target',
                label: advance ? 'Order' : 'Bill',
                children: (
                  <span>
                    <Link href={requestTargetHref(data)} className="mono" translate="no">
                      {data.targetLabel}
                    </Link>{' '}
                    <span className="text-muted">
                      {advance ? 'value' : 'payable'} {formatINR(data.targetValue, true)}
                      {data.dueDate ? `, due ${formatDate(data.dueDate)}` : ''}
                    </span>
                  </span>
                ),
              },
              {
                key: 'vendor',
                label: 'Pay to',
                children: (
                  <span>
                    {data.vendorName}
                    {data.vendorMsme && data.vendorMsme !== 'MEDIUM' ? (
                      <Tag color="orange" style={{ marginLeft: 8 }}>
                        {MSME_CATEGORY_LABELS[data.vendorMsme]}
                      </Tag>
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
                      label: 'Paid',
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
                title: 'Paid',
                done: !!data.paidDate,
                content: data.status !== 'APPROVED' ? undefined : data.paidDate ? formatDate(data.paidDate) : `${formatINR(data.outstanding, true)} to pay`,
              },
            ]),
            sections: [
              ...(data.status === 'APPROVED'
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
                title: 'Proforma or letter',
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
                  <Button size={size} type="primary" onClick={() => setPaying(true)}>
                    Pay {formatINR(data.outstanding)}
                  </Button>
                ) : null}
                {requester && <EditResubmitButton entry={data} onEdit={onEdit} size={size} />}
                <ReviewActions type="payment_request" id={data.id} status={data.status} amount={data.amount} size={size} />
                {removable ? (
                  <ConfirmDelete what={`payment request ${data.requestNo}`} onConfirm={() => remove.mutateAsync()}>
                    <Button size={size} danger loading={remove.isPending}>
                      Delete
                    </Button>
                  </ConfirmDelete>
                ) : null}
              </>
            ),
          }
        }
      />
      <PaymentFormModal open={paying && !!data} bill={data ? requestPayTarget(data) : null} onClose={() => setPaying(false)} />
    </>
  );
}

export function PaymentRequestDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <PaymentRequestRecord mode="drawer" {...props} />;
}

/** Pay an approved request from anywhere it is listed. */
export function PayRequestModal({ request, onClose }: { request: PaymentRequestDto | null; onClose: () => void }) {
  return <PaymentFormModal open={!!request} bill={request ? requestPayTarget(request) : null} onClose={onClose} />;
}

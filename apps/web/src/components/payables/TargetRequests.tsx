'use client';

import React, { useState } from 'react';
import { Button, Table, Typography } from 'antd';
import type { PaymentRequestDto } from '@erp/shared';
import { canRecordPayment, canRequestPayment, canViewPaymentRequests } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { usePaymentRequests } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { RecordLink } from '@/components/record/RecordLink';
import { PaymentRequestDrawer, PayRequestModal, RequestPaidTag } from './PaymentRequestRecord';
import { PaymentRequestFormModal, type RequestFor } from './PaymentRequestFormModal';

/** Requests still holding part of the bill or order: waiting for approval, or approved and not yet paid. */
const holding = (r: PaymentRequestDto) => (r.status === 'SUBMITTED' ? toNumber(r.amount) : r.status === 'APPROVED' ? toNumber(r.outstanding) : 0);

/**
 * The payment requests on one approved bill or order, with "Request payment" (a bill) or "Request
 * advance" (an order) for those who may ask, and Pay for accounts on an approved one. `base` is what is left before
 * any request: a bill's outstanding, or an order's value less advances already asked for (the API checks again).
 */
export function TargetRequests({ target, base, approved }: { target: Omit<RequestFor, 'open'>; base: string; approved: boolean }) {
  const { user } = useAuth();
  const [asking, setAsking] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [paying, setPaying] = useState<PaymentRequestDto | null>(null);
  const visible = approved && !!user && canViewPaymentRequests(user.roleKey);
  const filter = {
    vendorBillId: target.vendorBillId,
    subcontractBillId: target.subcontractBillId,
    purchaseOrderId: target.purchaseOrderId,
    workOrderId: target.workOrderId,
  };
  const { data } = usePaymentRequests({ ...filter, pageSize: 50, sortBy: 'requestNo', sortOrder: 'asc' }, visible);
  if (!visible) return null;
  const rows = data?.items ?? [];
  const bill = target.kind === 'BILL';
  // An advance's base already leaves out what was asked for; a bill's outstanding does not leave out open requests.
  const open = Math.max(toNumber(base) - (bill ? rows.reduce((n, r) => n + holding(r), 0) : 0), 0);
  const accounts = canRecordPayment(user.roleKey);
  const asker = canRequestPayment(user.roleKey);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Typography.Text>
          {open > 0 ? (
            <>
              Up to {formatINR(open, true)} can still be asked for
              {bill ? '' : ' as an advance'}.
            </>
          ) : bill ? (
            'Requests cover all that is unpaid.'
          ) : (
            'Advances asked for cover the order value.'
          )}
        </Typography.Text>
        {asker && open > 0 ? (
          <Button size="small" onClick={() => setAsking(true)}>
            {bill ? 'Request payment' : 'Request advance'}
          </Button>
        ) : null}
      </div>
      <Table<PaymentRequestDto>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 560 }}
        locale={{
          emptyText: bill ? 'No payment requested yet' : 'No advance requested yet',
        }}
        columns={[
          {
            title: 'Request',
            dataIndex: 'requestNo',
            width: 150,
            render: (v: string, r) => (
              <RecordLink href={`/payment-requests/${r.id}`} onOpen={() => setOpened(r.id)} className="mono">
                {v}
              </RecordLink>
            ),
          },
          {
            title: 'Asked on',
            dataIndex: 'createdAt',
            width: 110,
            render: (v: string) => formatDate(v.slice(0, 10)),
          },
          {
            title: 'Amount',
            dataIndex: 'amount',
            width: 130,
            align: 'right',
            render: (v) => (
              <strong className="mono" translate="no">
                {formatINR(v, true)}
              </strong>
            ),
          },
          {
            title: 'Status',
            key: 'status',
            render: (_, r) => (
              <span>
                <StatusTag status={r.status} /> <RequestPaidTag request={r} />
              </span>
            ),
          },
          ...(accounts
            ? [
                {
                  title: '',
                  key: 'pay',
                  width: 80,
                  render: (_: unknown, r: PaymentRequestDto) =>
                    r.status === 'APPROVED' && toNumber(r.outstanding) > 0 ? (
                      <Button size="small" type="primary" onClick={() => setPaying(r)}>
                        Pay
                      </Button>
                    ) : null,
                },
              ]
            : []),
        ]}
      />
      <PaymentRequestFormModal open={asking} target={{ ...target, open: String(open) }} onClose={() => setAsking(false)} />
      <PaymentRequestDrawer id={opened} open={!!opened} onClose={() => setOpened(null)} />
      <PayRequestModal request={paying} onClose={() => setPaying(null)} />
    </>
  );
}

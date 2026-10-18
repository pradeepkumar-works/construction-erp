'use client';

import React, { useState } from 'react';
import { Button, Divider, Space, Table, Tag, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VendorPaymentDto } from '@erp/shared';
import { RECEIPT_MODE_LABELS, canRecordPayment, canViewPayables } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useVendorPayments } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { PAYMENT_QUERY_KEYS, PaymentFormModal, type PayTarget } from './PaymentFormModal';
import { InTallyTag } from '@/components/tally/InTallyTag';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

/** Tag for how much of an approved bill is paid. */
export function PaidTag({ bill }: { bill: { status: string; paidAmount: string; outstanding: string; paidDate: string | null } }) {
  if (bill.status !== 'APPROVED') return null;
  if (bill.paidDate) return <Tag color="green" style={{ margin: 0 }}>Paid</Tag>;
  if (toNumber(bill.paidAmount) > 0) return <Tag color="gold" style={{ margin: 0 }}>Part paid</Tag>;
  return <Tag style={{ margin: 0 }}>Unpaid</Tag>;
}

/**
 * Payments against one approved bill, with "Record payment" for accounts. Shown in the vendor and subcontractor bill
 * records; `heading={false}` when the record's section already titles it.
 */
export function BillPayments({ target, approved, heading = true }: { target: PayTarget & { paidAmount: string }; approved: boolean; heading?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState<VendorPaymentDto | null>(null);
  const visible = approved && !!user && canViewPayables(user.roleKey);
  const filter = target.billType === 'VENDOR_BILL' ? { vendorBillId: target.billId } : { subcontractBillId: target.billId };
  const { data } = useVendorPayments({ ...filter, pageSize: 100, sortBy: 'paymentDate', sortOrder: 'asc' }, visible);
  const accounts = !!user && canRecordPayment(user.roleKey);
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/vendor-payments/${id}`)).data,
    onSuccess: () => {
      for (const k of PAYMENT_QUERY_KEYS) qc.invalidateQueries({ queryKey: [k] });
    },
    meta: FAIL_NOTICE,
  });
  if (!visible) return null;
  const outstanding = toNumber(target.outstanding);

  return (
    <>
      {heading && (
        <Divider titlePlacement="start" plain>
          Payments ({data?.total ?? 0})
        </Divider>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <Typography.Text>
          Paid {formatINR(target.paidAmount, true)} of {formatINR(target.payable, true)} ·{' '}
          {outstanding > 0 ? (
            <strong>
              {formatINR(outstanding, true)} outstanding, due {formatDate(target.dueDate)}
            </strong>
          ) : (
            <Typography.Text type="success">settled</Typography.Text>
          )}
        </Typography.Text>
        {accounts && outstanding > 0 ? (
          <Button size="small" type="primary" onClick={() => setPaying(true)}>
            Record payment
          </Button>
        ) : null}
      </div>
      <Table<VendorPaymentDto>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data?.items ?? []}
        locale={{ emptyText: 'Nothing paid yet' }}
        columns={[
          { title: 'Date', dataIndex: 'paymentDate', width: 110, render: (v) => formatDate(v) },
          { title: 'Paid', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong className="mono" translate="no">{formatINR(v, true)}</strong> },
          { title: 'Deducted', key: 'ded', width: 120, align: 'right', render: (_, p) => <span className="mono" translate="no">{formatINR(toNumber(p.tdsAmount) + toNumber(p.otherDeduction), true)}</span> },
          {
            title: 'Mode / reference',
            key: 'ref',
            render: (_, p) => (
              <span>
                {RECEIPT_MODE_LABELS[p.mode]}
                {p.reference ? <span className="mono text-muted" translate="no"> · {p.reference}</span> : null}
              </span>
            ),
          },
          ...(accounts
            ? [
                {
                  title: '',
                  key: 'x',
                  width: 130,
                  render: (_: unknown, p: VendorPaymentDto) =>
                    p.exportedToTally ? (
                      <InTallyTag />
                    ) : (
                      <Space size={4}>
                        <Button size="small" onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                        <ConfirmDelete what={`the payment of ${formatINR(p.amount)} on ${formatDate(p.paymentDate)}`} notice="Payment deleted" description="The bill goes back to outstanding." onConfirm={() => remove.mutateAsync(p.id)}>
                          <Button size="small" danger>
                            Delete
                          </Button>
                        </ConfirmDelete>
                      </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <PaymentFormModal open={paying || !!editing} bill={paying ? target : null} payment={editing} onClose={() => (setPaying(false), setEditing(null))} />
    </>
  );
}

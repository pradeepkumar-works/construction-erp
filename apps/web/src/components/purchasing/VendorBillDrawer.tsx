'use client';

import React from 'react';
import Link from 'next/link';
import { Alert, App, Button, Card, Divider, Popconfirm, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VendorBillDto, VendorBillLineDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, canEditSubmission, canRecordVendorBill, canResubmit, canViewPayables } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useVendorBill } from '@/lib/queries';
import { formatDate, formatINR, formatQty, toNumber } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { BillPayments, PaidTag } from '@/components/payables/BillPayments';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';

const money = (v: string | number) => <span className="mono">{formatINR(v, true)}</span>;

export const MatchTag = ({ matched }: { matched: boolean }) => (matched ? <Tag color="green" style={{ margin: 0 }}>Matches PO</Tag> : <Tag color="red" style={{ margin: 0 }}>Exceptions</Tag>);

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

/** A vendor bill with its three-way match against the purchase order and the GRNs, in a drawer or at `/vendor-bills/<id>`. */
export function VendorBillRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useVendorBill(id ?? undefined);
  const recorder = !!user && canRecordVendorBill(user.roleKey);

  const done = (text: string) => {
    message.success(text);
    qc.invalidateQueries({ queryKey: ['vendor-bills'] });
    qc.invalidateQueries({ queryKey: ['purchase-orders'] });
  };
  const submit = useMutation({
    mutationFn: async () => (await api.post<VendorBillDto>(`/vendor-bills/${id}/submit`)).data,
    onSuccess: (b) => done(`${b.billNo} submitted for approval`),
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/vendor-bills/${id}`)).data,
    onSuccess: () => {
      done('Vendor bill deleted');
      onClose?.();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const editable = !!data && !!user && recorder && canEditSubmission(user, data) && data.status !== 'APPROVED';
  const late = data ? overdueDays(data) : null;
  const payments = data?.status === 'APPROVED' && !!user && canViewPayables(user.roleKey);

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={980}
      kind="Vendor bill"
      list={{ href: '/vendor-bills', label: 'Vendor Bills' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/vendor-bills/${data.id}`,
          title: `${data.billNo} · ${data.vendorName}`,
          tags: (
            <>
              <StatusTag status={data.status} /> <MatchTag matched={data.matched} /> <PaidTag bill={data} />
            </>
          ),
          notices: data.matched ? (
            <Alert type="success" showIcon style={{ marginBottom: 12 }} title="Matches the purchase order and what was received" />
          ) : (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              title="Does not match the purchase order and what was received"
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.exceptions.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              }
            />
          ),
          facts: [
            {
              key: 'vendor',
              label: 'Vendor',
              span: 2,
              children: (
                <span>
                  {data.vendorName}
                  {data.vendorGstin && <span className="text-muted"> · GSTIN {data.vendorGstin}</span>}
                  {data.vendorMsme && <Tag color={data.vendorMsme === 'MEDIUM' ? 'default' : 'orange'} style={{ marginLeft: 8 }}>{MSME_CATEGORY_LABELS[data.vendorMsme]}</Tag>}
                </span>
              ),
            },
            { key: 'po', label: 'Purchase order', children: <Link href={`/purchase-orders/${data.purchaseOrderId}`}>{data.poNo}</Link> },
            { key: 'invoice', label: 'Invoice', children: `${data.invoiceNo}, ${formatDate(data.invoiceDate)}` },
            { key: 'total', label: 'Invoice total', children: <strong>{money(data.total)}</strong> },
            {
              key: 'due',
              label: 'Due',
              children: (
                <span>
                  {formatDate(data.dueDate)} {late ? <Tag color="red">{late} days overdue</Tag> : null}
                </span>
              ),
            },
            { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}`}>{data.projectName}</Link> },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status' && i.key !== 'project'),
          ],
          lifecycle: submissionLifecycle(data, [
            { title: 'Paid', done: !!data.paidDate, content: data.status !== 'APPROVED' ? undefined : data.paidDate ? formatDate(data.paidDate) : `${formatINR(data.outstanding, true)} to pay` },
          ]),
          sections: [
            {
              key: 'items',
              title: 'Items, matched against the PO and GRNs',
              count: data.lines.length,
              children: (
                <>
                  <Table<VendorBillLineDto>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={data.lines}
                    scroll={{ x: 950 }}
                    columns={[
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
                      { title: 'Received', dataIndex: 'receivedQty', width: 90, align: 'right', render: (v) => <span className="mono">{formatQty(v)}</span> },
                      { title: 'On other bills', dataIndex: 'billedElsewhere', width: 110, align: 'right', render: (v) => <span className="mono">{formatQty(v)}</span> },
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
                            {v !== l.poRate && <div className="text-muted mono" style={{ fontSize: 11 }}>PO {formatINR(l.poRate, true)}</div>}
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
                    ]}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <Card size="small" style={{ width: 320 }}>
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
                    </Card>
                  </div>
                </>
              ),
            },
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
                          payable: data.total,
                          outstanding: data.outstanding,
                          paidAmount: data.paidAmount,
                        }}
                      />
                    ),
                  },
                ]
              : []),
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
              {editable ? (
                <Popconfirm title={`Delete ${data.billNo}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate()}>
                  <Button size={size} danger loading={remove.isPending}>
                    Delete
                  </Button>
                </Popconfirm>
              ) : null}
            </>
          ),
        }
      }
    />
  );
}

export function VendorBillDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <VendorBillRecord mode="drawer" {...props} />;
}

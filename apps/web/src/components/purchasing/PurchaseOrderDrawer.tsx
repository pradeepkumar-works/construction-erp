'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Card, Descriptions, Divider, Drawer, Form, Input, Modal, Popconfirm, Progress, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { ImportOutlined, PrinterOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PurchaseOrderDto, PurchaseOrderLineDto } from '@erp/shared';
import { MSME_CATEGORY_LABELS, canEditSubmission, canKeepStock, canPurchase, canRecordVendorBill, canResubmit, canViewVendorBills } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePurchaseOrder } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, formatQty, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { ReceiptModal } from '@/components/stock/ReceiptModal';
import { VendorBillFormModal } from './VendorBillFormModal';
import { openPoPrint } from './poPrint';

const money = (v: string | number) => <span className="mono">{formatINR(v, true)}</span>;

/** Tag for where an approved order stands: open, fully received or closed short. */
export function PoStateTag({ order }: { order: Pick<PurchaseOrderDto, 'status' | 'closedAt' | 'open'> }) {
  if (order.status !== 'APPROVED') return null;
  if (order.closedAt) return <Tag style={{ margin: 0 }}>Closed</Tag>;
  return order.open ? <Tag color="blue" style={{ margin: 0 }}>Open</Tag> : <Tag color="green" style={{ margin: 0 }}>Received</Tag>;
}

/** A purchase order: lines with what is received and billed, approval, print, GRNs and vendor bills against it. */
export function PurchaseOrderDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (o: PurchaseOrderDto) => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = usePurchaseOrder(id ?? undefined);
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
    onError: (e) => message.error(errorMessage(e)),
  });
  const close = useMutation({
    mutationFn: async (note: string) => (await api.post<PurchaseOrderDto>(`/purchase-orders/${id}/close`, { note })).data,
    onSuccess: (o) => {
      done(`${o.poNo} closed`);
      setClosing(false);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/purchase-orders/${id}`)).data,
    onSuccess: () => {
      done('Purchase order deleted');
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const editable = !!data && !!user && buyer && canEditSubmission(user, data) && data.status !== 'APPROVED';
  const approved = data?.status === 'APPROVED';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1000}
      title={
        data ? (
          <Space wrap>
            {data.poNo} · {data.vendorName} <StatusTag status={data.status} /> <PoStateTag order={data} />
          </Space>
        ) : (
          'Purchase order'
        )
      }
      extra={
        data ? (
          <Space wrap>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => !openPoPrint(data, user?.organizationName ?? '') && message.warning('Pop-up blocked. Allow pop-ups to print the order.')}>
              Print
            </Button>
            {editable && data.status === 'DRAFT' && user && canResubmit(user, data) ? (
              <Button size="small" type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
                Submit for approval
              </Button>
            ) : null}
            {editable && data.status === 'DRAFT' ? (
              <Button size="small" onClick={() => onEdit?.(data)}>
                Edit
              </Button>
            ) : (
              buyer && <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
            )}
            <ReviewActions type="purchase_order" id={data.id} status={data.status} amount={data.total} size="small" />
            {data.open && user && canKeepStock(user.roleKey) ? (
              <Button size="small" type="primary" icon={<ImportOutlined />} onClick={() => setReceiving(true)}>
                Receive material
              </Button>
            ) : null}
            {approved && user && canRecordVendorBill(user.roleKey) ? (
              <Button size="small" onClick={() => setBilling(true)}>
                Record vendor bill
              </Button>
            ) : null}
            {data.open && buyer ? (
              <Button
                size="small"
                onClick={() => {
                  closeForm.resetFields();
                  setClosing(true);
                }}
              >
                Close short
              </Button>
            ) : null}
            {editable ? (
              <Popconfirm title={`Delete ${data.poNo}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate()}>
                <Button size="small" danger loading={remove.isPending}>
                  Delete
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          {data.status === 'DRAFT' && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Draft: check the items and rates, then submit it for approval. Print it for the vendor once it is approved." />}
          {data.closedAt && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={`Closed on ${formatDateTime(data.closedAt)}`} description={data.closeNote ?? undefined} />
          )}
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 3 }}
            bordered
            items={[
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
              { key: 'date', label: 'PO date', children: formatDate(data.poDate) },
              { key: 'project', label: 'Project', span: 2, children: <Link href={`/projects/${data.projectId}`}>{data.projectName}</Link> },
              { key: 'mr', label: 'Material request', children: data.requestNo ? <Link href={`/material-requests?id=${data.materialRequestId}`}>{data.requestNo}</Link> : '-' },
              { key: 'deliver', label: 'Deliver by', children: data.deliveryBy ? formatDate(data.deliveryBy) : '-' },
              { key: 'address', label: 'Delivery address', children: data.deliveryAddress ?? '-' },
              { key: 'pay', label: 'Payment', children: data.paymentTerms ?? (data.paymentDays !== null ? `${data.paymentDays} days from invoice` : '-') },
              ...(approved ? [{ key: 'recv', label: 'Received', span: 3, children: <Progress percent={data.receivedPct} size="small" style={{ maxWidth: 320, margin: 0 }} /> }] : []),
              ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks, span: 3 }] : []),
              ...submissionMetaItems(data).filter((i) => i.key !== 'status' && i.key !== 'project'),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Items
          </Divider>
          <Table<PurchaseOrderLineDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.lines}
            scroll={{ x: 900 }}
            columns={[
              { title: 'Item', render: (_, l) => <div>{l.itemName}{l.specification && <div className="text-muted" style={{ fontSize: 12 }}>{l.specification}</div>}</div> },
              { title: 'Quantity', dataIndex: 'quantity', width: 120, align: 'right', render: (v, l) => <span className="mono">{formatQty(v)} {l.unit}</span> },
              { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v) => money(v) },
              { title: 'GST', dataIndex: 'gstRate', width: 60, align: 'right', render: (v) => `${v}%` },
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
                    { title: 'Billed', dataIndex: 'billedQty', width: 90, align: 'right' as const, render: (v: string) => <span className="mono">{formatQty(v)}</span> },
                  ]
                : []),
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
                <span>Order total</span>
                {money(data.total)}
              </div>
            </Card>
          </div>
          {approved && (
            <>
              <Divider titlePlacement="start" plain>
                GRNs ({data.grns?.length ?? 0})
              </Divider>
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
              {user && canViewVendorBills(user.roleKey) && (
                <>
                  <Divider titlePlacement="start" plain>
                    Vendor bills ({data.bills?.length ?? 0})
                  </Divider>
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={data.bills ?? []}
                    locale={{ emptyText: 'No bill recorded yet' }}
                    columns={[
                      { title: 'Bill', dataIndex: 'billNo', width: 140, render: (v, b) => <Link href={`/vendor-bills?id=${b.id}`} className="mono">{v}</Link> },
                      { title: 'Invoice', dataIndex: 'invoiceNo', render: (v, b) => `${v}, ${formatDate(b.invoiceDate)}` },
                      { title: 'Total', dataIndex: 'total', width: 140, align: 'right', render: (v) => money(v) },
                      { title: 'Match', dataIndex: 'matched', width: 110, render: (v) => (v ? <Tag color="green">Matches</Tag> : <Tag color="red">Exceptions</Tag>) },
                      { title: 'Status', dataIndex: 'status', width: 130, render: (s) => <StatusTag status={s} /> },
                    ]}
                  />
                </>
              )}
            </>
          )}
          <Divider titlePlacement="start" plain>
            Documents ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            Audit trail
          </Divider>
          <AuditTrail type="purchase_order" id={data.id} />
        </>
      )}
      <Modal
        open={closing}
        title={data ? `Close ${data.poNo} short` : 'Close order'}
        okText="Close order"
        onCancel={() => setClosing(false)}
        onOk={async () => close.mutate((await closeForm.validateFields()).note)}
        confirmLoading={close.isPending}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">Nothing more can be received against it, and what was not received can be ordered again. What was received can still be billed.</Typography.Paragraph>
        <Form form={closeForm} layout="vertical">
          <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why the balance is not needed' }]}>
            <Input.TextArea rows={2} maxLength={500} placeholder="Balance not required; vendor informed" />
          </Form.Item>
        </Form>
      </Modal>
      <ReceiptModal open={receiving} onClose={() => setReceiving(false)} projectId={data?.projectId} purchaseOrderId={data?.id} />
      <VendorBillFormModal open={billing} purchaseOrderId={data?.id} onClose={() => setBilling(false)} />
    </Drawer>
  );
}

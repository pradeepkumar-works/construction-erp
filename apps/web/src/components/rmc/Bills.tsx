'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Drawer, Input, Popconfirm, Segmented, Space, Table, Typography } from 'antd';
import { FileDoneOutlined, PayCircleOutlined } from '@/components/common/icons';
import type { RmcInvoiceDto, RmcReceiptDto } from '@erp/shared';
import { PAYMENT_MODE_LABELS, canBillRmc, type PaymentMode } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useRmcAction, useRmcInvoices, useRmcReceipts } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDate, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { InvoiceStatusTag, M3, PlantFilter, Rupees, usePlantScope } from './rmcUi';
import { InvoiceForm, ReceiptForm } from './MoneyForms';

/** A bill with its challans, GST and what has been received against it. */
function InvoiceDrawer({ invoice, onClose, onReceive }: { invoice: RmcInvoiceDto | null; onClose: () => void; onReceive: (i: RmcInvoiceDto) => void }) {
  const { message } = App.useApp();
  const act = useRmcAction<RmcInvoiceDto>();
  const i = invoice;
  return (
    <Drawer
      open={!!i}
      onClose={onClose}
      size={640}
      title={i ? <span translate="no">{i.invoiceNo}</span> : 'Bill'}
      extra={
        i ? (
          <Space wrap>
            {i.canReceive && (
              <Button size="small" type="primary" icon={<PayCircleOutlined />} onClick={() => onReceive(i)}>
                Money received
              </Button>
            )}
            {i.canCancel && (
              <Popconfirm
                title={`Cancel ${i.invoiceNo}?`}
                description="Its challans go back to waiting for a bill."
                okText="Cancel bill"
                cancelText="Keep"
                onConfirm={async () => {
                  try {
                    await act.mutateAsync({ path: `/rmc/invoices/${i.id}/cancel`, body: {} });
                    message.success(`${i.invoiceNo} cancelled`);
                    onClose();
                  } catch (e) {
                    message.error(errorMessage(e));
                  }
                }}
              >
                <Button size="small" danger>
                  Cancel bill
                </Button>
              </Popconfirm>
            )}
          </Space>
        ) : null
      }
    >
      {i && (
        <>
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 's', label: 'Status', children: <InvoiceStatusTag status={i.status} /> },
              { key: 'c', label: 'Customer', children: <span translate="no">{`${i.customer}${i.gstin ? `, GSTIN ${i.gstin}` : ''}`}</span> },
              { key: 'o', label: 'Order', children: <span translate="no">{i.orderNo ?? NO_VALUE}</span> },
              { key: 'd', label: 'Date', children: formatDate(i.date) },
              { key: 'q', label: 'Concrete', children: <span translate="no"><M3 value={i.quantity} />{', '}<Rupees value={i.concrete} /></span> },
              ...(Number(i.pumping) ? [{ key: 'p', label: 'Pumping', children: <Rupees value={i.pumping} /> }] : []),
              { key: 't', label: 'Taxable', children: <Rupees value={i.taxable} /> },
              ...(Number(i.igst) ? [{ key: 'ig', label: 'IGST 18%', children: <Rupees value={i.igst} /> }] : [{ key: 'cg', label: 'CGST 9%', children: <Rupees value={i.cgst} /> }, { key: 'sg', label: 'SGST 9%', children: <Rupees value={i.sgst} /> }]),
              { key: 'tot', label: 'Total', children: <Typography.Text strong><Rupees value={i.total} /></Typography.Text> },
              { key: 'r', label: 'Received', children: <Rupees value={i.received} /> },
              { key: 'due', label: 'Due', children: <Rupees value={i.due} /> },
            ]}
          />
          <Typography.Title level={2} style={{ fontSize: 16, marginTop: 16 }}>
            Challans
          </Typography.Title>
          <Table
            rowKey="batchId"
            size="small"
            pagination={false}
            dataSource={i.challans}
            columns={[
              { title: 'Challan', dataIndex: 'batchNo', render: (n: string) => <span translate="no">{n}</span> },
              { title: 'Date', dataIndex: 'date', render: (d: string) => formatDate(d) },
              { title: 'Grade', dataIndex: 'grade', render: (g: string) => <span translate="no">{g}</span> },
              { title: 'Quantity', dataIndex: 'quantity', align: 'right', render: (q: string) => <M3 value={q} /> },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}

/** Bills to RMC customers and the money they paid; accounts bill delivered challans from here. */
export function Bills() {
  const { user } = useAuth();
  const bill = !!user && canBillRmc(user.roleKey);
  const [plantId] = usePlantScope();
  const [due, setDue] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);
  const [receiving, setReceiving] = useState<RmcInvoiceDto | null | 'free'>(null);
  const { data, isLoading, isFetching, error, refetch } = useRmcInvoices({ plantId, due: due || undefined, q: q || undefined, page, pageSize: 50 });
  const { data: receipts } = useRmcReceipts({ pageSize: 20 }, bill);
  const opened = data?.items.find((i) => i.id === open) ?? null;
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Space wrap>
          <Segmented
            aria-label="Which bills"
            value={due ? 'due' : 'all'}
            onChange={(v) => (setDue(v === 'due'), setPage(1))}
            options={[
              { value: 'all', label: 'All' },
              { value: 'due', label: 'With money due' },
            ]}
          />
          <PlantFilter />
          <Input.Search allowClear placeholder="Bill, customer or order" aria-label="Search bills" onSearch={(v) => (setQ(v.trim()), setPage(1))} style={{ width: 230 }} />
        </Space>
        {bill && (
          <Space wrap>
            <Button icon={<PayCircleOutlined />} onClick={() => setReceiving('free')}>
              Money received
            </Button>
            <Button type="primary" icon={<FileDoneOutlined />} onClick={() => setBilling(true)}>
              Bill challans
            </Button>
          </Space>
        )}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<RmcInvoiceDto>
          rowKey="id"
          size="small"
          loading={isLoading || isFetching}
          dataSource={data?.items ?? []}
          scroll={{ x: 960 }}
          locale={{ emptyText: due ? 'Every bill is paid' : 'No bills yet' }}
          pagination={{ current: page, pageSize: 50, total: data?.total ?? 0, onChange: setPage, hideOnSinglePage: true, showSizeChanger: false }}
          onRow={(i) => ({ onClick: () => setOpen(i.id), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Bill', dataIndex: 'invoiceNo', width: 150, render: (n: string) => <span translate="no">{n}</span> },
            { title: 'Date', dataIndex: 'date', width: 110, render: (d: string) => formatDate(d) },
            { title: 'Customer', dataIndex: 'customer', ellipsis: true, render: (c: string) => <span translate="no">{c}</span> },
            { title: 'Concrete', dataIndex: 'quantity', align: 'right', width: 100, render: (q: string) => <M3 value={q} /> },
            { title: 'Total', dataIndex: 'total', align: 'right', width: 140, render: (v: string) => <Rupees value={v} /> },
            { title: 'Due', dataIndex: 'due', align: 'right', width: 140, render: (v: string) => <Rupees value={v} /> },
            { title: 'Status', dataIndex: 'status', width: 110, render: (s: RmcInvoiceDto['status']) => <InvoiceStatusTag status={s} /> },
          ]}
        />
      )}
      {bill && (
        <>
          <Typography.Title level={2} style={{ fontSize: 16, marginTop: 20 }}>
            Money received
          </Typography.Title>
          <Table<RmcReceiptDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={receipts?.items ?? []}
            scroll={{ x: 760 }}
            locale={{ emptyText: 'Nothing received yet' }}
            columns={[
              { title: 'Date', dataIndex: 'date', width: 110, render: (d: string) => formatDate(d) },
              { title: 'Customer', dataIndex: 'customer', ellipsis: true, render: (c: string) => <span translate="no">{c}</span> },
              { title: 'Against', dataIndex: 'invoiceNo', width: 150, render: (n: string | null) => <span translate="no">{n ?? 'On account'}</span> },
              { title: 'Payment mode', dataIndex: 'mode', width: 110, render: (m: string) => PAYMENT_MODE_LABELS[m as PaymentMode] ?? m },
              { title: 'Reference', dataIndex: 'reference', width: 200, ellipsis: true, render: (r: string | null) => <span translate="no">{r ?? NO_VALUE}</span> },
              { title: 'Amount', dataIndex: 'amount', align: 'right', width: 140, render: (v: string) => <Rupees value={v} /> },
            ]}
          />
        </>
      )}
      <InvoiceDrawer invoice={opened} onClose={() => setOpen(null)} onReceive={(i) => setReceiving(i)} />
      <InvoiceForm open={billing} onClose={() => setBilling(false)} />
      <ReceiptForm open={!!receiving} invoice={receiving === 'free' ? null : receiving} onClose={() => setReceiving(null)} />
    </div>
  );
}

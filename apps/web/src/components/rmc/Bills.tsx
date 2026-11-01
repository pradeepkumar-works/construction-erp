'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Drawer, Popconfirm, Segmented, Space, Table, Typography } from 'antd';
import { FileDoneOutlined, PayCircleOutlined } from '@/components/common/icons';
import type { RmcInvoiceDto, RmcReceiptDto } from '@erp/shared';
import { PAYMENT_MODE_LABELS, canBillRmc, type PaymentMode } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useRmcAction, useRmcInvoices, useRmcReceipts } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDate, NO_VALUE } from '@/lib/format';
import { tk } from '@/ds';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { InvoiceStatusTag, M3, PlantFilter, usePlantScope } from './rmcUi';
import { InvoiceForm, ReceiptForm } from './MoneyForms';
import { Money } from '@/components/common/Money';

const KEYS = ['due'] as const;

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
              { key: 'q', label: 'Concrete', children: <span translate="no"><M3 value={i.quantity} />{', '}<Money paise value={i.concrete} /></span> },
              ...(Number(i.pumping) ? [{ key: 'p', label: 'Pumping', children: <Money paise value={i.pumping} /> }] : []),
              { key: 't', label: 'Taxable', children: <Money paise value={i.taxable} /> },
              ...(Number(i.igst) ? [{ key: 'ig', label: 'IGST 18%', children: <Money paise value={i.igst} /> }] : [{ key: 'cg', label: 'CGST 9%', children: <Money paise value={i.cgst} /> }, { key: 'sg', label: 'SGST 9%', children: <Money paise value={i.sgst} /> }]),
              { key: 'tot', label: 'Total', children: <Typography.Text strong><Money paise value={i.total} /></Typography.Text> },
              { key: 'r', label: 'Received', children: <Money paise value={i.received} /> },
              { key: 'due', label: 'Due', children: <Money paise value={i.due} /> },
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
  const [open, setOpen] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);
  const [receiving, setReceiving] = useState<RmcInvoiceDto | null | 'free'>(null);
  const frame = useListFrame<'date', RmcInvoiceDto>({
    list: 'rmc-bills',
    url: false,
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: ['date'],
    columns: (): ListColumn<RmcInvoiceDto>[] => [
      { key: 'invoiceNo', title: 'Bill', dataIndex: 'invoiceNo', width: 150, locked: true, render: (n: string) => <span translate="no">{n}</span> },
      { key: 'date', title: 'Date', dataIndex: 'date', width: 110, render: (d: string) => formatDate(d) },
      { key: 'customer', title: 'Customer', dataIndex: 'customer', ellipsis: true, card: 'meta', render: (c: string) => <span translate="no">{c}</span> },
      { key: 'quantity', title: 'Concrete', dataIndex: 'quantity', align: 'right', width: 100, render: (q: string) => <M3 value={q} /> },
      { key: 'total', title: 'Total', dataIndex: 'total', align: 'right', width: 140, render: (v: string) => <Money paise value={v} /> },
      { key: 'due', title: 'Due', dataIndex: 'due', align: 'right', width: 140, render: (v: string) => <Money paise value={v} /> },
      { key: 'status', title: 'Status', dataIndex: 'status', width: 110, render: (s: RmcInvoiceDto['status']) => <InvoiceStatusTag status={s} /> },
    ],
  });
  const { page } = frame;
  const due = page.filters.due === '1';
  const { data, isLoading, isFetching, error, refetch } = useRmcInvoices({ plantId, due: due || undefined, q: page.params.q, page: page.params.page, pageSize: page.params.pageSize });
  const { data: receipts } = useRmcReceipts({ pageSize: 20 }, bill);
  const opened = data?.items.find((i) => i.id === open) ?? null;
  return (
    <div style={{ padding: tk.space[4] }}>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        filters={frame.filterState}
        onProject={frame.setProjectFilter}
        hideProject
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Bill, customer or order"
        searchLabel="Search bills"
        extra={
          bill ? (
            <>
              <Button icon={<PayCircleOutlined />} onClick={() => setReceiving('free')}>
                Money received
              </Button>
              <Button type="primary" icon={<FileDoneOutlined />} onClick={() => setBilling(true)}>
                Bill challans
              </Button>
            </>
          ) : null
        }
      >
        <Segmented
          aria-label="Which bills"
          value={due ? 'due' : 'all'}
          onChange={(v) => page.setFilter('due', v === 'due' ? '1' : null)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'due', label: 'With money due' },
          ]}
        />
        <PlantFilter />
      </ListToolbar>
      <DataTable<RmcInvoiceDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<RmcInvoiceDto>(data?.total)}
        onOpen={setOpen}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={960}
        emptyText={<EmptyArt art="entries" title={due ? 'Every bill is paid' : 'No bills yet'} />}
      />
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
              { title: 'Amount', dataIndex: 'amount', align: 'right', width: 140, render: (v: string) => <Money paise value={v} /> },
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

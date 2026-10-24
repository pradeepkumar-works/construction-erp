'use client';

import React, { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Descriptions, Drawer, Flex, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { AppTabs } from '@/components/common/AppTabs';
import type { SupplierDispatchDto, SupplierOrderDto } from '@erp/shared';
import { useSupplierAction, useSupplierDispatches, useSupplierOrders } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { AcceptForm, DispatchForm } from '@/components/supplier/SupplierForms';
import { AcceptedTag, DispatchStatusTag, Money } from '@/components/supplier/supplierUi';

/** The supplier's orders (purchase and work orders) to accept and send against, and the dispatch notes sent. */
export default function SupplierOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search.get('tab') === 'dispatches' ? 'dispatches' : 'orders';
  const orders = useSupplierOrders();
  const dispatches = useSupplierDispatches();
  const openKey = search.get('open');
  const go = (params: { tab?: string; open?: string | null }) => {
    const next = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  const setOpenKey = (open: string | null) => go({ open });
  const [accepting, setAccepting] = useState<SupplierOrderDto | null>(null);
  const [dispatchFor, setDispatchFor] = useState<string | null | undefined>(undefined);
  const open = openKey ? (orders.data ?? []).find((o) => `${o.kind.toLowerCase()}:${o.id}` === openKey.toLowerCase()) ?? null : null;
  const canSend = (o: SupplierOrderDto) => o.kind === 'PO' && !o.closed && o.lines.some((l) => Number(l.toSend) > 0);
  const newDispatch = (
    <Button type="primary" onClick={() => setDispatchFor(null)}>
      Send a dispatch note
    </Button>
  );
  return (
    <div className="page-container">
      <PageHeader title="Orders" subtitle="Purchase and work orders raised on you. Accept each one, and send a dispatch note with every truck so the site can receive it." />
      {orders.error && <QueryError error={orders.error} onRetry={() => orders.refetch()} />}
      {orders.isLoading ? (
        <PageSkeleton header={false} />
      ) : (
        <AppTabs
          activeKey={tab}
          onChange={(k) => go({ tab: k, open: null })}
          extra={newDispatch}
          items={[
            {
              key: 'orders',
              label: 'Orders',
              children: (
                <Table<SupplierOrderDto>
                  rowKey="id"
                  size="small"
                  dataSource={orders.data ?? []}
                  locale={{ emptyText: 'No orders raised on you yet' }}
                  scroll={{ x: 900 }}
                  pagination={{ pageSize: 25, hideOnSinglePage: true }}
                  columns={[
                    { title: 'Order', dataIndex: 'number', width: 140, render: (v: string) => <span translate="no">{v}</span> },
                    { title: 'Site', dataIndex: 'projectName', render: (v: string, o) => <span translate="no">{o.kind === 'WO' ? `${v}: ${o.title}` : v}</span> },
                    { title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
                    { title: 'Due by', dataIndex: 'dueBy', width: 110, render: (v: string | null) => formatDate(v) },
                    { title: 'Value', dataIndex: 'amount', width: 140, align: 'right', render: (v: string) => <Money value={v} /> },
                    { title: 'State', key: 'state', width: 120, render: (_, o) => (o.closed ? <AppTag>Closed</AppTag> : <AcceptedTag acceptedAt={o.acceptedAt} />) },
                    {
                      title: 'Action',
                      key: 'action',
                      width: 90,
                      render: (_, o) => (
                        <Button size="small" onClick={() => setOpenKey(`${o.kind.toLowerCase()}:${o.id}`)} aria-label={`Open ${o.number}`}>
                          Open
                        </Button>
                      ),
                    },
                  ]}
                />
              ),
            },
            { key: 'dispatches', label: 'Dispatch notes', children: <Dispatches list={dispatches} /> },
          ]}
        />
      )}
      <OrderDrawer order={open} onClose={() => setOpenKey(null)} onAccept={setAccepting} onDispatch={(o) => setDispatchFor(o.id)} canSend={open ? canSend(open) : false} />
      <AcceptForm order={accepting} onClose={() => setAccepting(null)} />
      <DispatchForm open={dispatchFor !== undefined} orderId={dispatchFor} onClose={() => setDispatchFor(undefined)} />
    </div>
  );
}

function OrderDrawer({ order, onClose, onAccept, onDispatch, canSend }: { order: SupplierOrderDto | null; onClose: () => void; onAccept: (o: SupplierOrderDto) => void; onDispatch: (o: SupplierOrderDto) => void; canSend: boolean }) {
  const o = order;
  return (
    <Drawer
      open={!!o}
      onClose={onClose}
      size={860}
      title={o ? `${o.kind === 'PO' ? 'Purchase order' : 'Work order'} ${o.number}` : 'Order'}
      extra={
        o ? (
          <Flex gap={8} wrap>
            {!o.acceptedAt && !o.closed ? (
              <Button type="primary" onClick={() => onAccept(o)}>
                Accept
              </Button>
            ) : null}
            {canSend ? <Button onClick={() => onDispatch(o)}>Send a dispatch note</Button> : null}
          </Flex>
        ) : null
      }
    >
      {o ? (
        <>
          <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Site">
              <span translate="no">{o.projectName}</span>
            </Descriptions.Item>
            <Descriptions.Item label={o.kind === 'PO' ? 'Deliver to' : 'Work'}>{o.kind === 'PO' ? (o.deliveryAddress ?? '-') : o.title}</Descriptions.Item>
            <Descriptions.Item label="Dated">{formatDate(o.date)}</Descriptions.Item>
            <Descriptions.Item label={o.kind === 'PO' ? 'Deliver by' : 'Finish by'}>{formatDate(o.dueBy)}</Descriptions.Item>
            <Descriptions.Item label={o.kind === 'PO' ? 'Total with GST' : 'Value before GST'}>
              <Money value={o.amount} />
            </Descriptions.Item>
            <Descriptions.Item label="Payment">{o.paymentTerms ?? (o.paymentDays != null ? `${o.paymentDays} days from invoice` : '-')}</Descriptions.Item>
            <Descriptions.Item label="Accepted" span={2}>
              {o.acceptedAt ? `${formatDateTime(o.acceptedAt)} by ${o.acceptedBy ?? 'you'}${o.supplierNote ? `: ${o.supplierNote}` : ''}` : o.closed ? 'Closed' : 'Not yet'}
            </Descriptions.Item>
          </Descriptions>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={o.lines}
            scroll={{ x: 720 }}
            columns={[
              { title: 'Item', dataIndex: 'itemName', render: (v: string, l) => (l.specification ? `${v} (${l.specification})` : v) },
              { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 120, render: (v: string, l) => <span translate="no">{`${formatQty(v)} ${l.unit}`}</span> },
              { title: 'Rate', dataIndex: 'rate', align: 'right', width: 120, render: (v: string) => <Money value={v} /> },
              ...(o.kind === 'PO'
                ? [
                    { title: 'Received', dataIndex: 'received', align: 'right' as const, width: 100, render: (v: string) => <span translate="no">{formatQty(v)}</span> },
                    { title: 'On the way', dataIndex: 'onTheWay', align: 'right' as const, width: 100, render: (v: string) => <span translate="no">{formatQty(v)}</span> },
                    { title: 'Left to send', dataIndex: 'toSend', align: 'right' as const, width: 110, render: (v: string) => <span translate="no">{formatQty(v)}</span> },
                  ]
                : [{ title: 'Amount', dataIndex: 'amount', align: 'right' as const, width: 140, render: (v: string) => <Money value={v} /> }]),
            ]}
          />
        </>
      ) : null}
    </Drawer>
  );
}

function Dispatches({ list }: { list: ReturnType<typeof useSupplierDispatches> }) {
  const { message, modal } = App.useApp();
  const act = useSupplierAction();
  const cancel = (d: SupplierDispatchDto) =>
    modal.confirm({
      title: `Cancel dispatch note ${d.dispatchNo}?`,
      content: 'Only when the truck did not go. The site stops expecting it.',
      okText: 'Cancel the note',
      cancelText: 'Keep it',
      onOk: async () => {
        try {
          await act.mutateAsync({ path: `/supplier/dispatches/${d.id}/cancel` });
          message.success(`${d.dispatchNo} cancelled`);
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });
  return (
    <>
      {list.error && <QueryError error={list.error} onRetry={() => list.refetch()} />}
      <Table<SupplierDispatchDto>
        rowKey="id"
        size="small"
        loading={list.isLoading}
        dataSource={list.data ?? []}
        locale={{ emptyText: 'No dispatch notes sent yet' }}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: 'Challan', dataIndex: 'dispatchNo', width: 140, render: (v: string) => <span translate="no">{v}</span> },
          { title: 'Order', dataIndex: 'poNo', width: 140, render: (v: string) => <span translate="no">{v}</span> },
          { title: 'Sent', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
          { title: 'Vehicle', dataIndex: 'vehicleNo', width: 130, render: (v: string | null) => <span translate="no">{v ?? '-'}</span> },
          {
            title: 'What',
            key: 'lines',
            render: (_, d) => (
              <Typography.Text translate="no">{d.lines.map((l) => `${l.itemName} ${formatQty(l.quantity)} ${l.unit}`).join(', ')}</Typography.Text>
            ),
          },
          { title: 'State', dataIndex: 'status', width: 120, render: (s: SupplierDispatchDto['status'], d) => (d.grn ? <span><DispatchStatusTag status={s} /> <span translate="no">{d.grn.entryNo}</span></span> : <DispatchStatusTag status={s} />) },
          {
            title: 'Action',
            key: 'action',
            width: 100,
            render: (_, d) =>
              d.status === 'ON_THE_WAY' ? (
                <Button size="small" onClick={() => cancel(d)} aria-label={`Cancel ${d.dispatchNo}`}>
                  Cancel
                </Button>
              ) : null,
          },
        ]}
      />
    </>
  );
}

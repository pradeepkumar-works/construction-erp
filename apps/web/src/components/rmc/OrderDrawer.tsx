'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Drawer, Popconfirm, Space, Table, Typography } from 'antd';
import { CarOutlined, CheckOutlined, EditOutlined, FileDoneOutlined, StopOutlined } from '@/components/common/icons';
import type { RmcBatchDto, RmcOrderDto } from '@erp/shared';
import { canBillRmc } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useRmcAction, useRmcBatches, useRmcOrder } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { BatchStatusTag, M3, OrderStatusTag, Rupees } from './rmcUi';
import { OrderForm } from './OrderForm';
import { DispatchForm } from './BatchForms';
import { InvoiceForm } from './MoneyForms';

/** An order with its trucks, and what the caller may do with it. */
export function OrderDrawer({ id, onClose, onBatch }: { id: string | null; onClose: () => void; onBatch?: (id: string) => void }) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const act = useRmcAction<RmcOrderDto>();
  const [editing, setEditing] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [billing, setBilling] = useState(false);
  const { data: order, error, refetch } = useRmcOrder(id);
  const { data: batches, isLoading } = useRmcBatches({ orderId: id ?? undefined, pageSize: 100 }, !!id);
  const run = async (path: string, done: string) => {
    try {
      await act.mutateAsync({ path });
      message.success(done);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const o = order && order.id === id ? order : null;
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={760}
      title={o ? <span translate="no">{o.orderNo}</span> : 'Order'}
      extra={
        o ? (
          <Space wrap>
            {o.canEdit && (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Change
              </Button>
            )}
            {o.canConfirm && (
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => run(`/rmc/orders/${o.id}/confirm`, `${o.orderNo} is now an order`)}>
                Customer accepted
              </Button>
            )}
            {o.canDispatch && (
              <Button size="small" type="primary" icon={<CarOutlined />} onClick={() => setDispatching(true)}>
                Send a truck
              </Button>
            )}
            {user && canBillRmc(user.roleKey) && o.clientId && Number(o.unbilled) > 0 && (
              <Button size="small" icon={<FileDoneOutlined />} onClick={() => setBilling(true)}>
                Bill challans
              </Button>
            )}
            {o.canClose && (
              <Popconfirm title={`Mark ${o.orderNo} completed?`} description="No more trucks go on it." okText="Complete" onConfirm={() => run(`/rmc/orders/${o.id}/close`, `${o.orderNo} completed`)}>
                <Button size="small">Complete</Button>
              </Popconfirm>
            )}
            {o.canEdit && Number(o.delivered) + Number(o.onTheWay) === 0 && (
              <Popconfirm title={`Cancel ${o.orderNo}?`} okText="Cancel order" cancelText="Keep" onConfirm={() => run(`/rmc/orders/${o.id}/cancel`, `${o.orderNo} cancelled`)}>
                <Button size="small" danger icon={<StopOutlined />}>
                  Cancel
                </Button>
              </Popconfirm>
            )}
          </Space>
        ) : null
      }
    >
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {o && (
        <>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2 }}
            items={[
              { key: 's', label: 'Status', children: <OrderStatusTag status={o.status} /> },
              { key: 'c', label: 'Customer', children: <span translate="no">{o.customer}</span> },
              { key: 'p', label: 'Plant', children: <span translate="no">{o.plantName}</span> },
              { key: 'w', label: 'Pour at', children: o.site ?? '-' },
              { key: 'g', label: 'Grade', children: <span translate="no">{`${o.grade} (${o.mixDesignCode})`}</span> },
              { key: 'q', label: 'Quantity', children: <M3 value={o.quantity} /> },
              { key: 'r', label: 'Rate a m³', children: <Rupees value={o.rate} /> },
              { key: 'pr', label: 'Pumping a m³', children: o.pumpRate ? <Rupees value={o.pumpRate} /> : 'Not pumped' },
              { key: 'v', label: 'Worth before GST', children: <Rupees value={o.value} /> },
              { key: 'd', label: 'Date', children: formatDate(o.date) },
              { key: 'pd', label: 'Pour on', children: formatDate(o.pourDate) },
              ...(o.status === 'QUOTED' ? [{ key: 'vu', label: 'Quote valid until', children: formatDate(o.validUntil) }] : []),
              { key: 'dl', label: 'Delivered', children: <M3 value={o.delivered} /> },
              { key: 'ow', label: 'On the way', children: <M3 value={o.onTheWay} /> },
              ...(o.clientId ? [{ key: 'ub', label: 'Delivered, not billed', children: <M3 value={o.unbilled} /> }] : []),
            ]}
          />
          {o.notes && <Typography.Paragraph style={{ marginTop: 12 }}>{o.notes}</Typography.Paragraph>}
          <Typography.Title level={2} style={{ fontSize: 16, marginTop: 16 }}>
            Trucks
          </Typography.Title>
          <Table<RmcBatchDto>
            rowKey="id"
            size="small"
            loading={isLoading}
            pagination={false}
            dataSource={batches?.items ?? []}
            scroll={{ x: 620 }}
            locale={{ emptyText: o.status === 'QUOTED' ? 'Trucks go once the customer accepts the quote' : 'No trucks yet' }}
            onRow={(b) => ({ onClick: () => onBatch?.(b.id), style: onBatch ? { cursor: 'pointer' } : undefined })}
            columns={[
              { title: 'Challan', dataIndex: 'batchNo', width: 140, render: (n: string) => <span translate="no">{n}</span> },
              { title: 'Left the plant', dataIndex: 'dispatchedAt', width: 170, render: (d: string) => formatDateTime(d) },
              { title: 'Truck', dataIndex: 'truck', render: (t: string | null) => <span translate="no">{t ?? '-'}</span> },
              { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 100, render: (q: string) => <M3 value={q} /> },
              { title: 'Status', dataIndex: 'status', width: 120, render: (s: RmcBatchDto['status']) => <BatchStatusTag status={s} /> },
              { title: 'Bill', dataIndex: 'invoiceNo', width: 140, render: (n: string | null) => <span translate="no">{n ?? '-'}</span> },
            ]}
          />
        </>
      )}
      <OrderForm open={editing} order={o} onClose={() => setEditing(false)} />
      <DispatchForm order={dispatching ? o : null} onClose={() => setDispatching(false)} />
      <InvoiceForm open={billing} orderId={o?.id} onClose={() => setBilling(false)} />
    </Drawer>
  );
}

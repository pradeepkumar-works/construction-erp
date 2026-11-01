'use client';

import React, { useState } from 'react';
import { Button, Input, Segmented, Space, Table } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { RmcOrderDto, RmcOrderStatus } from '@erp/shared';
import { canSellRmc } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useRmcOrders } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { M3, OrderStatusTag, PlantFilter, Rupees, usePlantScope } from './rmcUi';
import { OrderForm } from './OrderForm';
import { useRmcDrawers } from './Drawers';

type View = 'open' | 'QUOTED' | 'CONFIRMED' | 'all';

/** Quotes and orders: what each customer wants, what has gone and what is left. */
export function Orders() {
  const { user } = useAuth();
  const sell = !!user && canSellRmc(user.roleKey);
  const [plantId] = usePlantScope();
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { openOrder, drawers } = useRmcDrawers();
  useNewIntent('rmc-order', sell, () => setCreating(true));
  const status: RmcOrderStatus | undefined = view === 'QUOTED' || view === 'CONFIRMED' ? view : undefined;
  const { data, isLoading, isFetching, error, refetch } = useRmcOrders({ plantId, status, q: q || undefined, page, pageSize: 50 });
  const rows = (data?.items ?? []).filter((o) => view !== 'open' || o.status === 'QUOTED' || o.status === 'CONFIRMED');
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Space wrap>
          <Segmented
            aria-label="Which orders"
            value={view}
            onChange={(v) => (setView(v as View), setPage(1))}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'QUOTED', label: 'Quotes' },
              { value: 'CONFIRMED', label: 'Orders' },
              { value: 'all', label: 'All' },
            ]}
          />
          <PlantFilter />
          <Input.Search allowClear placeholder="Number, customer or site" aria-label="Search orders" onSearch={(v) => (setQ(v.trim()), setPage(1))} style={{ width: 240 }} />
        </Space>
        {sell && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            New RMC quote
          </Button>
        )}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<RmcOrderDto>
          rowKey="id"
          size="small"
          loading={isLoading || isFetching}
          dataSource={rows}
          scroll={{ x: 1000 }}
          locale={{ emptyText: view === 'QUOTED' ? 'No quotes waiting for an answer' : 'No orders here' }}
          pagination={{ current: page, pageSize: 50, total: data?.total ?? 0, onChange: setPage, hideOnSinglePage: true, showSizeChanger: false }}
          onRow={(o) => ({ onClick: () => openOrder(o.id), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: 'Order',
              dataIndex: 'orderNo',
              width: 150,
              render: (n: string, o) => (
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openOrder(o.id)}>
                  <span translate="no">{n}</span>
                </Button>
              ),
            },
            { title: 'Date', dataIndex: 'date', width: 110, render: (d: string) => formatDate(d) },
            { title: 'Customer', dataIndex: 'customer', ellipsis: true, render: (c: string) => <span translate="no">{c}</span> },
            { title: 'Grade', dataIndex: 'grade', width: 80, render: (g: string) => <span translate="no">{g}</span> },
            { title: 'Pour on', dataIndex: 'pourDate', width: 110, render: (d: string | null) => formatDate(d) },
            { title: 'Ordered', dataIndex: 'quantity', align: 'right', width: 100, render: (q: string) => <M3 value={q} /> },
            { title: 'Delivered', dataIndex: 'delivered', align: 'right', width: 100, render: (q: string) => <M3 value={q} /> },
            { title: 'Value before GST', dataIndex: 'value', align: 'right', width: 140, render: (v: string) => <Rupees value={v} /> },
            { title: 'Status', dataIndex: 'status', width: 110, render: (s: RmcOrderStatus) => <OrderStatusTag status={s} /> },
          ]}
        />
      )}
      {drawers}
      <OrderForm open={creating} onClose={() => setCreating(false)} onSaved={(o) => openOrder(o.id)} />
    </div>
  );
}

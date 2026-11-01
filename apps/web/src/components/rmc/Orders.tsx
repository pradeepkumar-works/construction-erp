'use client';

import React, { useState } from 'react';
import { Button, Segmented } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { RmcOrderDto, RmcOrderStatus } from '@erp/shared';
import { canSellRmc } from '@erp/shared';
import { tk } from '@/ds';
import { useAuth } from '@/lib/auth';
import { useRmcOrders } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { OrderStatusTag, PlantFilter, usePlantScope } from './rmcUi';
import { OrderForm } from './OrderForm';
import { useRmcDrawers } from './Drawers';

type View = 'open' | 'QUOTED' | 'CONFIRMED' | 'all';
const KEYS = ['view'] as const;
const START = { view: 'open' };

/** Quotes and orders: what each customer wants, what has gone and what is left. */
export function Orders() {
  const { user } = useAuth();
  const sell = !!user && canSellRmc(user.roleKey);
  const [plantId] = usePlantScope();
  const [creating, setCreating] = useState(false);
  const { openOrder, drawers } = useRmcDrawers();
  useNewIntent('rmc-order', sell, () => setCreating(true));
  const frame = useListFrame<'date', RmcOrderDto>({
    list: 'rmc-orders',
    url: false,
    keys: KEYS,
    initialFilters: START,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: ['date'],
    columns: (sortOrderFor): ListColumn<RmcOrderDto>[] => [
      { key: 'orderNo', title: 'Order', dataIndex: 'orderNo', width: 150, locked: true, render: (n: string) => <span translate="no">{n}</span> },
      { key: 'date', title: 'Date', dataIndex: 'date', width: 110, sorter: true, sortOrder: sortOrderFor('date'), render: (d: string) => formatDate(d) },
      { key: 'customer', title: 'Customer', dataIndex: 'customer', ellipsis: true, card: 'meta', render: (c: string) => <span translate="no">{c}</span> },
      { key: 'grade', title: 'Grade', dataIndex: 'grade', width: 80, render: (g: string) => <span translate="no">{g}</span> },
      { key: 'pourDate', title: 'Pour on', dataIndex: 'pourDate', width: 110, render: (d: string | null) => formatDate(d) },
      { key: 'quantity', title: 'Ordered', dataIndex: 'quantity', kind: 'qty', unit: () => 'm³', width: 100 },
      { key: 'delivered', title: 'Delivered', dataIndex: 'delivered', kind: 'qty', unit: () => 'm³', width: 100 },
      { key: 'value', title: 'Value before GST', dataIndex: 'value', kind: 'money', width: 140 },
      { key: 'status', title: 'Status', dataIndex: 'status', width: 110, render: (s: RmcOrderStatus) => <OrderStatusTag status={s} /> },
    ],
  });
  const { page } = frame;
  const view = (page.filters.view ?? 'all') as View;
  const { data, isLoading, isFetching, error, refetch } = useRmcOrders({
    plantId,
    status: view === 'QUOTED' || view === 'CONFIRMED' ? view : undefined,
    open: view === 'open' || undefined,
    q: page.params.q,
    sortOrder: page.params.sortOrder,
    page: page.params.page,
    pageSize: page.params.pageSize,
  });
  const newButton = sell ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
      New RMC quote
    </Button>
  ) : null;
  return (
    <div style={{ padding: tk.space[4] }}>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        filters={frame.filterState}
        onProject={frame.setProjectFilter}
        hideProject
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Number, customer or site"
        searchLabel="Search orders"
        extra={newButton}
      >
        <Segmented
          aria-label="Which orders"
          value={view}
          onChange={(v) => page.setFilter('view', v === 'all' ? null : String(v))}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'QUOTED', label: 'Quotes' },
            { value: 'CONFIRMED', label: 'Orders' },
            { value: 'all', label: 'All' },
          ]}
        />
        <PlantFilter />
      </ListToolbar>
      <DataTable<RmcOrderDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<RmcOrderDto>(data?.total)}
        onOpen={openOrder}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        emptyText={<EmptyArt art="entries" title={view === 'QUOTED' ? 'No quotes waiting for an answer' : 'No orders here'} />}
        emptyAction={newButton}
      />
      {drawers}
      <OrderForm open={creating} onClose={() => setCreating(false)} onSaved={(o) => openOrder(o.id)} />
    </div>
  );
}

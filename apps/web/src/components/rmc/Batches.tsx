'use client';

import React from 'react';
import { Segmented } from 'antd';
import dayjs from 'dayjs';
import type { RmcBatchDto, RmcBatchStatus } from '@erp/shared';
import { RMC_BATCH_STATUSES, RMC_BATCH_STATUS_LABELS } from '@erp/shared';
import { tk } from '@/ds';
import { useRmcBatches } from '@/lib/queries';
import { formatDateTime, NO_VALUE, todayDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { useListFrame } from '@/components/list/useListFrame';
import { BatchStatusTag, M3, PlantFilter, usePlantScope } from './rmcUi';
import { useRmcDrawers } from './Drawers';

const KEYS = ['status', 'from', 'to'] as const;

/** Every truck and its challan, by day: what went, where, and whether it was delivered, billed and cubed. */
export function Batches() {
  const [plantId] = usePlantScope();
  const { openBatch, drawers } = useRmcDrawers();
  const frame = useListFrame<'dispatchedAt', RmcBatchDto>({
    list: 'rmc-batches',
    url: false,
    keys: KEYS,
    initialFilters: { from: dayjs(todayDate()).subtract(6, 'day').format('YYYY-MM-DD'), to: todayDate() },
    sortBy: 'dispatchedAt',
    sortOrder: 'desc',
    sortFields: ['dispatchedAt'],
    statusLabels: RMC_BATCH_STATUS_LABELS,
    columns: (): ListColumn<RmcBatchDto>[] => [
      { key: 'batchNo', title: 'Challan', dataIndex: 'batchNo', width: 140, locked: true, render: (n: string) => <span translate="no">{n}</span> },
      { key: 'dispatchedAt', title: 'Left the plant', dataIndex: 'dispatchedAt', width: 170, card: 'date', render: (d: string) => formatDateTime(d) },
      { key: 'customer', title: 'Customer', dataIndex: 'customer', ellipsis: true, card: 'meta', render: (c: string) => <span translate="no">{c}</span> },
      { key: 'orderNo', title: 'Order', dataIndex: 'orderNo', width: 140, render: (n: string) => <span translate="no">{n}</span> },
      { key: 'grade', title: 'Grade', dataIndex: 'grade', width: 80, render: (g: string) => <span translate="no">{g}</span> },
      { key: 'quantity', title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 100, render: (q: string) => <M3 value={q} /> },
      { key: 'truck', title: 'Truck', dataIndex: 'truck', width: 140, render: (t: string | null) => <span translate="no">{t ?? NO_VALUE}</span> },
      { key: 'status', title: 'Status', dataIndex: 'status', width: 120, render: (s: RmcBatchStatus) => <BatchStatusTag status={s} /> },
      { key: 'invoiceNo', title: 'Bill', dataIndex: 'invoiceNo', width: 140, render: (n: string | null) => <span translate="no">{n ?? NO_VALUE}</span> },
    ],
  });
  const { page } = frame;
  const status = page.filters.status as RmcBatchStatus | undefined;
  const { data, isLoading, isFetching, error, refetch } = useRmcBatches({
    plantId,
    status,
    from: page.params.from,
    to: page.params.to,
    q: page.params.q,
    page: page.params.page,
    pageSize: page.params.pageSize,
  });
  return (
    <div style={{ padding: tk.space[4] }}>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        filters={frame.filterState}
        onProject={frame.setProjectFilter}
        hideProject
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Challan, truck, customer"
        searchLabel="Search challans"
      >
        <DateRangeFilter {...frame.dateRange} />
        <Segmented
          aria-label="Which trucks"
          value={status ?? 'all'}
          onChange={(v) => page.setFilter('status', v === 'all' ? null : String(v))}
          options={[{ value: 'all', label: 'All' }, ...RMC_BATCH_STATUSES.map((s) => ({ value: s, label: RMC_BATCH_STATUS_LABELS[s] }))]}
        />
        <PlantFilter />
      </ListToolbar>
      <DataTable<RmcBatchDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<RmcBatchDto>(data?.total)}
        onOpen={openBatch}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1000}
        emptyText={<EmptyArt art="entries" title="No trucks on these days" />}
      />
      {drawers}
    </div>
  );
}

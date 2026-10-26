'use client';

import React, { useState } from 'react';
import { Input, Segmented, Space, Table } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { RmcBatchDto, RmcBatchStatus } from '@erp/shared';
import { useRmcBatches } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { BatchStatusTag, M3, PlantFilter, usePlantScope } from './rmcUi';
import { useRmcDrawers } from './Drawers';

/** Every truck and its challan, by day: what went, where, and whether it was delivered, billed and cubed. */
export function Batches() {
  const [plantId] = usePlantScope();
  const [status, setStatus] = useState<RmcBatchStatus | 'all'>('all');
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => [dayjs().subtract(6, 'day'), dayjs()]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { openBatch, drawers } = useRmcDrawers();
  const { data, isLoading, isFetching, error, refetch } = useRmcBatches({
    plantId,
    status: status === 'all' ? undefined : status,
    from: range[0].format('YYYY-MM-DD'),
    to: range[1].format('YYYY-MM-DD'),
    q: q || undefined,
    page,
    pageSize: 50,
  });
  return (
    <div style={{ padding: 16 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker aria-label="Days" allowClear={false} value={range} onChange={(r) => r?.[0] && r[1] && (setRange([r[0], r[1]]), setPage(1))} />
        <Segmented
          aria-label="Which trucks"
          value={status}
          onChange={(v) => (setStatus(v as RmcBatchStatus | 'all'), setPage(1))}
          options={[
            { value: 'all', label: 'All' },
            { value: 'DISPATCHED', label: 'On the way' },
            { value: 'DELIVERED', label: 'Delivered' },
            { value: 'REJECTED', label: 'Turned back' },
          ]}
        />
        <PlantFilter />
        <Input.Search allowClear placeholder="Challan, truck, customer" aria-label="Search challans" onSearch={(v) => (setQ(v.trim()), setPage(1))} style={{ width: 230 }} />
      </Space>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<RmcBatchDto>
          rowKey="id"
          size="small"
          loading={isLoading || isFetching}
          dataSource={data?.items ?? []}
          scroll={{ x: 1000 }}
          locale={{ emptyText: 'No trucks on these days' }}
          pagination={{ current: page, pageSize: 50, total: data?.total ?? 0, onChange: setPage, hideOnSinglePage: true, showSizeChanger: false }}
          onRow={(b) => ({ onClick: () => openBatch(b.id), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Challan', dataIndex: 'batchNo', width: 140, render: (n: string) => <span translate="no">{n}</span> },
            { title: 'Left the plant', dataIndex: 'dispatchedAt', width: 170, render: (d: string) => formatDateTime(d) },
            { title: 'Customer', dataIndex: 'customer', ellipsis: true, render: (c: string) => <span translate="no">{c}</span> },
            { title: 'Order', dataIndex: 'orderNo', width: 140, render: (n: string) => <span translate="no">{n}</span> },
            { title: 'Grade', dataIndex: 'grade', width: 80, render: (g: string) => <span translate="no">{g}</span> },
            { title: 'Quantity', dataIndex: 'quantity', align: 'right', width: 100, render: (q: string) => <M3 value={q} /> },
            { title: 'Truck', dataIndex: 'truck', width: 140, render: (t: string | null) => <span translate="no">{t ?? '-'}</span> },
            { title: 'Status', dataIndex: 'status', width: 120, render: (s: RmcBatchStatus) => <BatchStatusTag status={s} /> },
            { title: 'Bill', dataIndex: 'invoiceNo', width: 140, render: (n: string | null) => <span translate="no">{n ?? '-'}</span> },
          ]}
        />
      )}
      {drawers}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { DatePicker, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { Dayjs } from 'dayjs';
import type { StockEntryDto, StockEntrySortField, StockEntryType } from '@erp/shared';
import { STOCK_ENTRY_TYPES, STOCK_ENTRY_TYPE_LABELS } from '@erp/shared';
import { useStockEntries } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { STOCK_ENTRY_EXPORT, stockEntryExportRows } from '@/lib/exportColumns';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { StockTypeTag, entrySummary } from './StockTypeTag';
import { StockEntryDrawer } from './StockEntryDrawer';

/** Store register: GRNs, issues and adjustments, server-paged with type and date filters and Excel export (one row per line). */
export function StockEntries({ projectId: fixedProject }: { projectId?: string }) {
  const list = useListState<StockEntrySortField>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [type, setType] = useState<StockEntryType | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, type, from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD') };
  const { data, isLoading, isFetching, error, refetch } = useStockEntries(filters);

  const exportRows = async () => {
    const rows = stockEntryExportRows(await fetchAllPages<StockEntryDto>('/stock/entries', { ...filters, allTypes: true }));
    downloadXlsx(exportFileName('stock-register'), 'register', STOCK_ENTRY_EXPORT, rows);
    return rows.length;
  };

  const sort = (key: StockEntrySortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const columns: TableProps<StockEntryDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 120, ...sort('date'), render: (v) => formatDate(v) },
    { title: 'Entry no.', dataIndex: 'entryNo', width: 140, ...sort('entryNo'), render: (v, r) => <Typography.Link onClick={() => setOpened(r.id)}>{v}</Typography.Link> },
    { title: 'Type', dataIndex: 'type', width: 130, ...sort('type'), render: (v) => <StockTypeTag type={v} /> },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 220, ellipsis: true, render: (v: string, r: StockEntryDto) => <Link href={`/projects/${r.projectId}?tab=stock`}>{v}</Link> }]),
    {
      title: 'Items',
      key: 'items',
      render: (_, r) => (
        <span>
          {r.lines.slice(0, 3).map((l, i) => (
            <span key={l.id}>
              {i > 0 ? ', ' : ''}
              {l.itemName} <Typography.Text type={Number(l.quantity) < 0 ? 'danger' : 'success'}>{`${Number(l.quantity) > 0 ? '+' : ''}${formatQty(l.quantity)}`}</Typography.Text> {l.unit}
            </span>
          ))}
          {r.lines.length > 3 ? <Typography.Text type="secondary">{` and ${r.lines.length - 3} more`}</Typography.Text> : null}
        </span>
      ),
    },
    { title: 'Details', key: 'details', width: 260, ellipsis: true, render: (_, r) => entrySummary(r) },
    { title: 'By', dataIndex: 'createdByName', width: 150, ...sort('createdBy') },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={(v) => {
          setProjectFilter(v);
          list.resetPage();
        }}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search entry, item, supplier, MR"
        extra={<ExportButton onExport={exportRows} />}
      >
        <Select
          allowClear
          placeholder="All types"
          value={type}
          onChange={(v) => {
            setType(v);
            list.resetPage();
          }}
          style={{ width: 160 }}
          options={STOCK_ENTRY_TYPES.map((t) => ({ value: t, label: STOCK_ENTRY_TYPE_LABELS[t] }))}
        />
        <DatePicker.RangePicker
          value={range}
          onChange={(v) => {
            setRange(v as [Dayjs | null, Dayjs | null] | null);
            list.resetPage();
          }}
          format="DD MMM YYYY"
          allowEmpty={[true, true]}
        />
      </ListToolbar>
      <Table<StockEntryDto>
        size="middle"
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        scroll={{ x: 1100 }}
        {...list.tableProps<StockEntryDto>(data?.total)}
      />
      <StockEntryDrawer id={opened} onClose={() => setOpened(null)} />
    </>
  );
}

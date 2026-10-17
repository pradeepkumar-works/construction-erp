'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Select, Space, Typography } from 'antd';
import type { GrnQcStatus, StockEntryDto, StockEntrySortField, StockEntryType } from '@erp/shared';
import { GRN_QC_STATUSES, LIST_SORT_FIELDS, GRN_QC_STATUS_LABELS, STOCK_ENTRY_TYPES, STOCK_ENTRY_TYPE_LABELS } from '@erp/shared';
import { useStockEntries } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { STOCK_ENTRY_EXPORT, stockEntryExportRows } from '@/lib/exportColumns';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { StockTypeTag, entrySummary } from './StockTypeTag';
import { StockEntryDrawer } from './StockEntryDrawer';
import { GrnQcTag } from './GrnQc';

const KEYS = ['type', 'qc', 'from', 'to'] as const;

/** Store register: GRNs, issues and adjustments, server-paged with type and date filters and Excel export (one row per line). */
export function StockEntries({ projectId: fixedProject }: { projectId?: string }) {
  const [opened, setOpened] = useState<string | null>(null);
  const frame = useListFrame<StockEntrySortField, StockEntryDto>({
    list: 'stock-entries',
    url: false,
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.stockEntries,
    fixedProject,
    chipLabels: {
      type: (v) => `Type: ${STOCK_ENTRY_TYPE_LABELS[v as StockEntryType] ?? v}`,
      qc: (v) => (v === 'PENDING' ? 'Awaiting QA/QC' : `QA/QC: ${GRN_QC_STATUS_LABELS[v as GrnQcStatus] ?? v}`),
    },
    columns: (sortOrderFor): ListColumn<StockEntryDto>[] => {
      const sort = (key: StockEntrySortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Date', dataIndex: 'date', width: 120, ...sort('date'), render: (v) => formatDate(v) },
        {
          title: 'Entry no.',
          dataIndex: 'entryNo',
          locked: true,
          width: 140,
          ...sort('entryNo'),
          render: (v, r) => (
            <RecordLink onOpen={() => setOpened(r.id)} className="mono">
              {v}
            </RecordLink>
          ),
        },
        {
          title: 'Type',
          dataIndex: 'type',
          width: 170,
          ...sort('type'),
          render: (v, r) => (
            <Space orientation="vertical" size={2}>
              <StockTypeTag type={v} />
              {r.type === 'RECEIPT' ? <GrnQcTag status={r.qcStatus} /> : null}
            </Space>
          ),
        },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 220, ellipsis: true, render: (v: string, r: StockEntryDto) => <Link href={`/projects/${r.projectId}?tab=stock`}>{v}</Link> } satisfies ListColumn<StockEntryDto>]),
        {
          title: 'Items',
          key: 'items',
          width: 280,
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
        { title: 'By', label: 'Entered by', dataIndex: 'createdByName', width: 150, ...sort('createdBy') },
        { title: 'Entered on', dataIndex: 'createdAt', width: 120, defaultHidden: true, ...sort('createdAt'), render: (v) => formatDate(v) },
      ];
    },
  });
  const { page } = frame;
  const type = page.filters.type as StockEntryType | undefined;
  const qcFilter = page.filters.qc as GrnQcStatus | 'PENDING' | undefined;
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, from: page.params.from, to: page.params.to, projectId: frame.projectId, type, qc: qcFilter };
  const { data, isLoading, isFetching, error, refetch } = useStockEntries(filters);

  const exportRows = async () => {
    const rows = stockEntryExportRows(await fetchAllPages<StockEntryDto>('/stock/entries', { ...filters, allTypes: true }));
    downloadXlsx(exportFileName('stock-register'), 'register', STOCK_ENTRY_EXPORT, rows);
    return rows.length;
  };

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search entry, item, supplier, MR"
        searchLabel="Search stock entries"
        extra={<ExportButton onExport={exportRows} />}
      >
        <Select<StockEntryType> allowClear placeholder="All types" aria-label="Type" value={type} onChange={(v) => page.setFilter('type', v)} style={{ width: 160 }} options={STOCK_ENTRY_TYPES.map((t) => ({ value: t, label: STOCK_ENTRY_TYPE_LABELS[t] }))} />
        <Select<GrnQcStatus | 'PENDING'>
          allowClear
          placeholder="QA/QC"
          value={qcFilter}
          onChange={(v) => page.setFilter('qc', v)}
          style={{ width: 170 }}
          aria-label="QA/QC"
          options={[{ value: 'PENDING', label: 'Awaiting QA/QC' }, ...GRN_QC_STATUSES.map((q) => ({ value: q, label: GRN_QC_STATUS_LABELS[q] }))]}
        />
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<StockEntryDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<StockEntryDto>(data?.total)}
        onOpen={setOpened}
        bulk={[exportSelected<StockEntryDto, ReturnType<typeof stockEntryExportRows>[number]>('stock-register', 'register', STOCK_ENTRY_EXPORT, stockEntryExportRows)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1160 : 1380}
        emptyText={<EmptyArt art="entries" title={type || qcFilter || page.params.q || page.params.from || page.params.to ? 'No entry matches these filters' : 'No stock entries yet'} />}
      />
      <StockEntryDrawer id={opened} onClose={() => setOpened(null)} />
    </>
  );
}

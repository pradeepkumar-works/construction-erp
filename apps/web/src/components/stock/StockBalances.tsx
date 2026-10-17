'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Checkbox, InputNumber, Popover, Space, Tag, Tooltip, Typography } from 'antd';
import { EditOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockBalanceDto, StockBalanceSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, canManageStore } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStockBalances } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { STOCK_BALANCE_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { ItemLedgerDrawer } from './ItemLedgerDrawer';
import { themeColor } from '@/lib/theme';

/** Minimum level editor in a popover: store manager and approvers. */
function MinLevelEditor({ row }: { row: StockBalanceDto }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(row.minQty);
  const save = useMutation({
    mutationFn: async (minQty: string | null) => (await api.put<StockBalanceDto>('/stock/min-levels', { projectId: row.projectId, itemId: row.itemId, minQty })).data,
    onSuccess: (r) => {
      message.success(r.minQty ? `Minimum for ${r.itemName} set to ${formatQty(r.minQty)} ${r.unit}` : `Minimum for ${r.itemName} removed`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      setOpen(false);
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(row.minQty);
      }}
      trigger="click"
      title={`Minimum stock of ${row.itemName}`}
      content={
        <Space orientation="vertical" size={8}>
          <Space.Compact>
            <InputNumber<string> stringMode min="0" value={value} onChange={(v) => setValue(v)} placeholder="None" style={{ width: 140 }} autoFocus />
            <Button disabled>{row.unit}</Button>
          </Space.Compact>
          <Space>
            <Button size="small" type="primary" loading={save.isPending} onClick={() => save.mutate(value && Number(value) > 0 ? value : null)}>
              Save
            </Button>
            {row.minQty ? (
              <Button size="small" onClick={() => save.mutate(null)} disabled={save.isPending}>
                Remove
              </Button>
            ) : null}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            The store manager and PM are alerted when an issue takes the stock below it.
          </Typography.Text>
        </Space>
      }
    >
      <Button type="text" size="small" icon={<EditOutlined />} aria-label="Set minimum" />
    </Popover>
  );
}

type StockRow = StockBalanceDto & { id: string };
const KEYS = ['low', 'inStock'] as const;

/** Stock on hand per project and item, with low-stock filter, minimum levels and Excel export. */
export function StockBalances({ projectId: fixedProject, initialLow = false, initialProject, initialSearch }: { projectId?: string; initialLow?: boolean; initialProject?: string; initialSearch?: string }) {
  const { user } = useAuth();
  const mayManage = !!user && canManageStore(user.roleKey);
  const [ledger, setLedger] = useState<StockBalanceDto | null>(null);
  const qty = (v: string, r: StockBalanceDto) => (
    <span>
      {formatQty(v)} <Typography.Text type="secondary">{r.unit}</Typography.Text>
    </span>
  );
  const nil = <Typography.Text type="secondary">-</Typography.Text>;
  const frame = useListFrame<StockBalanceSortField, StockRow>({
    list: 'stock-balances',
    url: false,
    keys: KEYS,
    sortBy: 'item',
    sortOrder: 'asc',
    sortFields: LIST_SORT_FIELDS.stockBalances,
    fixedProject,
    initialProject,
    initialFilters: initialLow || initialSearch ? { ...(initialLow ? { low: '1' } : {}), ...(initialSearch ? { q: initialSearch } : {}) } : undefined,
    chipLabels: { low: () => 'Low stock only', inStock: () => 'In stock only' },
    columns: (sortOrderFor): ListColumn<StockRow>[] => {
      const sort = (key: StockBalanceSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });
      return [
        {
          title: 'Item',
          dataIndex: 'itemName',
          locked: true,
          width: 260,
          ...sort('item'),
          render: (v, r) => (
            <Space size={6} wrap>
              <RecordLink onOpen={() => setLedger(r)}>{v}</RecordLink>
              {r.category ? <Tag style={{ margin: 0 }}>{r.category}</Tag> : null}
            </Space>
          ),
        },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 240, ellipsis: true, render: (v: string, r: StockRow) => <Link href={`/projects/${r.projectId}?tab=stock`}>{v}</Link> } satisfies ListColumn<StockRow>]),
        { title: 'Received', dataIndex: 'received', align: 'right', width: 120, ...sort('received'), render: qty },
        { title: 'Issued', dataIndex: 'issued', align: 'right', width: 120, ...sort('issued'), render: qty },
        { key: 'adjusted', title: 'Adjusted', dataIndex: 'adjusted', align: 'right', width: 110, render: (v: string, r) => (Number(v) === 0 ? nil : qty(v, r)) },
        { key: 'transferred', title: 'Transferred', dataIndex: 'transferred', align: 'right', width: 120, render: (v: string, r) => (Number(v) === 0 ? nil : qty(v, r)) },
        {
          title: 'Balance',
          dataIndex: 'balance',
          align: 'right',
          width: 140,
          ...sort('balance'),
          render: (v: string, r) => (
            <Space size={4}>
              {r.low ? (
                <Tooltip title={`Below the minimum of ${formatQty(r.minQty)} ${r.unit}`}>
                  <WarningOutlined style={{ color: themeColor('volcano7') }} />
                </Tooltip>
              ) : null}
              <Typography.Text strong type={r.low ? 'danger' : undefined}>
                {formatQty(v)}
              </Typography.Text>
              <Typography.Text type="secondary">{r.unit}</Typography.Text>
            </Space>
          ),
        },
        {
          key: 'minQty',
          title: 'Minimum',
          dataIndex: 'minQty',
          align: 'right',
          width: 130,
          render: (v: string | null, r) => (
            <Space size={2}>
              {v ? formatQty(v) : nil}
              {mayManage ? <MinLevelEditor row={r} /> : null}
            </Space>
          ),
        },
        { title: 'Last movement', dataIndex: 'lastMovement', width: 130, ...sort('lastMovement'), render: (v) => formatDate(v) },
      ];
    },
  });
  const { page } = frame;
  const lowOnly = page.filters.low === '1';
  const inStock = page.filters.inStock === '1';
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, lowOnly: lowOnly || undefined, inStock: inStock || undefined };
  const { data, isLoading, isFetching, error, refetch } = useStockBalances(filters);
  const rows: StockRow[] = (data?.items ?? []).map((r) => ({ ...r, id: `${r.projectId}|${r.itemId}` }));

  const exportRows = async () => {
    const all = await fetchAllPages<StockBalanceDto>('/stock/balances', { ...filters });
    downloadXlsx(exportFileName('stock-balance'), 'stock', STOCK_BALANCE_EXPORT, all);
    return all.length;
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
        searchPlaceholder="Search item or category"
        searchLabel="Search stock balances"
        extra={<ExportButton onExport={exportRows} />}
      >
        <Checkbox checked={lowOnly} onChange={(e) => page.setFilter('low', e.target.checked ? '1' : undefined)}>
          Low stock only
        </Checkbox>
        <Checkbox checked={inStock} onChange={(e) => page.setFilter('inStock', e.target.checked ? '1' : undefined)}>
          In stock only
        </Checkbox>
      </ListToolbar>
      <DataTable<StockRow>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<StockRow>(data?.total)}
        onOpen={(id) => setLedger(rows.find((r) => r.id === id) ?? null)}
        bulk={[exportSelected<StockRow, StockBalanceDto>('stock-balance', 'stock', STOCK_BALANCE_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1150 : 1390}
        emptyText={<EmptyArt art="entries" title={lowOnly ? 'Nothing is below its minimum.' : 'No stock yet. Receive material against an approved request, or enter opening stock as an adjustment.'} />}
      />
      <ItemLedgerDrawer row={ledger} onClose={() => setLedger(null)} />
    </>
  );
}

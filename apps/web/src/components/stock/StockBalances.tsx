'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Checkbox, InputNumber, Popover, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { EditOutlined, WarningOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockBalanceDto, StockBalanceSortField } from '@erp/shared';
import { canManageStore } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStockBalances } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { STOCK_BALANCE_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
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

/** Stock on hand per project and item, with low-stock filter, minimum levels and Excel export. */
export function StockBalances({ projectId: fixedProject, initialLow = false, initialProject }: { projectId?: string; initialLow?: boolean; initialProject?: string }) {
  const { user } = useAuth();
  const mayManage = !!user && canManageStore(user.roleKey);
  const list = useListState<StockBalanceSortField>({ sortBy: 'item', sortOrder: 'asc', pageSize: 50 });
  const [projectFilter, setProjectFilter] = useState<string | undefined>(initialProject);
  const [lowOnly, setLowOnly] = useState(initialLow);
  const [inStock, setInStock] = useState(false);
  const [ledger, setLedger] = useState<StockBalanceDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, lowOnly: lowOnly || undefined, inStock: inStock || undefined };
  const { data, isLoading, isFetching, error, refetch } = useStockBalances(filters);

  const exportRows = async () => {
    const rows = await fetchAllPages<StockBalanceDto>('/stock/balances', { ...filters });
    downloadXlsx(exportFileName('stock-balance'), 'stock', STOCK_BALANCE_EXPORT, rows);
    return rows.length;
  };

  const sort = (key: StockBalanceSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });
  const qty = (v: string, r: StockBalanceDto) => (
    <span>
      {formatQty(v)} <span className="text-muted">{r.unit}</span>
    </span>
  );
  const columns: TableProps<StockBalanceDto>['columns'] = [
    {
      title: 'Item',
      dataIndex: 'itemName',
      width: 260,
      ...sort('item'),
      render: (v, r) => (
        <Space size={6} wrap>
          <Typography.Link onClick={() => setLedger(r)}>{v}</Typography.Link>
          {r.category ? <Tag style={{ margin: 0 }}>{r.category}</Tag> : null}
        </Space>
      ),
    },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 240, ellipsis: true, render: (v: string, r: StockBalanceDto) => <Link href={`/projects/${r.projectId}?tab=stock`}>{v}</Link> }]),
    { title: 'Received', dataIndex: 'received', align: 'right', width: 120, ...sort('received'), render: qty },
    { title: 'Issued', dataIndex: 'issued', align: 'right', width: 120, ...sort('issued'), render: qty },
    { title: 'Adjusted', dataIndex: 'adjusted', align: 'right', width: 110, render: (v: string, r) => (Number(v) === 0 ? <span className="text-muted">-</span> : qty(v, r)) },
    { title: 'Transferred', dataIndex: 'transferred', align: 'right', width: 120, render: (v: string, r) => (Number(v) === 0 ? <span className="text-muted">-</span> : qty(v, r)) },
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
          <span className="text-muted">{r.unit}</span>
        </Space>
      ),
    },
    {
      title: 'Minimum',
      dataIndex: 'minQty',
      align: 'right',
      width: 130,
      render: (v: string | null, r) => (
        <Space size={2}>
          {v ? formatQty(v) : <span className="text-muted">-</span>}
          {mayManage ? <MinLevelEditor row={r} /> : null}
        </Space>
      ),
    },
    { title: 'Last movement', dataIndex: 'lastMovement', width: 130, ...sort('lastMovement'), render: (v) => formatDate(v) },
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
        searchPlaceholder="Search item or category"
        extra={<ExportButton onExport={exportRows} />}
      >
        <Checkbox
          checked={lowOnly}
          onChange={(e) => {
            setLowOnly(e.target.checked);
            list.resetPage();
          }}
        >
          Low stock only
        </Checkbox>
        <Checkbox
          checked={inStock}
          onChange={(e) => {
            setInStock(e.target.checked);
            list.resetPage();
          }}
        >
          In stock only
        </Checkbox>
      </ListToolbar>
      <Table<StockBalanceDto>
        size="middle"
        rowKey={(r) => `${r.projectId}|${r.itemId}`}
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        scroll={{ x: fixedProject ? 1150 : 1390 }}
        locale={{ emptyText: lowOnly ? 'Nothing is below its minimum.' : 'No stock yet. Receive material against an approved request, or enter opening stock as an adjustment.' }}
        {...list.tableProps<StockBalanceDto>(data?.total)}
      />
      <ItemLedgerDrawer row={ledger} onClose={() => setLedger(null)} />
    </>
  );
}

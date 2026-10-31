'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Progress, Space, theme } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { PurchaseOrderDto, PurchaseOrderSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, canPurchase } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useAuth } from '@/lib/auth';
import { usePurchaseOrders } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PURCHASE_ORDER_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { EmptyArt } from '@/components/common/EmptyArt';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { StatusTag } from '@/components/common/StatusTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { PoStateTag, PurchaseOrderDrawer } from './PurchaseOrderDrawer';
import { PurchaseOrderFormModal } from './PurchaseOrderFormModal';
import { VendorSelect, useVendorName } from '@/components/common/SearchSelect';

const KEYS = ['status', 'mine', 'from', 'to', 'vendorId', 'open'] as const;
const sumMoney = (values: string[]) => formatINR(values.reduce((n, v) => n + Number(v || 0), 0));

function TwoLine({ top, sub }: { top: React.ReactNode; sub: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <div>
      {top}
      <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{sub}</div>
    </div>
  );
}

function poColumns({ showProject, onOpen, sortOrderFor }: { showProject: boolean; onOpen: (id: string) => void; sortOrderFor: (key: PurchaseOrderSortField) => 'ascend' | 'descend' | null }): ListColumn<PurchaseOrderDto>[] {
  const sort = (key: PurchaseOrderSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    {
      card: 'title',
      cardText: (r) => r.poNo,
      title: 'PO',
      label: 'PO no.',
      locked: true,
      ...sort('poNo'),
      width: 160,
      render: (_, r) => (
        <TwoLine
          top={
            <RecordLink href={`/purchase-orders/${r.id}`} onOpen={() => onOpen(r.id)} strong className="mono">
              {r.poNo}
            </RecordLink>
          }
          sub={formatDate(r.poDate)}
        />
      ),
    },
    { card: 'meta', cardText: (r) => r.vendorName, title: 'Vendor', ...sort('vendor'), render: (_, r) => <TwoLine top={r.vendorName} sub={r.lines.map((l) => l.itemName).join(', ')} /> },
    ...(showProject ? [{ card: 'meta' as const, cardText: (r: PurchaseOrderDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: PurchaseOrderDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }] : []),
    { defaultFrom: 1400, key: 'request', title: 'Request', dataIndex: 'requestNo', width: 140, render: (v, r) => (v ? <Link href={`/material-requests/${r.materialRequestId}`} className="mono" translate="no">{v}</Link> : '-') },
    { card: 'amount', title: 'Total', dataIndex: 'total', width: 150, align: 'right', ...sort('total'), render: (v) => <strong className="mono" translate="no">{formatINR(v)}</strong>, total: (rows) => sumMoney(rows.map((r) => r.total)) },
    { card: 'date', cardText: (r) => formatDate(r.poDate), title: 'Raised on', dataIndex: 'createdAt', width: 130, defaultHidden: true, render: (v) => formatDate(v), ...sort('createdAt') },
    {
      card: 'status',
      title: 'Status',
      dataIndex: 'status',
      width: 180,
      ...sort('status'),
      render: (s, r) => (
        <Space size={4} wrap>
          <StatusTag status={s} />
          <PoStateTag order={r} />
        </Space>
      ),
    },
    { defaultFrom: 1600, key: 'received', title: 'Received', width: 130, render: (_, r) => (r.status === 'APPROVED' ? <Progress percent={r.receivedPct} size="small" style={{ margin: 0 }} aria-label={`${r.receivedPct}% received`} /> : '-') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="purchase_order" row={r} amount={r.total} href={`/purchase-orders/${r.id}`} onOpen={onOpen} /> },
  ];
}

/** Purchase orders, on the Purchase orders page and as a project tab. `openId` opens one order (from a link). */
export function PurchaseOrderList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrderDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const frame = useListFrame({
    list: 'purchase-orders',
    type: 'PURCHASE_ORDER',
    keys: KEYS,
    sortBy: 'poDate',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.purchaseOrders,
    fixedProject,
    columns: (sortOrderFor) => poColumns({ showProject: !fixedProject, onOpen: setOpenId, sortOrderFor }),
    moreViews: [{ key: 'open', label: 'Open orders', filters: { open: '1' } }],
    chipLabels: {
      vendorId: () => `Vendor: ${vendorName ?? 'one vendor'}`,
      open: () => 'Open orders',
    },
  });
  const { page } = frame;
  // Read by the chip's label once the list has drawn.
  const vendorName = useVendorName(page.filters.vendorId);
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, vendorId: page.filters.vendorId, open: page.filters.open === '1' || undefined };
  const { data, isLoading, isFetching, error, refetch } = usePurchaseOrders(filters);
  const approve = useBulkApprove<PurchaseOrderDto>('purchase_order', (r) => r.total);
  const buyer = !!user && canPurchase(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<PurchaseOrderDto>('/purchase-orders', { ...filters });
    await downloadXlsx(exportFileName('purchase-orders'), 'Purchase orders', PURCHASE_ORDER_EXPORT, rows);
    return rows.length;
  };

  useNewIntent('purchase-order', buyer, () => setFormOpen(true));

  const newButton = buyer ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      New purchase order
    </Button>
  ) : null;

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        status={frame.status}
        onStatus={frame.setStatus}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search PO no., vendor, item, request"
        searchLabel="Search purchase orders"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <VendorSelect allowClear placeholder="Any vendor" aria-label="Vendor" style={{ width: 220 }} value={page.filters.vendorId} onChange={(v) => page.setFilter('vendorId', v)} />
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<PurchaseOrderDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<PurchaseOrderDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<PurchaseOrderDto>('purchase-orders', 'Purchase orders', PURCHASE_ORDER_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1050 : 1250}
        emptyText={<EmptyArt art="entries" title={buyer ? 'No purchase orders yet. Make one from an approved indent, or with New purchase order.' : 'No purchase orders yet'} />}
        emptyAction={newButton}
      />
      <PurchaseOrderDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <PurchaseOrderFormModal
        open={formOpen || !!editing}
        order={editing}
        start={fixedProject ? { projectId: fixedProject } : null}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(o) => setOpenId(o.id)}
      />
    </>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Progress, Space, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { WorkOrderDto, WorkOrderSortField, VendorKind } from '@erp/shared';
import { LIST_SORT_FIELDS, canIssueWorkOrder } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useWorkOrders, LIST_START } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { WORK_ORDER_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { StatusTag } from '@/components/common/StatusTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { WoStateTag, WorkOrderDrawer } from './WorkOrderDrawer';
import { WorkOrderFormModal } from './WorkOrderFormModal';
import { VendorSelect, useVendorName } from '@/components/common/SearchSelect';

const SUB_KINDS: VendorKind[] = ['SUBCONTRACTOR', 'LABOUR_CONTRACTOR'];
const KEYS = ['status', 'mine', 'from', 'to', 'vendorId', 'open'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

function workOrderColumns({ showProject, onOpen, onEdit, sortOrderFor }: { showProject: boolean; onOpen: (id: string) => void; onEdit: (row: WorkOrderDto) => void; sortOrderFor: (key: WorkOrderSortField) => 'ascend' | 'descend' | null }): ListColumn<WorkOrderDto>[] {
  const sort = (key: WorkOrderSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    {
      card: 'title',
      cardText: (r) => r.woNo,
      title: 'WO',
      locked: true,
      ...sort('woNo'),
      width: 150,
      render: (_, r) => (
        <div>
          <RecordLink href={`/work-orders/${r.id}`} onOpen={() => onOpen(r.id)} strong className="mono">
            {r.woNo}
          </RecordLink>
          <Sub>{formatDate(r.woDate)}</Sub>
        </div>
      ),
    },
    {
      card: 'meta',
      cardText: (r) => [r.vendorName, r.title].filter(Boolean).join(' · '),
      title: 'Subcontractor',
      ...sort('vendor'),
      render: (_, r) => (
        <div>
          {r.vendorName}
          <Sub>{r.title}</Sub>
        </div>
      ),
    },
    ...(showProject ? [{ card: 'meta' as const, cardText: (r: WorkOrderDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: WorkOrderDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }] : []),
    {
      card: 'amount',
      title: 'Value',
      dataIndex: 'value',
      width: 150,
      align: 'right',
      ...sort('value'),
      render: (v) => <strong className="mono">{formatINR(v)}</strong>,
      total: (rows) => formatINR(rows.reduce((n, r) => n + toNumber(r.value), 0)),
    },
    { defaultFrom: 1400, title: 'Billed', key: 'billed', width: 130, render: (_, r) => (r.status === 'APPROVED' ? <Progress percent={r.billedPct} size="small" style={{ margin: 0 }} aria-label={`${r.billedPct}% billed`} /> : '-') },
    { key: 'submittedByName', title: 'Raised by', dataIndex: 'submittedByName', width: 140, defaultHidden: true },
    {
      card: 'status',
      title: 'Status',
      dataIndex: 'status',
      width: 170,
      fixed: 'right' as const,
      ...sort('status'),
      render: (s, r) => (
        <Space size={4} wrap>
          <StatusTag status={s} />
          <WoStateTag order={r} />
        </Space>
      ),
    },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="work_order" row={r} href={`/work-orders/${r.id}`} amount={r.value} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}

/** Work orders, on the Work Orders page and as a project tab. `openId` opens one order (from a link). */
export function WorkOrderList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrderDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const frame = useListFrame({
    list: 'work-orders',
    type: 'WORK_ORDER',
    keys: KEYS,
    // Where the sidebar's hover fetched it ahead from (LIST_START).
    sortBy: LIST_START['/work-orders'].sortBy,
    sortOrder: LIST_START['/work-orders'].sortOrder,
    sortFields: LIST_SORT_FIELDS.workOrders,
    fixedProject,
    columns: (sortOrderFor) => workOrderColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
    moreViews: [{ key: 'open', label: 'Open orders', filters: { open: '1' } }],
    chipLabels: {
      vendorId: () => `Subcontractor: ${vendorName ?? 'one subcontractor'}`,
      open: () => 'Open orders',
    },
  });
  const { page } = frame;
  // Read by the chip's label once the list has drawn.
  const vendorName = useVendorName(page.filters.vendorId);
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, vendorId: page.filters.vendorId, open: page.filters.open === '1' || undefined };
  const { data, isLoading, isFetching, error, refetch } = useWorkOrders(filters);
  const approve = useBulkApprove<WorkOrderDto>('work_order', (r) => r.value);
  const issuer = !!user && canIssueWorkOrder(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<WorkOrderDto>('/work-orders', { ...filters });
    await downloadXlsx(exportFileName('work-orders'), 'Work orders', WORK_ORDER_EXPORT, rows);
    return rows.length;
  };

  const newButton = issuer ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      New work order
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
        searchPlaceholder="Search WO no., subcontractor, work"
        searchLabel="Search work orders"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <VendorSelect
          kinds={SUB_KINDS}
          allowClear
          placeholder="Any subcontractor"
          aria-label="Subcontractor"
          style={{ width: 220 }}
          value={filters.vendorId}
          onChange={(v) => page.setFilter('vendorId', v)}
        />
        <DateRangeFilter {...frame.dateRange} />
        <Checkbox checked={!!filters.open} onChange={(e) => page.setFilter('open', e.target.checked ? '1' : undefined)}>
          Open orders only
        </Checkbox>
      </ListToolbar>
      <DataTable<WorkOrderDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<WorkOrderDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<WorkOrderDto>('work-orders', 'Work orders', WORK_ORDER_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1000 : 1200}
        emptyText={<EmptyArt art="entries" title={issuer ? 'No work orders yet. Give work to a subcontractor with New work order.' : 'No work orders yet'} />}
        emptyAction={newButton}
      />
      <WorkOrderDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <WorkOrderFormModal
        open={formOpen || !!editing}
        order={editing}
        projectId={fixedProject}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(o) => setOpenId(o.id)}
      />
    </>
  );
}

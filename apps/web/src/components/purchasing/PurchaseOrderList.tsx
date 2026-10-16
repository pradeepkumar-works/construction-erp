'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Progress, Select, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { PurchaseOrderDto, PurchaseOrderSortField, SubmissionStatus } from '@erp/shared';
import { canPurchase } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useProjectScope } from '@/lib/project-scope';
import { useAuth } from '@/lib/auth';
import { usePurchaseOrders, useVendors } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PURCHASE_ORDER_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { PoStateTag, PurchaseOrderDrawer } from './PurchaseOrderDrawer';
import { PurchaseOrderFormModal } from './PurchaseOrderFormModal';

/** Purchase orders, on the Purchase Orders page and as a project tab. `openId` opens one order (from a link). */
export function PurchaseOrderList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const list = useListState<PurchaseOrderSortField>({ sortBy: 'poDate', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrderDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, status, vendorId, open: onlyOpen || undefined };
  const { data, isLoading, isFetching, error, refetch } = usePurchaseOrders(filters);
  const { data: vendors } = useVendors();
  const buyer = !!user && canPurchase(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: PurchaseOrderSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const exportRows = async () => {
    const rows = await fetchAllPages<PurchaseOrderDto>('/purchase-orders', { ...filters });
    downloadXlsx(exportFileName('purchase-orders'), 'Purchase orders', PURCHASE_ORDER_EXPORT, rows);
    return rows.length;
  };

  const columns: TableProps<PurchaseOrderDto>['columns'] = [
    {
      title: 'PO',
      ...sort('poNo'),
      width: 150,
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)} strong className="mono">
            {r.poNo}
          </Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {formatDate(r.poDate)}
          </div>
        </div>
      ),
    },
    {
      title: 'Vendor',
      ...sort('vendor'),
      render: (_, r) => (
        <div>
          {r.vendorName}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.lines.map((l) => l.itemName).join(', ')}
          </div>
        </div>
      ),
    },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: PurchaseOrderDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    { title: 'Request', dataIndex: 'requestNo', width: 120, render: (v, r) => (v ? <Link href={`/material-requests?id=${r.materialRequestId}`} className="mono">{v}</Link> : <span className="text-muted">-</span>) },
    { title: 'Total', dataIndex: 'total', width: 140, align: 'right', ...sort('total'), render: (v) => <strong className="mono">{formatINR(v)}</strong> },
    { title: 'Received', key: 'received', width: 130, render: (_, r) => (r.status === 'APPROVED' ? <Progress percent={r.receivedPct} size="small" style={{ margin: 0 }} /> : <span className="text-muted">-</span>) },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 170,
      ...sort('status'),
      render: (s, r) => (
        <Space size={4} wrap>
          <StatusTag status={s} />
          <PoStateTag order={r} />
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" onClick={() => setOpenId(r.id)}>
            View
          </Button>
          <ReviewActions type="purchase_order" id={r.id} status={r.status} amount={r.total} size="small" compact />
        </div>
      ),
    },
  ];

  useNewIntent('purchase-order', buyer, () => setFormOpen(true));

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={reset(setProjectFilter)}
        hideProject={!!fixedProject}
        status={status}
        onStatus={reset(setStatus)}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search PO no., vendor, item, request"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {buyer ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                New purchase order
              </Button>
            ) : null}
          </>
        }
      >
        <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Any vendor" style={{ width: 220 }} value={vendorId} onChange={reset(setVendorId)} options={(vendors ?? []).map((v) => ({ value: v.id, label: v.name }))} />
        <Checkbox checked={onlyOpen} onChange={(e) => reset(setOnlyOpen)(e.target.checked)}>
          Open orders only
        </Checkbox>
      </ListToolbar>
      <Table<PurchaseOrderDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<PurchaseOrderDto>(data?.total)}
        scroll={{ x: fixedProject ? 1000 : 1200 }}
        locale={{ emptyText: buyer ? 'No purchase orders yet. Raise one from an approved material request, or with New purchase order.' : 'No purchase orders yet' }}
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

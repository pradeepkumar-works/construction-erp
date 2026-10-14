'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SubmissionStatus, VendorBillDto, VendorBillSortField } from '@erp/shared';
import { canRecordVendorBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useVendorBills, useVendors } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { VENDOR_BILL_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { MatchTag, VendorBillDrawer, overdueDays } from './VendorBillDrawer';
import { VendorBillFormModal } from './VendorBillFormModal';

/** Vendor bills, on the Vendor Bills page and as a project tab. `openId` opens one bill (from a link). */
export function VendorBillList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const list = useListState<VendorBillSortField>({ sortBy: 'invoiceDate', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [exceptions, setExceptions] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorBillDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, status, vendorId, exceptions: exceptions || undefined };
  const { data, isLoading, isFetching, error, refetch } = useVendorBills(filters);
  const { data: vendors } = useVendors();
  const recorder = !!user && canRecordVendorBill(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: VendorBillSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const exportRows = async () => {
    const rows = await fetchAllPages<VendorBillDto>('/vendor-bills', { ...filters });
    downloadXlsx(exportFileName('vendor-bills'), 'Vendor bills', VENDOR_BILL_EXPORT, rows);
    return rows.length;
  };

  const columns: TableProps<VendorBillDto>['columns'] = [
    {
      title: 'Bill',
      ...sort('billNo'),
      width: 150,
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)} strong className="mono">
            {r.billNo}
          </Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.invoiceNo}
          </div>
        </div>
      ),
    },
    { title: 'Invoice date', dataIndex: 'invoiceDate', width: 120, ...sort('invoiceDate'), render: (v) => formatDate(v) },
    { title: 'Vendor', dataIndex: 'vendorName', ...sort('vendor') },
    { title: 'PO', dataIndex: 'poNo', width: 130, render: (v, r) => <Link href={`/purchase-orders?id=${r.purchaseOrderId}`} className="mono">{v}</Link> },
    ...(fixedProject ? [] : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: VendorBillDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    { title: 'Total', dataIndex: 'total', width: 140, align: 'right', ...sort('total'), render: (v) => <strong className="mono">{formatINR(v)}</strong> },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      width: 130,
      ...sort('dueDate'),
      render: (v, r) => {
        const late = overdueDays(r);
        return late ? <Tag color="red">{formatDate(v)}</Tag> : formatDate(v);
      },
    },
    { title: 'Match', dataIndex: 'matched', width: 120, render: (v, r) => <span title={r.exceptions.join('\n')}><MatchTag matched={v} /></span> },
    { title: 'Status', dataIndex: 'status', width: 140, ...sort('status'), render: (s) => <StatusTag status={s} /> },
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
          <ReviewActions type="vendor_bill" id={r.id} status={r.status} amount={r.total} size="small" compact />
        </div>
      ),
    },
  ];

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
        searchPlaceholder="Search bill, invoice, vendor, PO"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {recorder ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Record vendor bill
              </Button>
            ) : null}
          </>
        }
      >
        <Select allowClear showSearch optionFilterProp="label" placeholder="Any vendor" style={{ width: 220 }} value={vendorId} onChange={reset(setVendorId)} options={(vendors ?? []).map((v) => ({ value: v.id, label: v.name }))} />
        <Checkbox checked={exceptions} onChange={(e) => reset(setExceptions)(e.target.checked)}>
          Not matching the PO
        </Checkbox>
      </ListToolbar>
      <Table<VendorBillDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<VendorBillDto>(data?.total)}
        scroll={{ x: fixedProject ? 1100 : 1300 }}
        locale={{ emptyText: 'No vendor bills yet' }}
      />
      <VendorBillDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <VendorBillFormModal
        open={formOpen || !!editing}
        bill={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(b) => setOpenId(b.id)}
      />
    </>
  );
}

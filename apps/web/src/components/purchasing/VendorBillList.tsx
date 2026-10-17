'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Space, Tag, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { VendorBillDto, VendorBillSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, canRecordVendorBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useVendorBills, useVendors } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { VENDOR_BILL_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { PaidTag } from '@/components/payables/BillPayments';
import { StatusTag } from '@/components/common/StatusTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { MatchTag, VendorBillDrawer, overdueDays } from './VendorBillDrawer';
import { VendorBillFormModal } from './VendorBillFormModal';

const KEYS = ['status', 'mine', 'from', 'to', 'vendorId', 'exceptions'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

function vendorBillColumns({ showProject, onOpen, onEdit, sortOrderFor }: { showProject: boolean; onOpen: (id: string) => void; onEdit: (row: VendorBillDto) => void; sortOrderFor: (key: VendorBillSortField) => 'ascend' | 'descend' | null }): ListColumn<VendorBillDto>[] {
  const sort = (key: VendorBillSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    {
      title: 'Bill',
      locked: true,
      ...sort('billNo'),
      width: 150,
      render: (_, r) => (
        <div>
          <RecordLink href={`/vendor-bills/${r.id}`} onOpen={() => onOpen(r.id)} strong className="mono">
            {r.billNo}
          </RecordLink>
          <Sub>{r.invoiceNo}</Sub>
        </div>
      ),
    },
    { title: 'Invoice date', dataIndex: 'invoiceDate', width: 120, ...sort('invoiceDate'), render: (v) => formatDate(v) },
    { title: 'Vendor', dataIndex: 'vendorName', ...sort('vendor') },
    { key: 'poNo', title: 'PO', dataIndex: 'poNo', width: 130, render: (v, r) => <Link href={`/purchase-orders/${r.purchaseOrderId}`} className="mono">{v}</Link> },
    ...(showProject ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: VendorBillDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }] : []),
    {
      title: 'Total',
      dataIndex: 'total',
      width: 140,
      align: 'right',
      ...sort('total'),
      render: (v) => <strong className="mono">{formatINR(v)}</strong>,
      total: (rows) => formatINR(rows.reduce((n, r) => n + toNumber(r.total), 0)),
    },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      width: 130,
      ...sort('dueDate'),
      render: (v, r) => (overdueDays(r) ? <Tag color="red">{formatDate(v)}</Tag> : formatDate(v)),
    },
    { key: 'matched', title: 'Match', label: 'Match with the PO', dataIndex: 'matched', width: 120, render: (v, r) => <span title={r.exceptions.join('\n')}><MatchTag matched={v} /></span> },
    { key: 'submittedByName', title: 'Recorded by', dataIndex: 'submittedByName', width: 140, defaultHidden: true },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 150,
      fixed: 'right' as const,
      ...sort('status'),
      render: (s, r) => (
        <Space size={4} wrap>
          <StatusTag status={s} />
          <PaidTag bill={r} />
        </Space>
      ),
    },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="vendor_bill" row={r} href={`/vendor-bills/${r.id}`} amount={r.total} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}

/** Vendor bills, on the Vendor Bills page and as a project tab. `openId` opens one bill (from a link). */
export function VendorBillList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorBillDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const { data: vendors } = useVendors();
  const frame = useListFrame({
    list: 'vendor-bills',
    type: 'VENDOR_BILL',
    keys: KEYS,
    sortBy: 'invoiceDate',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.vendorBills,
    fixedProject,
    columns: (sortOrderFor) => vendorBillColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
    moreViews: [{ key: 'exceptions', label: 'Not matching the PO', filters: { exceptions: '1' } }],
    chipLabels: {
      vendorId: (v) => `Vendor: ${vendors?.find((x) => x.id === v)?.name ?? 'one vendor'}`,
      exceptions: () => 'Not matching the PO',
    },
  });
  const { page } = frame;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, vendorId: page.filters.vendorId, exceptions: page.filters.exceptions === '1' || undefined };
  const { data, isLoading, isFetching, error, refetch } = useVendorBills(filters);
  const approve = useBulkApprove<VendorBillDto>('vendor_bill', (r) => r.total);
  const recorder = !!user && canRecordVendorBill(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<VendorBillDto>('/vendor-bills', { ...filters });
    await downloadXlsx(exportFileName('vendor-bills'), 'Vendor bills', VENDOR_BILL_EXPORT, rows);
    return rows.length;
  };

  const newButton = recorder ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Record vendor bill
    </Button>
  ) : null;

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        status={frame.status}
        onStatus={frame.setStatus}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search bill, invoice, vendor, PO"
        searchLabel="Search vendor bills"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Any vendor" aria-label="Vendor" style={{ width: 220 }} value={filters.vendorId} onChange={(v) => page.setFilter('vendorId', v)} options={(vendors ?? []).map((v) => ({ value: v.id, label: v.name }))} />
        <DateRangeFilter {...frame.dateRange} placeholder={['Invoices from', 'To']} />
        <Checkbox checked={!!filters.exceptions} onChange={(e) => page.setFilter('exceptions', e.target.checked ? '1' : undefined)}>
          Not matching the PO
        </Checkbox>
      </ListToolbar>
      <DataTable<VendorBillDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<VendorBillDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<VendorBillDto>('vendor-bills', 'Vendor bills', VENDOR_BILL_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1200 : 1420}
        emptyText={<EmptyArt art="entries" title="No vendor bills here yet" />}
        emptyAction={newButton}
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

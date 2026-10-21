'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Dropdown, Select, Space, Tag, theme } from 'antd';
import { DownOutlined, PlusOutlined } from '@ant-design/icons';
import type { VendorBillDto, VendorBillKind, VendorBillSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, VENDOR_BILL_KINDS, VENDOR_BILL_KIND_LABELS, canRecordVendorBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useVendorBills, LIST_START } from '@/lib/queries';
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
import { VendorBillForm } from './VendorBillFormModal';
import { VendorSelect, useVendorName } from '@/components/common/SearchSelect';

const KEYS = ['status', 'mine', 'from', 'to', 'vendorId', 'exceptions', 'kind'] as const;

/** What each kind of bill is recorded against, in the Record menu (v5 item 91). */
const KIND_HINTS: Record<VendorBillKind, string> = {
  PO: 'Matched against the order and its GRNs',
  HIRE: "A hired machine's month, from its approved logs",
  SERVICE: 'Closed job cards of a workshop',
  OTHER: 'Transport, testing, consultancy and the like',
};

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

function vendorBillColumns({ showProject, onOpen, onEdit, sortOrderFor }: { showProject: boolean; onOpen: (id: string) => void; onEdit: (row: VendorBillDto) => void; sortOrderFor: (key: VendorBillSortField) => 'ascend' | 'descend' | null }): ListColumn<VendorBillDto>[] {
  const sort = (key: VendorBillSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    {
      card: 'title',
      cardText: (r) => r.billNo,
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
    { defaultFrom: 1400, card: 'date', title: 'Invoice date', dataIndex: 'invoiceDate', width: 120, ...sort('invoiceDate'), render: (v) => formatDate(v) },
    { card: 'meta', title: 'Vendor', dataIndex: 'vendorName', ...sort('vendor') },
    {
      defaultFrom: 1600,
      key: 'poNo',
      title: 'Against',
      label: 'PO or kind',
      dataIndex: 'poNo',
      width: 150,
      render: (v: string | null, r) =>
        r.purchaseOrderId ? (
          <Link href={`/purchase-orders/${r.purchaseOrderId}`} className="mono">
            {v}
          </Link>
        ) : (
          <div>
            {VENDOR_BILL_KIND_LABELS[r.kind]}
            {r.equipmentCode ? <Sub>{r.equipmentCode}</Sub> : null}
          </div>
        ),
    },
    ...(showProject ? [{ card: 'meta' as const, cardText: (r: VendorBillDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: VendorBillDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }] : []),
    {
      card: 'amount',
      title: 'Total',
      dataIndex: 'total',
      width: 140,
      align: 'right',
      ...sort('total'),
      render: (v) => <strong className="mono" translate="no">{formatINR(v)}</strong>,
      total: (rows) => formatINR(rows.reduce((n, r) => n + toNumber(r.total), 0)),
    },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      width: 130,
      ...sort('dueDate'),
      render: (v, r) => (overdueDays(r) ? <Tag color="red">{formatDate(v)}</Tag> : formatDate(v)),
    },
    { defaultFrom: 1400, key: 'matched', title: 'Match', label: 'Match with the PO', dataIndex: 'matched', width: 120, render: (v, r) => <span title={r.exceptions.join('\n')}><MatchTag matched={v} po={!!r.purchaseOrderId} /></span> },
    { key: 'submittedByName', title: 'Recorded by', dataIndex: 'submittedByName', width: 140, defaultHidden: true },
    {
      card: 'status',
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

/** Vendor bills, on the Vendor bills page and as a project tab. `openId` opens one bill (from a link). */
export function VendorBillList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [creating, setCreating] = useState<VendorBillKind | null>(null);
  const [editing, setEditing] = useState<VendorBillDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const frame = useListFrame({
    list: 'vendor-bills',
    type: 'VENDOR_BILL',
    keys: KEYS,
    // Where the sidebar's hover fetched it ahead from (LIST_START).
    sortBy: LIST_START['/vendor-bills'].sortBy,
    sortOrder: LIST_START['/vendor-bills'].sortOrder,
    sortFields: LIST_SORT_FIELDS.vendorBills,
    fixedProject,
    columns: (sortOrderFor) => vendorBillColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
    moreViews: [{ key: 'exceptions', label: 'With exceptions', filters: { exceptions: '1' } }],
    chipLabels: {
      vendorId: () => `Vendor: ${vendorName ?? 'one vendor'}`,
      exceptions: () => 'With exceptions',
      kind: (v) => VENDOR_BILL_KIND_LABELS[v as VendorBillKind] ?? 'One kind',
    },
  });
  const { page } = frame;
  // Read by the chip's label once the list has drawn.
  const vendorName = useVendorName(page.filters.vendorId);
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, vendorId: page.filters.vendorId, exceptions: page.filters.exceptions === '1' || undefined, kind: page.filters.kind as VendorBillKind | undefined };
  const { data, isLoading, isFetching, error, refetch } = useVendorBills(filters);
  const approve = useBulkApprove<VendorBillDto>('vendor_bill', (r) => r.total);
  const recorder = !!user && canRecordVendorBill(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<VendorBillDto>('/vendor-bills', { ...filters });
    await downloadXlsx(exportFileName('vendor-bills'), 'Vendor bills', VENDOR_BILL_EXPORT, rows);
    return rows.length;
  };

  const newButton = recorder ? (
    <Dropdown
      trigger={['click']}
      menu={{
        items: VENDOR_BILL_KINDS.map((k) => ({
          key: k,
          label: (
            <div>
              {VENDOR_BILL_KIND_LABELS[k]}
              <Sub>{KIND_HINTS[k]}</Sub>
            </div>
          ),
        })),
        onClick: ({ key }) => setCreating(key as VendorBillKind),
      }}
    >
      <Button type="primary" icon={<PlusOutlined />}>
        Record vendor bill <DownOutlined />
      </Button>
    </Dropdown>
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
        searchPlaceholder="Search bill, invoice, vendor, PO"
        searchLabel="Search vendor bills"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <VendorSelect allowClear placeholder="Any vendor" aria-label="Vendor" style={{ width: 220 }} value={filters.vendorId} onChange={(v) => page.setFilter('vendorId', v)} />
        <Select
          allowClear
          placeholder="Any kind"
          aria-label="Kind of bill"
          style={{ width: 200 }}
          value={filters.kind}
          onChange={(v) => page.setFilter('kind', v)}
          options={VENDOR_BILL_KINDS.map((k) => ({ value: k, label: VENDOR_BILL_KIND_LABELS[k] }))}
        />
        <DateRangeFilter {...frame.dateRange} placeholder={['Invoices from', 'To']} />
        <Checkbox checked={!!filters.exceptions} onChange={(e) => page.setFilter('exceptions', e.target.checked ? '1' : undefined)}>
          With exceptions
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
      <VendorBillForm
        open={!!creating || !!editing}
        kind={creating ?? undefined}
        bill={editing}
        start={{ projectId: fixedProject }}
        onClose={() => {
          setCreating(null);
          setEditing(null);
        }}
        onSaved={(b) => setOpenId(b.id)}
      />
    </>
  );
}

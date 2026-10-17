'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Select, Space, Tag, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SubcontractBillDto, SubcontractBillSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, canPrepareSubcontractBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useSubcontractBills, useVendors } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { SUBCONTRACT_BILL_EXPORT } from '@/lib/exportColumns';
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
import { overdueDays } from '@/components/purchasing/VendorBillDrawer';
import { SubBillDrawer } from './SubBillDrawer';
import { SubBillFormModal } from './SubBillFormModal';

const SUB_KINDS = new Set(['SUBCONTRACTOR', 'LABOUR_CONTRACTOR']);
const KEYS = ['status', 'mine', 'from', 'to', 'vendorId'] as const;
const sumMoney = (values: string[]) => formatINR(values.reduce((n, v) => n + toNumber(v), 0));

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

function subBillColumns({ showProject, onOpen, onEdit, sortOrderFor }: { showProject: boolean; onOpen: (id: string) => void; onEdit: (row: SubcontractBillDto) => void; sortOrderFor: (key: SubcontractBillSortField) => 'ascend' | 'descend' | null }): ListColumn<SubcontractBillDto>[] {
  const sort = (key: SubcontractBillSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    {
      title: 'Bill',
      locked: true,
      ...sort('billDate'),
      width: 200,
      render: (_, r) => (
        <div>
          <RecordLink href={`/subcontract-bills/${r.id}`} onOpen={() => onOpen(r.id)} strong className="mono">
            {r.label}
          </RecordLink>
          <Sub>{formatDate(r.billDate)}</Sub>
        </div>
      ),
    },
    {
      title: 'Subcontractor',
      ...sort('vendor'),
      render: (_, r) => (
        <div>
          {r.vendorName}
          <Sub>{r.woTitle}</Sub>
        </div>
      ),
    },
    ...(showProject ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: SubcontractBillDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }] : []),
    { title: 'Work value', dataIndex: 'grossAmount', width: 140, align: 'right', ...sort('grossAmount'), render: (v) => <span className="mono">{formatINR(v)}</span>, total: (rows) => sumMoney(rows.map((r) => r.grossAmount)) },
    { title: 'Net payable', dataIndex: 'netPayable', width: 140, align: 'right', ...sort('netPayable'), render: (v) => <strong className="mono">{formatINR(v)}</strong>, total: (rows) => sumMoney(rows.map((r) => r.netPayable)) },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      width: 130,
      ...sort('dueDate'),
      render: (v, r) => {
        const late = overdueDays(r);
        return (
          <div>
            {formatDate(v)}
            {late ? (
              <div>
                <Tag color="red" style={{ margin: 0 }}>
                  {late} days late
                </Tag>
              </div>
            ) : null}
          </div>
        );
      },
    },
    { key: 'submittedByName', title: 'Prepared by', dataIndex: 'submittedByName', width: 140, defaultHidden: true },
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
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="subcontract_bill" row={r} href={`/subcontract-bills/${r.id}`} amount={r.grossAmount} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}

/** Subcontractor bills, on their page and as a project tab. `openId` opens one bill (from a link). */
export function SubBillList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubcontractBillDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const { data: vendors } = useVendors();
  const frame = useListFrame({
    list: 'subcontract-bills',
    type: 'SUBCONTRACT_BILL',
    keys: KEYS,
    sortBy: 'billDate',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.subcontractBills,
    fixedProject,
    columns: (sortOrderFor) => subBillColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
    chipLabels: { vendorId: (v) => `Subcontractor: ${vendors?.find((x) => x.id === v)?.name ?? 'one subcontractor'}` },
  });
  const { page } = frame;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, vendorId: page.filters.vendorId };
  const { data, isLoading, isFetching, error, refetch } = useSubcontractBills(filters);
  const approve = useBulkApprove<SubcontractBillDto>('subcontract_bill', (r) => r.grossAmount);
  const preparer = !!user && canPrepareSubcontractBill(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<SubcontractBillDto>('/subcontract-bills', { ...filters });
    await downloadXlsx(exportFileName('subcontractor-bills'), 'Subcontractor bills', SUBCONTRACT_BILL_EXPORT, rows);
    return rows.length;
  };

  const newButton = preparer ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      New bill
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
        searchPlaceholder="Search WO no., subcontractor, invoice"
        searchLabel="Search subcontractor bills"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="Any subcontractor"
          aria-label="Subcontractor"
          style={{ width: 220 }}
          value={filters.vendorId}
          onChange={(v) => page.setFilter('vendorId', v)}
          options={(vendors ?? []).filter((v) => v.kinds.some((k) => SUB_KINDS.has(k))).map((v) => ({ value: v.id, label: v.name }))}
        />
        <DateRangeFilter {...frame.dateRange} placeholder={['Billed from', 'To']} />
      </ListToolbar>
      <DataTable<SubcontractBillDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<SubcontractBillDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<SubcontractBillDto>('subcontractor-bills', 'Subcontractor bills', SUBCONTRACT_BILL_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1000 : 1200}
        emptyText={<EmptyArt art="entries" title={preparer ? 'No subcontractor bills yet. Prepare one from an approved work order.' : 'No subcontractor bills yet'} />}
        emptyAction={newButton}
      />
      <SubBillDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <SubBillFormModal
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

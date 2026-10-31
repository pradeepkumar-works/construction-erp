'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Select, theme } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { BillSortField, BillStage, RaBillDto } from '@erp/shared';
import { BILL_STAGES, BILL_STAGE_LABELS, LIST_SORT_FIELDS, canPrepareBill } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useAuth } from '@/lib/auth';
import { useBills, LIST_START } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { BILL_EXPORT } from '@/lib/exportColumns';
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
import { BillStageTag } from './billUi';
import { BillDrawer } from './BillDrawer';
import { BillFormModal } from './BillFormModal';

const KEYS = ['status', 'mine', 'from', 'to', 'stage'] as const;
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

function billColumns({ showProject, onOpen, sortOrderFor }: { showProject: boolean; onOpen: (id: string) => void; sortOrderFor: (key: BillSortField) => 'ascend' | 'descend' | null }): ListColumn<RaBillDto>[] {
  const sort = (key: BillSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    {
      card: 'title',
      cardText: (r) => r.billLabel,
      title: 'Bill',
      locked: true,
      ...sort('billNo'),
      width: 180,
      render: (_, r) => (
        <TwoLine
          top={
            <RecordLink href={`/bills/${r.id}`} onOpen={() => onOpen(r.id)} strong>
              {r.billLabel}
            </RecordLink>
          }
          sub={`up to ${formatDate(r.measuredUpTo)}`}
        />
      ),
    },
    { card: 'date', title: 'Bill date', dataIndex: 'billDate', width: 120, render: (v) => formatDate(v), ...sort('billDate') },
    ...(showProject
      ? [{ card: 'meta' as const, cardText: (r: RaBillDto) => [r.projectName, r.clientName].filter(Boolean).join(' · '), title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: RaBillDto) => <TwoLine top={<Link href={`/projects/${r.projectId}?tab=bills`}>{v}</Link>} sub={r.clientName ?? ''} /> }]
      : []),
    { defaultFrom: 1600, title: 'Work done', dataIndex: 'grossAmount', width: 150, align: 'right', ...sort('grossAmount'), render: (v) => <span className="mono" translate="no">{formatINR(v)}</span>, total: (rows) => sumMoney(rows.map((r) => r.grossAmount)) },
    { card: 'amount', title: 'Net payable', dataIndex: 'netPayable', width: 150, align: 'right', ...sort('netPayable'), render: (v) => <strong className="mono" translate="no">{formatINR(v)}</strong>, total: (rows) => sumMoney(rows.map((r) => r.netPayable)) },
    { title: 'Prepared on', dataIndex: 'createdAt', width: 130, defaultHidden: true, render: (v) => formatDate(v), ...sort('createdAt') },
    { card: 'status', title: 'Status', dataIndex: 'status', width: 150, ...sort('status'), render: (s) => <StatusTag status={s} /> },
    { defaultFrom: 1400, title: 'With client', dataIndex: 'stage', width: 140, ...sort('stage'), render: (s, r) => (r.status === 'APPROVED' ? <BillStageTag stage={s} /> : '-') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="bill" row={r} amount={r.grossAmount} href={`/bills/${r.id}`} onOpen={onOpen} /> },
  ];
}

/** RA bills, on the RA bills page and as a project tab. `openId` opens one bill (from a link). */
export function BillList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RaBillDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const frame = useListFrame({
    list: 'bills',
    type: 'BILL',
    keys: KEYS,
    // Where the sidebar's hover fetched it ahead from (LIST_START).
    sortBy: LIST_START['/bills'].sortBy,
    sortOrder: LIST_START['/bills'].sortOrder,
    sortFields: LIST_SORT_FIELDS.bills,
    fixedProject,
    columns: (sortOrderFor) => billColumns({ showProject: !fixedProject, onOpen: setOpenId, sortOrderFor }),
    chipLabels: { stage: (v) => `Client stage: ${BILL_STAGE_LABELS[v as BillStage] ?? v}` },
  });
  const { page } = frame;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, stage: page.filters.stage as BillStage | undefined };
  const { data, isLoading, isFetching, error, refetch } = useBills(filters);
  const approve = useBulkApprove<RaBillDto>('bill', (r) => r.grossAmount);
  const preparer = !!user && canPrepareBill(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<RaBillDto>('/ra-bills', { ...filters });
    await downloadXlsx(exportFileName('ra-bills'), 'RA bills', BILL_EXPORT, rows);
    return rows.length;
  };

  useNewIntent('ra-bill', preparer, () => setFormOpen(true));

  const newButton = preparer ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      New RA bill
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
        searchPlaceholder="Search bill no., project, client, certificate"
        searchLabel="Search bills"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <Select<BillStage>
          allowClear
          placeholder="Any client stage"
          aria-label="Stage with the client"
          style={{ width: 210 }}
          value={page.filters.stage as BillStage | undefined}
          onChange={(v) => page.setFilter('stage', v)}
          options={BILL_STAGES.map((s) => ({ value: s, label: BILL_STAGE_LABELS[s] }))}
        />
        <DateRangeFilter {...frame.dateRange} placeholder={['Billed from', 'To']} />
      </ListToolbar>
      <DataTable<RaBillDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<RaBillDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<RaBillDto>('ra-bills', 'RA bills', BILL_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1000 : 1200}
        emptyText={<EmptyArt art="entries" title={preparer ? 'No RA bills yet. Bill the approved measurements with New RA bill.' : 'No bills yet'} />}
        emptyAction={newButton}
      />
      <BillDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <BillFormModal
        open={formOpen || !!editing}
        bill={editing}
        projectId={fixedProject}
        defaultProjectId={frame.projectId}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(b) => setOpenId(b.id)}
      />
    </>
  );
}

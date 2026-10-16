'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Select, Typography, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { BillSortField, BillStage, RaBillDto } from '@erp/shared';
import { BILL_STAGES, BILL_STAGE_LABELS, LIST_SORT_FIELDS, canPrepareBill } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useAuth } from '@/lib/auth';
import { useBills } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { BILL_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { StatusTag } from '@/components/common/StatusTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { RowActions } from '@/components/list/RowActions';
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
      title: 'Bill',
      locked: true,
      ...sort('billNo'),
      width: 180,
      render: (_, r) => (
        <TwoLine
          top={
            <Typography.Link onClick={() => onOpen(r.id)} strong>
              {r.billLabel}
            </Typography.Link>
          }
          sub={`up to ${formatDate(r.measuredUpTo)}`}
        />
      ),
    },
    { title: 'Bill date', dataIndex: 'billDate', width: 120, render: (v) => formatDate(v), ...sort('billDate') },
    ...(showProject
      ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: RaBillDto) => <TwoLine top={<Link href={`/projects/${r.projectId}?tab=bills`}>{v}</Link>} sub={r.clientName ?? ''} /> }]
      : []),
    { title: 'Work value', dataIndex: 'grossAmount', width: 150, align: 'right', ...sort('grossAmount'), render: (v) => <span className="mono">{formatINR(v)}</span>, total: (rows) => sumMoney(rows.map((r) => r.grossAmount)) },
    { title: 'Net payable', dataIndex: 'netPayable', width: 150, align: 'right', ...sort('netPayable'), render: (v) => <strong className="mono">{formatINR(v)}</strong>, total: (rows) => sumMoney(rows.map((r) => r.netPayable)) },
    { title: 'Prepared on', dataIndex: 'createdAt', width: 130, defaultHidden: true, render: (v) => formatDate(v), ...sort('createdAt') },
    { title: 'Status', dataIndex: 'status', width: 150, ...sort('status'), render: (s) => <StatusTag status={s} /> },
    { title: 'With client', dataIndex: 'stage', width: 140, ...sort('stage'), render: (s, r) => (r.status === 'APPROVED' ? <BillStageTag stage={s} /> : '-') },
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="bill" row={r} amount={r.grossAmount} onOpen={onOpen} /> },
  ];
}

/** RA bills, on the RA Bills page and as a project tab. `openId` opens one bill (from a link). */
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
    sortBy: 'billDate',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.bills,
    fixedProject,
    columns: (sortOrderFor) => billColumns({ showProject: !fixedProject, onOpen: setOpenId, sortOrderFor }),
    chipLabels: { stage: (v) => `With client: ${BILL_STAGE_LABELS[v as BillStage] ?? v}` },
  });
  const { page } = frame;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, stage: page.filters.stage as BillStage | undefined };
  const { data, isLoading, isFetching, error, refetch } = useBills(filters);
  const approve = useBulkApprove<RaBillDto>('bill', (r) => r.grossAmount);
  const preparer = !!user && canPrepareBill(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<RaBillDto>('/ra-bills', { ...filters });
    downloadXlsx(exportFileName('ra-bills'), 'RA bills', BILL_EXPORT, rows);
    return rows.length;
  };

  useNewIntent('ra-bill', preparer, () => setFormOpen(true));

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
        searchPlaceholder="Search bill no., project, client, certificate"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {preparer ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Prepare RA bill
              </Button>
            ) : null}
          </>
        }
      >
        <Select<BillStage>
          allowClear
          placeholder="Any stage with the client"
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
        scrollX={fixedProject ? 1000 : 1200}
        emptyText={preparer ? 'No bills yet. Prepare the first one from the approved measurements.' : 'No bills yet'}
      />
      <BillDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <BillFormModal
        open={formOpen || !!editing}
        bill={editing}
        projectId={fixedProject}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(b) => setOpenId(b.id)}
      />
    </>
  );
}

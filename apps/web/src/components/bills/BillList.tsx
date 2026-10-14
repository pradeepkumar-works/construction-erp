'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { BillSortField, BillStage, RaBillDto, SubmissionStatus } from '@erp/shared';
import { BILL_STAGES, BILL_STAGE_LABELS, canPrepareBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useBills } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { BILL_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { BillStageTag } from './billUi';
import { BillDrawer } from './BillDrawer';
import { BillFormModal } from './BillFormModal';

/** RA bills, on the RA Bills page and as a project tab. `openId` opens one bill (from a link). */
export function BillList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const list = useListState<BillSortField>({ sortBy: 'billDate', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [stage, setStage] = useState<BillStage | undefined>();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RaBillDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, status, stage };
  const { data, isLoading, isFetching, error, refetch } = useBills(filters);
  const preparer = !!user && canPrepareBill(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: BillSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const exportRows = async () => {
    const rows = await fetchAllPages<RaBillDto>('/ra-bills', { ...filters });
    downloadXlsx(exportFileName('ra-bills'), 'RA bills', BILL_EXPORT, rows);
    return rows.length;
  };

  const columns: TableProps<RaBillDto>['columns'] = [
    {
      title: 'Bill',
      ...sort('billNo'),
      width: 170,
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)} strong>
            {r.billLabel}
          </Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            up to {formatDate(r.measuredUpTo)}
          </div>
        </div>
      ),
    },
    { title: 'Bill date', dataIndex: 'billDate', width: 110, render: (v) => formatDate(v), ...sort('billDate') },
    ...(fixedProject
      ? []
      : [
          {
            title: 'Project',
            dataIndex: 'projectName',
            ...sort('project'),
            ellipsis: true,
            render: (v: string, r: RaBillDto) => (
              <div>
                <Link href={`/projects/${r.projectId}?tab=bills`}>{v}</Link>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {r.clientName ?? ''}
                </div>
              </div>
            ),
          },
        ]),
    { title: 'Work value', dataIndex: 'grossAmount', width: 140, align: 'right', ...sort('grossAmount'), render: (v) => <span className="mono">{formatINR(v)}</span> },
    { title: 'Net payable', dataIndex: 'netPayable', width: 140, align: 'right', ...sort('netPayable'), render: (v) => <strong className="mono">{formatINR(v)}</strong> },
    { title: 'Status', dataIndex: 'status', width: 140, ...sort('status'), render: (s) => <StatusTag status={s} /> },
    { title: 'With client', dataIndex: 'stage', width: 130, ...sort('stage'), render: (s, r) => (r.status === 'APPROVED' ? <BillStageTag stage={s} /> : <span className="text-muted">-</span>) },
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
          <ReviewActions type="bill" id={r.id} status={r.status} amount={r.grossAmount} size="small" compact />
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
          style={{ width: 210 }}
          value={stage}
          onChange={reset(setStage)}
          options={BILL_STAGES.map((s) => ({ value: s, label: BILL_STAGE_LABELS[s] }))}
        />
      </ListToolbar>
      <Table<RaBillDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<RaBillDto>(data?.total)}
        scroll={{ x: fixedProject ? 900 : 1150 }}
        locale={{ emptyText: preparer ? 'No bills yet. Prepare the first one from the approved measurements.' : 'No bills yet' }}
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

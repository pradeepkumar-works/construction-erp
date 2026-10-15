'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Progress, Select, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SubmissionStatus, WorkOrderDto, WorkOrderSortField } from '@erp/shared';
import { canIssueWorkOrder } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useVendors, useWorkOrders } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { WORK_ORDER_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { WoStateTag, WorkOrderDrawer } from './WorkOrderDrawer';
import { WorkOrderFormModal } from './WorkOrderFormModal';

const SUB_KINDS = new Set(['SUBCONTRACTOR', 'LABOUR_CONTRACTOR']);

/** Work orders, on the Work Orders page and as a project tab. `openId` opens one order (from a link). */
export function WorkOrderList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const list = useListState<WorkOrderSortField>({ sortBy: 'woDate', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrderDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, status, vendorId, open: onlyOpen || undefined };
  const { data, isLoading, isFetching, error, refetch } = useWorkOrders(filters);
  const { data: vendors } = useVendors();
  const issuer = !!user && canIssueWorkOrder(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: WorkOrderSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const exportRows = async () => {
    const rows = await fetchAllPages<WorkOrderDto>('/work-orders', { ...filters });
    downloadXlsx(exportFileName('work-orders'), 'Work orders', WORK_ORDER_EXPORT, rows);
    return rows.length;
  };

  const columns: TableProps<WorkOrderDto>['columns'] = [
    {
      title: 'WO',
      ...sort('woNo'),
      width: 150,
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)} strong className="mono">
            {r.woNo}
          </Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {formatDate(r.woDate)}
          </div>
        </div>
      ),
    },
    {
      title: 'Subcontractor',
      ...sort('vendor'),
      render: (_, r) => (
        <div>
          {r.vendorName}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.title}
          </div>
        </div>
      ),
    },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: WorkOrderDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    { title: 'Value', dataIndex: 'value', width: 150, align: 'right', ...sort('value'), render: (v) => <strong className="mono">{formatINR(v)}</strong> },
    { title: 'Billed', key: 'billed', width: 130, render: (_, r) => (r.status === 'APPROVED' ? <Progress percent={r.billedPct} size="small" style={{ margin: 0 }} /> : <span className="text-muted">-</span>) },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 170,
      ...sort('status'),
      render: (s, r) => (
        <Space size={4} wrap>
          <StatusTag status={s} />
          <WoStateTag order={r} />
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
          <ReviewActions type="work_order" id={r.id} status={r.status} amount={r.value} size="small" compact />
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
        searchPlaceholder="Search WO no., subcontractor, work"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {issuer ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                New work order
              </Button>
            ) : null}
          </>
        }
      >
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="Any subcontractor"
          style={{ width: 220 }}
          value={vendorId}
          onChange={reset(setVendorId)}
          options={(vendors ?? []).filter((v) => v.kinds.some((k) => SUB_KINDS.has(k))).map((v) => ({ value: v.id, label: v.name }))}
        />
        <Checkbox checked={onlyOpen} onChange={(e) => reset(setOnlyOpen)(e.target.checked)}>
          Open orders only
        </Checkbox>
      </ListToolbar>
      <Table<WorkOrderDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<WorkOrderDto>(data?.total)}
        scroll={{ x: fixedProject ? 1000 : 1200 }}
        locale={{ emptyText: issuer ? 'No work orders yet. Give work to a subcontractor with New work order.' : 'No work orders yet' }}
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

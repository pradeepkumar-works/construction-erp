'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Select, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SubcontractBillDto, SubcontractBillSortField, SubmissionStatus } from '@erp/shared';
import { canPrepareSubcontractBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useSubcontractBills, useVendors } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { SUBCONTRACT_BILL_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { PaidTag } from '@/components/payables/BillPayments';
import { StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { overdueDays } from '@/components/purchasing/VendorBillDrawer';
import { SubBillDrawer } from './SubBillDrawer';
import { SubBillFormModal } from './SubBillFormModal';

const SUB_KINDS = new Set(['SUBCONTRACTOR', 'LABOUR_CONTRACTOR']);

/** Subcontractor bills, on their page and as a project tab. `openId` opens one bill (from a link). */
export function SubBillList({ projectId: fixedProject, openId: initialOpen }: { projectId?: string; openId?: string | null }) {
  const { user } = useAuth();
  const list = useListState<SubcontractBillSortField>({ sortBy: 'billDate', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubcontractBillDto | null>(null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, status, vendorId };
  const { data, isLoading, isFetching, error, refetch } = useSubcontractBills(filters);
  const { data: vendors } = useVendors();
  const preparer = !!user && canPrepareSubcontractBill(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: SubcontractBillSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const exportRows = async () => {
    const rows = await fetchAllPages<SubcontractBillDto>('/subcontract-bills', { ...filters });
    downloadXlsx(exportFileName('subcontractor-bills'), 'Subcontractor bills', SUBCONTRACT_BILL_EXPORT, rows);
    return rows.length;
  };

  const columns: TableProps<SubcontractBillDto>['columns'] = [
    {
      title: 'Bill',
      ...sort('billDate'),
      width: 200,
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)} strong className="mono">
            {r.label}
          </Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {formatDate(r.billDate)}
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
            {r.woTitle}
          </div>
        </div>
      ),
    },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), ellipsis: true, render: (v: string, r: SubcontractBillDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    { title: 'Work value', dataIndex: 'grossAmount', width: 140, align: 'right', ...sort('grossAmount'), render: (v) => <span className="mono">{formatINR(v)}</span> },
    { title: 'Net payable', dataIndex: 'netPayable', width: 140, align: 'right', ...sort('netPayable'), render: (v) => <strong className="mono">{formatINR(v)}</strong> },
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
            {late && (
              <div>
                <Tag color="red" style={{ margin: 0 }}>
                  {late} days late
                </Tag>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 140,
      ...sort('status'),
      render: (s, r) => (
        <Space size={4} wrap>
          <StatusTag status={s} />
          <PaidTag bill={r} />
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
          <ReviewActions type="subcontract_bill" id={r.id} status={r.status} amount={r.grossAmount} size="small" compact />
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
        searchPlaceholder="Search WO no., subcontractor, invoice"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {preparer ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                New bill
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
      </ListToolbar>
      <Table<SubcontractBillDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<SubcontractBillDto>(data?.total)}
        scroll={{ x: fixedProject ? 1000 : 1200 }}
        locale={{ emptyText: preparer ? 'No subcontractor bills yet. Prepare one from an approved work order.' : 'No subcontractor bills yet' }}
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

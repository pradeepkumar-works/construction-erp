'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Segmented, Table, Tag, Typography, Alert } from 'antd';
import type { TableProps } from 'antd';
import type { PendingApprovalDto, SubmissionType } from '@erp/shared';
import { APPROVAL_AMOUNT_BASIS, SUBMISSION_TYPE_LABELS, approvalRightsOf, mayApprove } from '@erp/shared';
import { usePendingApprovals } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatINR } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { EmptyArt } from '@/components/common/EmptyArt';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ProgressDrawer } from '@/components/progress/ProgressDrawer';
import { DprDrawer } from '@/components/dpr/DprDrawer';
import { MrDrawer } from '@/components/material/MrDrawer';
import { MachineryDrawer } from '@/components/machinery/MachineryDrawer';
import { ExpenseDrawer } from '@/components/expenses/ExpenseDrawer';
import { MeasurementDrawer } from '@/components/measurements/MeasurementDrawer';
import { BillDrawer } from '@/components/bills/BillDrawer';
import { PurchaseOrderDrawer } from '@/components/purchasing/PurchaseOrderDrawer';
import { VendorBillDrawer } from '@/components/purchasing/VendorBillDrawer';
import { WorkOrderDrawer } from '@/components/subcontracts/WorkOrderDrawer';
import { SubBillDrawer } from '@/components/subcontracts/SubBillDrawer';
import { InspectionDrawer } from '@/components/inspections/InspectionDrawer';
import { CardToolbar } from '@/components/common/CardToolbar';

const TYPE_COLORS: Record<SubmissionType, string> = { PROGRESS: 'blue', DPR: 'purple', MATERIAL_REQUEST: 'cyan', MACHINERY: 'magenta', EXPENSE: 'default', MEASUREMENT: 'geekblue', BILL: 'gold', PURCHASE_ORDER: 'orange', VENDOR_BILL: 'volcano', WORK_ORDER: 'lime', SUBCONTRACT_BILL: 'green', INSPECTION: 'orange' };

export default function ApprovalsPage() {
  const { user } = useAuth();
  const approver = !!user && mayApprove(user);
  const rights = user ? approvalRightsOf(user) : [];
  const limited = rights.filter((r) => r.maxAmount !== null && APPROVAL_AMOUNT_BASIS[r.type]);
  const { data, isLoading, error, refetch } = usePendingApprovals(approver);
  const [type, setType] = useState<'ALL' | SubmissionType>('ALL');
  const [projectId, setProjectId] = useState<string | undefined>();
  const [open, setOpen] = useState<{ type: SubmissionType; id: string } | null>(null);

  const filtered = useMemo(
    () => (data ?? []).filter((p) => (type === 'ALL' || p.type === type) && (!projectId || p.projectId === projectId)),
    [data, type, projectId],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: data?.length ?? 0 };
    for (const p of data ?? []) c[p.type] = (c[p.type] ?? 0) + 1;
    return c;
  }, [data]);

  const columns: TableProps<PendingApprovalDto>['columns'] = [
    { title: 'Type', dataIndex: 'type', width: 150, render: (t: SubmissionType) => <Tag color={TYPE_COLORS[t]} style={{ margin: 0 }}>{SUBMISSION_TYPE_LABELS[t]}</Tag> },
    { title: 'Item', dataIndex: 'title', render: (v, r) => <Typography.Link onClick={() => setOpen({ type: r.type, id: r.id })}>{v}</Typography.Link> },
    { title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: { showTitle: true }, render: (v, r) => <Link href={`/projects/${r.projectId}`}>{v}</Link> },
    { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right', render: (v: string | null) => (v === null ? <span className="text-muted">-</span> : <span className="mono">{formatINR(v)}</span>) },
    { title: 'Submitted by', dataIndex: 'submittedByName', width: 140 },
    { title: 'Submitted', dataIndex: 'submittedAt', width: 150, render: (v) => formatDateTime(v), sorter: (a, b) => a.submittedAt.localeCompare(b.submittedAt), defaultSortOrder: 'ascend' },
    { title: '', key: 'a', width: 96, fixed: 'right', render: (_, r) => <Button type="primary" size="small" onClick={() => setOpen({ type: r.type, id: r.id })}>Review</Button> },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Approvals" subtitle="Site submissions waiting for your review" />
      {!approver && <Alert type="info" showIcon title="Your role cannot approve submissions. Submissions you create appear in the project pages with their current status." style={{ marginBottom: 16 }} />}
      {limited.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={`Your approval limit: ${limited.map((r) => `${SUBMISSION_TYPE_LABELS[r.type].toLowerCase()} up to ${formatINR(r.maxAmount)}`).join(', ')}. Anything above goes to a higher approver.`}
          style={{ marginBottom: 16 }}
        />
      )}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card size="small">
        <CardToolbar wrap gap={12} align="center">
          <Segmented
            value={type}
            onChange={(v) => setType(v as 'ALL' | SubmissionType)}
            options={[
              { value: 'ALL', label: `All (${counts.ALL ?? 0})` },
              ...(
                [
                  ['PROGRESS', 'Progress'],
                  ['DPR', 'DPR'],
                  ['MATERIAL_REQUEST', 'Material'],
                  ['MACHINERY', 'Machinery'],
                  ['EXPENSE', 'Expenses'],
                  ['MEASUREMENT', 'Measurements'],
                  ['BILL', 'RA bills'],
                  ['PURCHASE_ORDER', 'POs'],
                  ['VENDOR_BILL', 'Vendor bills'],
                  ['WORK_ORDER', 'Work orders'],
                  ['SUBCONTRACT_BILL', 'Sub bills'],
                  ['INSPECTION', 'Inspections'],
                ] as [SubmissionType, string][]
              )
                .filter(([t]) => rights.some((r) => r.type === t))
                .map(([t, label]) => ({ value: t, label: `${label} (${counts[t] ?? 0})` })),
            ]}
          />
          <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} />
        </CardToolbar>
        <Table<PendingApprovalDto>
          rowKey={(r) => `${r.type}-${r.id}`}
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          size="middle"
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 1120 }}
          locale={{ emptyText: <EmptyArt art="approved" title={approver ? 'Nothing waiting for approval. Great work!' : 'No pending approvals'} /> }}
        />
      </Card>
      <ProgressDrawer id={open?.type === 'PROGRESS' ? open.id : null} open={open?.type === 'PROGRESS'} onClose={() => setOpen(null)} />
      <DprDrawer id={open?.type === 'DPR' ? open.id : null} open={open?.type === 'DPR'} onClose={() => setOpen(null)} />
      <MrDrawer id={open?.type === 'MATERIAL_REQUEST' ? open.id : null} open={open?.type === 'MATERIAL_REQUEST'} onClose={() => setOpen(null)} />
      <MachineryDrawer id={open?.type === 'MACHINERY' ? open.id : null} open={open?.type === 'MACHINERY'} onClose={() => setOpen(null)} />
      <ExpenseDrawer id={open?.type === 'EXPENSE' ? open.id : null} open={open?.type === 'EXPENSE'} onClose={() => setOpen(null)} />
      <MeasurementDrawer id={open?.type === 'MEASUREMENT' ? open.id : null} open={open?.type === 'MEASUREMENT'} onClose={() => setOpen(null)} />
      <BillDrawer id={open?.type === 'BILL' ? open.id : null} open={open?.type === 'BILL'} onClose={() => setOpen(null)} />
      <PurchaseOrderDrawer id={open?.type === 'PURCHASE_ORDER' ? open.id : null} open={open?.type === 'PURCHASE_ORDER'} onClose={() => setOpen(null)} />
      <VendorBillDrawer id={open?.type === 'VENDOR_BILL' ? open.id : null} open={open?.type === 'VENDOR_BILL'} onClose={() => setOpen(null)} />
      <WorkOrderDrawer id={open?.type === 'WORK_ORDER' ? open.id : null} open={open?.type === 'WORK_ORDER'} onClose={() => setOpen(null)} />
      <SubBillDrawer id={open?.type === 'SUBCONTRACT_BILL' ? open.id : null} open={open?.type === 'SUBCONTRACT_BILL'} onClose={() => setOpen(null)} />
      <InspectionDrawer id={open?.type === 'INSPECTION' ? open.id : null} open={open?.type === 'INSPECTION'} onClose={() => setOpen(null)} />
    </div>
  );
}

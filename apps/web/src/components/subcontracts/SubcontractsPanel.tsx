'use client';

import React from 'react';
import { Divider, Table, Tooltip, Typography } from 'antd';
import type { WorkOrderMarginDto } from '@erp/shared';
import { canPrepareSubcontractBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useWorkOrderMargin } from '@/lib/queries';
import { formatINR, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { WorkOrderList } from './WorkOrderList';
import { SubBillList } from './SubBillList';

/** Client rate against what the subcontractors are paid, per BOQ item given out on approved work orders. */
export function SubcontractMargin({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useWorkOrderMargin(projectId);
  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  return (
    <Table<WorkOrderMarginDto>
      rowKey="boqItemId"
      size="small"
      loading={isLoading}
      pagination={false}
      dataSource={data ?? []}
      scroll={{ x: 900 }}
      locale={{ emptyText: 'No BOQ item is on an approved work order yet' }}
      columns={[
        {
          title: 'BOQ item',
          render: (_, r) => (
            <div>
              <strong>{r.itemNo}</strong> {r.description}
            </div>
          ),
        },
        { title: 'BOQ qty', dataIndex: 'boqQty', width: 120, align: 'right', render: (v, r) => <span className="mono">{formatQty(v)} {r.unit}</span> },
        { title: 'Client rate', dataIndex: 'clientRate', width: 120, align: 'right', render: (v) => <span className="mono">{formatINR(v, true)}</span> },
        {
          title: 'Subcontract rate',
          dataIndex: 'subRate',
          width: 140,
          align: 'right',
          render: (v, r) => (
            <Tooltip title={r.workOrders.map((w) => `${w.woNo} ${w.vendorName}: ${formatQty(w.quantity)} at ${formatINR(w.rate, true)}`).join('; ')}>
              <span className="mono">{formatINR(v, true)}</span>
            </Tooltip>
          ),
        },
        { title: 'Margin', dataIndex: 'margin', width: 120, align: 'right', render: (v) => <span className="mono">{formatINR(v, true)}</span> },
        {
          title: 'Margin %',
          dataIndex: 'marginPct',
          width: 100,
          align: 'right',
          render: (v: number) => (
            <Typography.Text strong type={v < 0 ? 'danger' : v < 10 ? 'warning' : 'success'}>
              {v}%
            </Typography.Text>
          ),
        },
      ]}
    />
  );
}

/** The project's subcontracts tab: work orders, and for billing roles their bills and the margin on each item. */
export function SubcontractsPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const billing = !!user && canPrepareSubcontractBill(user.roleKey);
  return (
    <>
      <WorkOrderList projectId={projectId} />
      {billing && (
        <>
          <Divider titlePlacement="start">Subcontractor bills</Divider>
          <SubBillList projectId={projectId} />
          <Divider titlePlacement="start">Margin on subcontracted items</Divider>
          <SubcontractMargin projectId={projectId} />
        </>
      )}
    </>
  );
}

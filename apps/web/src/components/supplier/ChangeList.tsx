'use client';

import React from 'react';
import { Table, Typography } from 'antd';
import type { SupplierChangeDto } from '@erp/shared';
import { formatDateTime } from '@/lib/format';
import { ChangeStatusTag } from './supplierUi';

/** Changes a supplier asked for to their details: their own profile, the vendor's portal drawer and the supplier inbox. */
export function ChangeList({ changes, extra, vendorColumn }: { changes: SupplierChangeDto[]; extra?: (c: SupplierChangeDto) => React.ReactNode; vendorColumn?: boolean }) {
  return (
    <Table<SupplierChangeDto>
      rowKey="id"
      size="small"
      dataSource={changes}
      pagination={false}
      locale={{ emptyText: 'No changes asked for' }}
      scroll={{ x: 760 }}
      columns={[
        ...(vendorColumn ? [{ title: 'Supplier', dataIndex: 'vendorName', width: 180, render: (v: string) => <span translate="no">{v}</span> }] : []),
        { title: 'Requested', dataIndex: 'createdAt', width: 150, render: (v: string, c) => <span>{formatDateTime(v)}<br /><Typography.Text type="secondary">{c.requestedBy}</Typography.Text></span> },
        {
          title: 'Change',
          key: 'changes',
          render: (_, c) => (
            <div>
              {c.changes.map((x) => (
                <div key={x.field}>
                  {x.label}: <span translate="no">{x.from ?? '-'}</span> to <span translate="no">{x.to ?? '-'}</span>
                </div>
              ))}
              {c.note ? <Typography.Text type="secondary">{c.note}</Typography.Text> : null}
            </div>
          ),
        },
        {
          title: 'Status',
          key: 'status',
          width: 200,
          render: (_, c) => (
            <div>
              <ChangeStatusTag status={c.status} />
              {c.decidedAt ? <Typography.Text type="secondary">{`${formatDateTime(c.decidedAt)}${c.decidedBy ? ` by ${c.decidedBy}` : ''}`}</Typography.Text> : null}
              {c.decisionNote ? <div>{c.decisionNote}</div> : null}
            </div>
          ),
        },
        ...(extra ? [{ title: 'Action', key: 'action', width: 200, render: (_: unknown, c: SupplierChangeDto) => extra(c) }] : []),
      ]}
    />
  );
}

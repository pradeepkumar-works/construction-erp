'use client';

import React, { useState } from 'react';
import { Table, Typography } from 'antd';
import type { PayslipDto } from '@erp/shared';
import { useMyPayslips } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { PayslipModal } from './PayslipModal';
import { Rupees, monthLabel } from './payrollUi';

/** The signed-in person's own payslips, once each month's run is approved; a row opens it to read or print. */
export function MyPayslips() {
  const { data, isLoading, error, refetch } = useMyPayslips();
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = data?.find((p) => p.id === openId) ?? null;
  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  return (
    <div style={{ padding: 16 }}>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 640 }}>
        Each month&apos;s payslip shows here once the salary is approved. Open one to see the details or print it.
      </Typography.Paragraph>
      <Table<PayslipDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={false}
        scroll={{ x: 640 }}
        onRow={(p) => ({ onClick: () => setOpenId(p.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: 'No payslips yet' }}
        columns={[
          { title: 'Month', dataIndex: 'month', width: 160, render: (v: string) => monthLabel(v) },
          { title: 'Days paid', key: 'd', width: 110, render: (_, p) => `${p.paidDays} of ${p.monthDays}` },
          { title: 'Gross', dataIndex: 'gross', align: 'right', render: (v: string) => <Rupees value={v} /> },
          { title: 'Deductions', dataIndex: 'deductions', align: 'right', render: (v: string) => <Rupees value={v} /> },
          { title: 'Net pay', dataIndex: 'net', align: 'right', render: (v: string) => <strong><Rupees value={v} /></strong> },
        ]}
      />
      <PayslipModal slip={shown} open={!!shown} onClose={() => setOpenId(null)} />
    </div>
  );
}

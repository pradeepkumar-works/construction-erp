'use client';

import React, { useMemo } from 'react';
import { Button, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ContractorMonthRowDto } from '@erp/shared';
import { useContractorMonth } from '@/lib/queries';
import { downloadXlsx, type ExportColumn } from '@/lib/exportExcel';
import { formatINR, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';

/** Labour contractors' month from the attendance register: man-days by project and trade, at the daily rates. */
export function ContractorMonth({ month, projectId }: { month: string; projectId?: string }) {
  const { data, isLoading, isFetching, error, refetch } = useContractorMonth(month, projectId);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totals = useMemo(() => {
    const by = new Map<string, { manDays: number; amount: number }>();
    for (const r of rows) {
      const t = by.get(r.contractor) ?? { manDays: 0, amount: 0 };
      by.set(r.contractor, { manDays: t.manDays + r.manDays, amount: t.amount + toNumber(r.amount) });
    }
    return by;
  }, [rows]);
  const unpriced = rows.filter((r) => !r.dailyRate).length;

  const exportColumns: ExportColumn<ContractorMonthRowDto>[] = [
    { header: 'Contractor', value: (r) => r.contractor, width: 30 },
    { header: 'Project', value: (r) => `${r.projectCode} ${r.projectName}`, width: 40 },
    { header: 'Trade', value: (r) => r.category, width: 16 },
    { header: 'Days', value: (r) => r.days },
    { header: 'Man-days', value: (r) => r.manDays },
    { header: 'Daily rate', value: (r) => (r.dailyRate ? toNumber(r.dailyRate) : '') },
    { header: 'Amount', value: (r) => (r.amount ? toNumber(r.amount) : ''), width: 14 },
    { header: 'Paid through work order bills', value: (r) => (r.onWorkOrder ? 'Yes' : ''), width: 14 },
  ];

  const columns: TableProps<ContractorMonthRowDto>['columns'] = [
    {
      title: 'Contractor',
      dataIndex: 'contractor',
      width: 260,
      render: (v: string, r, i) =>
        i === 0 || rows[i - 1].contractor !== v ? (
          <div>
            <div>{v}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {totals.get(v)!.manDays} man-days{totals.get(v)!.amount ? `, ${formatINR(totals.get(v)!.amount)}` : ''}
            </Typography.Text>
          </div>
        ) : null,
    },
    { title: 'Project', dataIndex: 'projectName', width: 280, ellipsis: true, render: (v: string, r) => `${r.projectCode} ${v}` },
    { title: 'Trade', dataIndex: 'category', width: 140 },
    { title: <Tooltip title="Days with a sheet that had this trade">Days</Tooltip>, dataIndex: 'days', width: 70, align: 'right' },
    { title: 'Man-days', dataIndex: 'manDays', width: 100, align: 'right' },
    { title: 'Daily rate', dataIndex: 'dailyRate', width: 110, align: 'right', render: (v: string | null) => (v ? formatINR(v) : <Typography.Text type="secondary">No rate</Typography.Text>) },
    { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v: string | null) => (v ? formatINR(v) : '') },
    { title: '', key: 'wo', width: 150, render: (_, r) => (r.onWorkOrder ? <Tooltip title="They have an approved work order on this project, so they are paid through its bills"><Tag>On work order</Tag></Tooltip> : null) },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography.Text type="secondary">
          From the attendance register, at the daily rates under Project Cost.{unpriced ? ` ${unpriced} line${unpriced === 1 ? ' has' : 's have'} no rate.` : ''}
        </Typography.Text>
        <div style={{ flex: 1 }} />
        <Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => downloadXlsx(`labour-contractors-${month}`, `Contractors ${month}`, exportColumns, rows)}>
          Export Excel
        </Button>
      </div>
      <Table<ContractorMonthRowDto>
        rowKey={(r) => `${r.contractor}|${r.projectId}|${r.category}`}
        size="small"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1250 }}
        locale={{ emptyText: 'No attendance recorded this month' }}
      />
    </>
  );
}

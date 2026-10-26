'use client';

import React from 'react';
import { Table } from 'antd';
import type { PortfolioMonthDto } from '@erp/shared';
import { formatINR, formatINRCompact, toNumber } from '@/lib/format';
import { monthLabel } from '@/components/home/chartData';

/** The trend's figures as a table, month by month. */
export function TrendTable({ months, workDone }: { months: (PortfolioMonthDto & { workDone?: string })[]; workDone?: boolean }) {
  const money = {
    align: 'right' as const,
    className: 'mono',
    render: (v: string) => <span translate="no">{formatINR(v)}</span>,
  };
  return (
    <Table
      size="small"
      pagination={false}
      scroll={{ y: 280, x: 520 }}
      rowKey="month"
      dataSource={months}
      columns={[
        {
          title: 'Month',
          dataIndex: 'month',
          render: (m: string) => monthLabel(m),
        },
        ...(workDone ? [{ title: 'Work done', dataIndex: 'workDone', ...money }] : []),
        { title: 'Billed', dataIndex: 'billed', ...money },
        { title: 'Received', dataIndex: 'received', ...money },
        { title: 'Cost', dataIndex: 'cost', ...money },
      ]}
    />
  );
}

/** One line for the chart card: the year's billing, collection and cost. */
export function trendSummary(months: PortfolioMonthDto[]): string {
  const sum = (k: 'billed' | 'received' | 'cost') => months.reduce((s, m) => s + toNumber(m[k]), 0);
  if (!months.length) return 'No months yet';
  const top = months.reduce((a, b) => (toNumber(b.billed) > toNumber(a.billed) ? b : a));
  const most = toNumber(top.billed) > 0 ? ` The most billed in a month was ${monthLabel(top.month)}, ${formatINRCompact(top.billed)}.` : ' Nothing was billed.';
  return `Over ${months.length} months: billed ${formatINRCompact(sum('billed'))}, received ${formatINRCompact(sum('received'))}, cost ${formatINRCompact(sum('cost'))}.${most}`;
}

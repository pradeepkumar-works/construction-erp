'use client';

import React from 'react';
import { Table } from 'antd';
import type { PortfolioVerticalDto } from '@erp/shared';
import { formatINRCompact, formatPct } from '@/lib/format';

const money = (v: string) => <span translate="no">{formatINRCompact(v)}</span>;

/** The portfolio by vertical (item 167): each vertical's projects added up, from contract to what clients owe. */
export function VerticalsTable({ verticals }: { verticals: PortfolioVerticalDto[] }) {
  return (
    <Table<PortfolioVerticalDto>
      size="small"
      rowKey={(v) => v.code ?? 'none'}
      pagination={false}
      dataSource={verticals}
      scroll={{ x: 820 }}
      columns={[
        { title: 'Vertical', dataIndex: 'name', render: (v: string) => <span translate="no">{v}</span> },
        { title: 'Projects', dataIndex: 'projects', align: 'right', width: 90 },
        { title: 'Contract value', dataIndex: 'contractValue', align: 'right', width: 130, render: money },
        { title: 'Order book', dataIndex: 'orderBook', align: 'right', width: 120, render: money },
        { title: 'Work done', dataIndex: 'workDone', align: 'right', width: 120, render: money },
        { title: 'Billed', dataIndex: 'billed', align: 'right', width: 120, render: money },
        { title: 'Clients owe', dataIndex: 'outstanding', align: 'right', width: 120, render: money },
        { title: 'Margin', dataIndex: 'marginPct', align: 'right', width: 90, render: (v: number | null) => (v === null ? '-' : <span translate="no">{formatPct(v)}</span>) },
      ]}
    />
  );
}

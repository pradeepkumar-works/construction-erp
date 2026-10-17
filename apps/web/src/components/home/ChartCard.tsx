'use client';

import React, { useState } from 'react';
import { Card, Flex, Segmented, Table, Typography, theme } from 'antd';
import type { CostHeadsDto, HomeTrendsDto } from '@erp/shared';
import { formatINR, formatPct, toNumber } from '@/lib/format';
import { WhenInView } from './WhenInView';
import { costHeadRows, monthLabel } from './chartData';

type View = 'chart' | 'table';

/**
 * A home chart in a card (UX item 81): the summary in words above it, the drawing named by that summary, and Chart / Table
 * to read the same figures as a table instead. The chart itself comes from `charts.tsx`, loaded on its own.
 */
export function ChartCard({ title, note, summary, chart, table }: { title: string; note?: React.ReactNode; summary: string; chart: React.ReactNode; table: React.ReactNode }) {
  const { token } = theme.useToken();
  const [view, setView] = useState<View>('chart');
  return (
    <Card
      size="small"
      title={title}
      extra={
        <Flex align="center" gap={token.marginSM}>
          {note}
          <Segmented<View>
            size="small"
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
            aria-label={`Show ${title.toLowerCase()} as`}
          />
        </Flex>
      }
      style={{ height: '100%' }}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, marginBottom: token.marginXS }}>
        {summary}
      </Typography.Paragraph>
      {view === 'chart' ? (
        <div role="img" aria-label={summary}>
          <WhenInView minHeight={280}>{chart}</WhenInView>
        </div>
      ) : (
        table
      )}
    </Card>
  );
}

const tableProps = { size: 'small', pagination: false, scroll: { y: 280 } } as const;

/** The progress curve's figures: cumulative planned and actual, month by month. */
export function SCurveTable({ data }: { data: HomeTrendsDto['sCurve'] }) {
  return (
    <Table
      {...tableProps}
      rowKey="month"
      dataSource={data}
      columns={[
        { title: 'Month', dataIndex: 'month', render: (m: string) => monthLabel(m) },
        { title: 'Planned', dataIndex: 'planned', align: 'right', className: 'mono', render: (v: number) => formatPct(v) },
        { title: 'Actual', dataIndex: 'actual', align: 'right', className: 'mono', render: (v: number | null) => formatPct(v) },
      ]}
    />
  );
}

/** Cash received and paid, month by month. */
export function CashFlowTable({ months, cashIn, cashOut }: { months: string[]; cashIn?: string[]; cashOut?: string[] }) {
  const rows = months.map((month, i) => ({ month, cashIn: cashIn?.[i], cashOut: cashOut?.[i] }));
  return (
    <Table
      {...tableProps}
      rowKey="month"
      dataSource={rows}
      columns={[
        { title: 'Month', dataIndex: 'month', render: (m: string) => monthLabel(m) },
        ...(cashIn ? [{ title: 'Received', dataIndex: 'cashIn', align: 'right' as const, className: 'mono', render: (v: string) => formatINR(v) }] : []),
        ...(cashOut ? [{ title: 'Paid', dataIndex: 'cashOut', align: 'right' as const, className: 'mono', render: (v: string) => formatINR(v) }] : []),
      ]}
    />
  );
}

/** Cost by head, largest first, with the total. */
export function CostByHeadTable({ heads }: { heads: CostHeadsDto }) {
  return (
    <Table
      {...tableProps}
      rowKey="head"
      dataSource={costHeadRows(heads)}
      columns={[
        { title: 'Head', dataIndex: 'head' },
        { title: 'Cost', dataIndex: 'amount', align: 'right', className: 'mono', render: (v: number) => formatINR(v) },
        { title: 'Share', dataIndex: 'share', align: 'right', className: 'mono', render: (v: number) => formatPct(v) },
      ]}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0}>
            <Typography.Text strong>Total</Typography.Text>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right" className="mono">
            <Typography.Text strong>{formatINR(heads.total)}</Typography.Text>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={2} align="right" className="mono">
            {toNumber(heads.total) > 0 ? '100%' : '-'}
          </Table.Summary.Cell>
        </Table.Summary.Row>
      )}
    />
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { Alert, Statistic, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { StockValuationRowDto } from '@erp/shared';
import { STOCK_AGEING_BUCKETS, unitLabel } from '@erp/shared';
import { useStockValuation } from '@/lib/queries';
import { formatINR, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ExportButton } from '@/components/common/ExportButton';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeFontSize } from '@/lib/theme';

const EXPORT: ExportColumn<StockValuationRowDto>[] = [
  { header: 'Project', value: (r) => r.projectName, width: 30 },
  { header: 'Item', value: (r) => r.itemName, width: 36 },
  { header: 'Category', value: (r) => r.category ?? '', width: 14 },
  { header: 'Unit', value: (r) => r.unit, width: 8 },
  { header: 'Balance', value: (r) => toNumber(r.balance), width: 12 },
  { header: 'Rate', value: (r) => (r.rate === null ? '' : toNumber(r.rate)), width: 12 },
  { header: 'Value', value: (r) => toNumber(r.value), width: 14 },
  ...STOCK_AGEING_BUCKETS.map((b, i) => ({ header: b, value: (r: StockValuationRowDto) => toNumber(r.ageingQty[i]), width: 12 })),
  { header: 'Oldest (days)', value: (r) => r.oldestDays ?? '', width: 12 },
];

/** Stock on hand at item master rates, and how long it has been in the store (first in, first out). */
export function StockValuation({ projectId }: { projectId?: string }) {
  const { data, isLoading, isFetching, error, refetch } = useStockValuation(projectId);
  const rows = data?.rows ?? [];
  const columns: TableProps<StockValuationRowDto>['columns'] = [
    { title: 'Item', dataIndex: 'itemName', render: (v, r) => <span>{v}{r.category ? <span className="text-muted"> · {r.category}</span> : null}</span> },
    ...(projectId ? [] : [{ title: 'Project', dataIndex: 'projectName', width: 220, ellipsis: true, render: (v: string, r: StockValuationRowDto) => <Link href={`/projects/${r.projectId}?tab=stock`}>{v}</Link> }]),
    { title: 'Balance', dataIndex: 'balance', width: 130, align: 'right', render: (v, r) => <span className="mono" translate="no">{`${formatQty(v)} ${unitLabel(r.unit)}`}</span> },
    { title: 'Rate', dataIndex: 'rate', width: 120, align: 'right', render: (v: string | null) => (v === null ? <Typography.Text type="warning">No rate</Typography.Text> : <span className="mono" translate="no">{formatINR(v, true)}</span>) },
    { title: 'Value', dataIndex: 'value', width: 140, align: 'right', render: (v) => <span className="mono" translate="no">{formatINR(v)}</span> },
    ...STOCK_AGEING_BUCKETS.map((b, i) => ({
      title: b,
      key: `age${i}`,
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: StockValuationRowDto) => (Number(r.ageingQty[i]) === 0 ? <span className="text-muted">{NO_VALUE}</span> : <span className="mono" translate="no">{formatQty(r.ageingQty[i])}</span>),
    })),
  ];

  return (
    <div className="stock-valuation">
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <CardToolbar variant="summary" wrap gap={32} align="flex-end">
        <Statistic title="Stock value" value={formatINR(data?.totalValue ?? 0)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
        {STOCK_AGEING_BUCKETS.map((b, i) => (
          <Statistic key={b} title={b} value={formatINR(data?.ageingValue[i] ?? 0)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <ExportButton
            onExport={async () => {
              await downloadXlsx(exportFileName('stock-valuation'), 'valuation', EXPORT, rows);
              return rows.length;
            }}
          />
        </div>
      </CardToolbar>
      {data?.unpricedItems ? (
        <Alert
          type="warning"
          showIcon
          style={{ margin: 12 }}
          title={`${data.unpricedItems} item${data.unpricedItems === 1 ? ' has' : 's have'} no rate and ${data.unpricedItems === 1 ? 'is' : 'are'} not valued`}
          description="Set rates in the item master."
        />
      ) : null}
      <Table<StockValuationRowDto>
        rowKey={(r) => `${r.projectId}|${r.itemId}`}
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ x: projectId ? 980 : 1200 }}
        locale={{ emptyText: 'Nothing in stock' }}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), padding: '8px 16px 0' }}>
        Stock on hand at the item master rate. Ageing assumes the oldest stock is used first, so what is on hand is the latest that came in (GRNs,
        transfers in, returns from site and positive adjustments); the buckets show how long ago that was.
      </Typography.Paragraph>
    </div>
  );
}

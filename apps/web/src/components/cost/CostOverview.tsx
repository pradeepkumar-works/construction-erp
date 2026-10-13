'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Space, Statistic, Table, Typography } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import type { ProjectCostSummaryDto } from '@erp/shared';
import { PROJECT_TYPE_LABELS } from '@erp/shared';
import { useCostSummary } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ExportButton } from '@/components/common/ExportButton';
import { CostBar, CostLegend } from './CostBar';
import { DEFAULT_PERIOD, PeriodPicker, periodLabel, periodParams, type PeriodState } from './PeriodPicker';
import { LabourRatesModal } from './LabourRatesModal';
import { UnpricedNote, unpricedText } from './UnpricedNote';

const money = (v: string) => <span className="mono">{formatINR(v)}</span>;

const EXPORT: ExportColumn<ProjectCostSummaryDto>[] = [
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 40 },
  { header: 'Type', value: (r) => PROJECT_TYPE_LABELS[r.projectType], width: 14 },
  { header: 'Executed value', value: (r) => toNumber(r.executedValue), width: 16 },
  { header: 'Measured value', value: (r) => toNumber(r.measuredValue), width: 16 },
  { header: 'Site expenses', value: (r) => toNumber(r.cost.expenses), width: 14 },
  { header: 'Material issued', value: (r) => toNumber(r.cost.material), width: 14 },
  { header: 'Machinery', value: (r) => toNumber(r.cost.machinery), width: 14 },
  { header: 'Labour', value: (r) => toNumber(r.cost.labour), width: 14 },
  { header: 'Total cost', value: (r) => toNumber(r.cost.total), width: 14 },
  { header: 'Margin', value: (r) => toNumber(r.margin), width: 16 },
  { header: 'Cost % of executed', value: (r) => r.costPct, width: 12 },
  { header: 'Missing rates', value: (r) => unpricedText(r.unpriced).join('; '), width: 40 },
];

/** Every visible project's cost against executed value for a period. */
export function CostOverview() {
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);
  const [ratesOpen, setRatesOpen] = useState(false);
  const params = periodParams(period);
  const { data, isLoading, isFetching, error, refetch } = useCostSummary(params);
  const rows = data ?? [];
  const totals = useMemo(() => {
    const sum = (f: (r: ProjectCostSummaryDto) => string) => rows.reduce((s, r) => s + toNumber(f(r)), 0);
    return { executed: sum((r) => r.executedValue), measured: sum((r) => r.measuredValue), cost: sum((r) => r.cost.total), margin: sum((r) => r.margin) };
  }, [rows]);
  const scale = Math.max(1, ...rows.map((r) => toNumber(r.cost.total)));

  const columns: TableProps<ProjectCostSummaryDto>['columns'] = [
    {
      title: 'Project',
      dataIndex: 'projectName',
      render: (v, r) => (
        <div>
          <Link href={`/projects/${r.projectId}?tab=cost`}>{v}</Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.projectCode} · {PROJECT_TYPE_LABELS[r.projectType]}
          </div>
        </div>
      ),
    },
    { title: 'Executed value', dataIndex: 'executedValue', width: 140, align: 'right', render: money, sorter: (a, b) => toNumber(a.executedValue) - toNumber(b.executedValue) },
    { title: 'Measured (MB)', dataIndex: 'measuredValue', width: 130, align: 'right', render: money },
    {
      title: 'Cost',
      key: 'cost',
      width: 260,
      sorter: (a, b) => toNumber(a.cost.total) - toNumber(b.cost.total),
      render: (_, r) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="mono">{formatINR(r.cost.total)}</span>
            <UnpricedNote unpriced={r.unpriced} />
          </div>
          <CostBar cost={r.cost} scale={scale} height={8} />
        </div>
      ),
    },
    {
      title: 'Margin',
      dataIndex: 'margin',
      width: 140,
      align: 'right',
      sorter: (a, b) => toNumber(a.margin) - toNumber(b.margin),
      render: (v) => <span className="mono" style={{ color: toNumber(v) < 0 ? '#cf1322' : '#1f9d55' }}>{formatINR(v)}</span>,
    },
    { title: 'Cost %', dataIndex: 'costPct', width: 90, align: 'right', render: (v: number | null) => (v === null ? <span className="text-muted">-</span> : `${v}%`), sorter: (a, b) => (a.costPct ?? 0) - (b.costPct ?? 0) },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <Space style={{ marginLeft: 'auto' }}>
          <Button icon={<TeamOutlined />} onClick={() => setRatesOpen(true)}>
            Labour rates
          </Button>
          <ExportButton
            onExport={async () => {
              downloadXlsx(exportFileName('project-cost'), 'cost', EXPORT, rows);
              return rows.length;
            }}
          />
        </Space>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 32, flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0' }}>
        <Statistic title="Executed value" value={formatINR(totals.executed)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="Measured (approved MB)" value={formatINR(totals.measured)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="Cost" value={formatINR(totals.cost)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="Margin" value={formatINR(totals.margin)} styles={{ content: { fontSize: 18, color: totals.margin < 0 ? '#cf1322' : '#1f9d55' } }} />
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
          <CostLegend />
        </div>
      </div>
      <Table<ProjectCostSummaryDto> rowKey="projectId" size="middle" loading={isLoading || isFetching} columns={columns} dataSource={rows} pagination={false} scroll={{ x: 1000 }} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, padding: '8px 16px 0' }}>
        {periodLabel(period)}. Cost is approved site expenses, material issued at the item master rate, approved machinery logs at the hire rate and attendance at the
        trade&apos;s daily rate. Executed value is approved progress at BOQ rates.
      </Typography.Paragraph>
      <LabourRatesModal open={ratesOpen} onClose={() => setRatesOpen(false)} />
    </>
  );
}

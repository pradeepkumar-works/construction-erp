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
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor } from '@/lib/theme';

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
  { header: 'Subcontractors', value: (r) => toNumber(r.cost.subcontract), width: 14 },
  { header: 'Total cost', value: (r) => toNumber(r.cost.total), width: 14 },
  { header: 'Margin', value: (r) => toNumber(r.margin), width: 16 },
  { header: 'Billed (RA bills)', value: (r) => toNumber(r.billedValue), width: 16 },
  { header: 'Cash in', value: (r) => toNumber(r.cashIn), width: 16 },
  { header: 'Vendor bills (incl. GST)', value: (r) => toNumber(r.payableBilled), width: 16 },
  { header: 'Cash out', value: (r) => toNumber(r.cashOut), width: 16 },
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
    return { executed: sum((r) => r.executedValue), measured: sum((r) => r.measuredValue), cost: sum((r) => r.cost.total), margin: sum((r) => r.margin), billed: sum((r) => r.billedValue), cashIn: sum((r) => r.cashIn), cashOut: sum((r) => r.cashOut) };
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
      render: (v) => <span className="mono" style={{ color: toNumber(v) < 0 ? themeColor('colorErrorText') : themeColor('colorSuccessText') }}>{formatINR(v)}</span>,
    },
    { title: 'Billed', dataIndex: 'billedValue', width: 130, align: 'right', render: money, sorter: (a, b) => toNumber(a.billedValue) - toNumber(b.billedValue) },
    { title: 'Cash in', dataIndex: 'cashIn', width: 130, align: 'right', render: money, sorter: (a, b) => toNumber(a.cashIn) - toNumber(b.cashIn) },
    { title: 'Cash out', dataIndex: 'cashOut', width: 130, align: 'right', render: money, sorter: (a, b) => toNumber(a.cashOut) - toNumber(b.cashOut) },
    { title: 'Cost %', dataIndex: 'costPct', width: 90, align: 'right', render: (v: number | null) => (v === null ? <span className="text-muted">-</span> : `${v}%`), sorter: (a, b) => (a.costPct ?? 0) - (b.costPct ?? 0) },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <CardToolbar wrap gap={12} align="center">
        <PeriodPicker value={period} onChange={setPeriod} />
        <Space style={{ marginLeft: 'auto' }}>
          <Button icon={<TeamOutlined />} onClick={() => setRatesOpen(true)}>
            Labour rates
          </Button>
          <ExportButton
            onExport={async () => {
              await downloadXlsx(exportFileName('project-cost'), 'cost', EXPORT, rows);
              return rows.length;
            }}
          />
        </Space>
      </CardToolbar>
      <CardToolbar variant="summary" wrap gap={32}>
        <Statistic title="Executed value" value={formatINR(totals.executed)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="Measured (approved MB)" value={formatINR(totals.measured)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="Cost" value={formatINR(totals.cost)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="Margin" value={formatINR(totals.margin)} styles={{ content: { fontSize: 18, color: totals.margin < 0 ? themeColor('colorErrorText') : themeColor('colorSuccessText') } }} />
        <Statistic title="Billed (RA bills)" value={formatINR(totals.billed)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="Cash in" value={formatINR(totals.cashIn)} styles={{ content: { fontSize: 18 } }} />
        <Statistic title="Cash out" value={formatINR(totals.cashOut)} styles={{ content: { fontSize: 18 } }} />
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
          <CostLegend />
        </div>
      </CardToolbar>
      <Table<ProjectCostSummaryDto> rowKey="projectId" size="middle" loading={isLoading || isFetching} columns={columns} dataSource={rows} pagination={false} scroll={{ x: 1390 }} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, padding: '8px 16px 0' }}>
        {periodLabel(period)}. Cost is approved site expenses, material issued at the item master rate, approved machinery logs at the hire rate, attendance at the
        trade&apos;s daily rate and the work value of approved subcontractor bills (their gangs and the material they were charged for are not counted
        again). Executed value is approved progress at BOQ rates. Billed is the work value of approved RA bills dated in the period; cash in is what
        clients paid into the bank in it and cash out what was paid to vendors and subcontractors.
      </Typography.Paragraph>
      <LabourRatesModal open={ratesOpen} onClose={() => setRatesOpen(false)} />
    </>
  );
}

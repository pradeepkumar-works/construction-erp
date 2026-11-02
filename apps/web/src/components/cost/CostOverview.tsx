'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Space, Statistic, Typography } from 'antd';
import { tk } from '@/ds';
import { TeamOutlined } from '@/components/common/icons';
import type { ProjectCostSummaryDto } from '@erp/shared';
import { PROJECT_TYPE_LABELS } from '@erp/shared';
import { useCostSummary } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ExportButton } from '@/components/common/ExportButton';
import { CostBar, CostLegend } from './CostBar';
import { defaultPeriod, PeriodPicker, periodLabel, periodParams, type PeriodState } from './PeriodPicker';
import { LabourRatesModal } from './LabourRatesModal';
import { UnpricedNote, unpricedText } from './UnpricedNote';
import { CardToolbar } from '@/components/common/CardToolbar';
import { Money } from '@/components/common/Money';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import type { ListColumn } from '@/components/list/DataTable';

type CostRow = ProjectCostSummaryDto & { id: string };


const EXPORT: ExportColumn<ProjectCostSummaryDto>[] = [
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 40 },
  { header: 'Type', value: (r) => PROJECT_TYPE_LABELS[r.projectType], width: 14 },
  { header: 'Work done', value: (r) => toNumber(r.executedValue), width: 16 },
  { header: 'Measured value', value: (r) => toNumber(r.measuredValue), width: 16 },
  { header: 'Site expenses', value: (r) => toNumber(r.cost.expenses), width: 14 },
  { header: 'Material issued', value: (r) => toNumber(r.cost.material), width: 14 },
  { header: 'Machinery', value: (r) => toNumber(r.cost.machinery), width: 14 },
  { header: 'Labour', value: (r) => toNumber(r.cost.labour), width: 14 },
  { header: 'Subcontractors', value: (r) => toNumber(r.cost.subcontract), width: 14 },
  { header: 'Total cost', value: (r) => toNumber(r.cost.total), width: 14 },
  { header: 'Margin', value: (r) => toNumber(r.margin), width: 16 },
  { header: 'Billed (RA bills)', value: (r) => toNumber(r.billedValue), width: 16 },
  { header: 'Money in', value: (r) => toNumber(r.cashIn), width: 16 },
  { header: 'Vendor bills (incl. GST)', value: (r) => toNumber(r.payableBilled), width: 16 },
  { header: 'Money out', value: (r) => toNumber(r.cashOut), width: 16 },
  { header: 'Cost % of executed', value: (r) => r.costPct, width: 12 },
  { header: 'Missing rates', value: (r) => unpricedText(r.unpriced).join('; '), width: 40 },
];

/** Every visible project's cost against executed value for a period. */
export function CostOverview() {
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod);
  const [ratesOpen, setRatesOpen] = useState(false);
  const params = periodParams(period);
  const { data, isLoading, isFetching, error, refetch } = useCostSummary(params);
  const rows = useMemo<CostRow[]>(() => (data ?? []).map((r) => ({ ...r, id: r.projectId })), [data]);
  const totals = useMemo(() => {
    const sum = (f: (r: ProjectCostSummaryDto) => string) => rows.reduce((s, r) => s + toNumber(f(r)), 0);
    return { executed: sum((r) => r.executedValue), measured: sum((r) => r.measuredValue), cost: sum((r) => r.cost.total), margin: sum((r) => r.margin), billed: sum((r) => r.billedValue), cashIn: sum((r) => r.cashIn), cashOut: sum((r) => r.cashOut) };
  }, [rows]);
  const scale = Math.max(1, ...rows.map((r) => toNumber(r.cost.total)));

  const columns: ListColumn<CostRow>[] = [
    {
      key: 'project',
      title: 'Project',
      dataIndex: 'projectName',
      locked: true,
      card: 'title',
      render: (v, r) => (
        <div>
          <Link href={`/projects/${r.projectId}?tab=cost`}>{v}</Link>
          <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
            {r.projectCode} · {PROJECT_TYPE_LABELS[r.projectType]}
          </div>
        </div>
      ),
    },
    { key: 'executedValue', title: 'Work done', dataIndex: 'executedValue', width: 140, kind: 'money', sorter: (a, b) => toNumber(a.executedValue) - toNumber(b.executedValue) },
    {
      title: 'Cost',
      key: 'cost',
      width: 240,
      sorter: (a, b) => toNumber(a.cost.total) - toNumber(b.cost.total),
      render: (_, r) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: tk.space[2] }}>
            <Money value={r.cost.total} />
            <UnpricedNote unpriced={r.unpriced} />
          </div>
          <CostBar cost={r.cost} scale={scale} height={8} />
        </div>
      ),
    },
    {
      key: 'margin',
      title: 'Margin',
      dataIndex: 'margin',
      width: 140,
      kind: 'money',
      strong: true,
      card: 'amount',
      tone: (r) => (toNumber(r.margin) < 0 ? 'danger' : undefined),
      sorter: (a, b) => toNumber(a.margin) - toNumber(b.margin),
    },
    { key: 'costPct', title: 'Cost %', dataIndex: 'costPct', width: 90, kind: 'pct', sorter: (a, b) => (a.costPct ?? 0) - (b.costPct ?? 0) },
    { key: 'cashIn', title: 'Money in', dataIndex: 'cashIn', width: 130, kind: 'money', sorter: (a, b) => toNumber(a.cashIn) - toNumber(b.cashIn) },
    { key: 'cashOut', title: 'Money out', dataIndex: 'cashOut', width: 130, kind: 'money', sorter: (a, b) => toNumber(a.cashOut) - toNumber(b.cashOut) },
    { key: 'billedValue', title: 'Billed', dataIndex: 'billedValue', width: 130, defaultFrom: 1600, kind: 'money', sorter: (a, b) => toNumber(a.billedValue) - toNumber(b.billedValue) },
    { key: 'measuredValue', title: 'Measured (MB)', dataIndex: 'measuredValue', width: 130, defaultFrom: 1600, kind: 'money' },
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
        <Statistic title="Work done" value={formatINR(totals.executed)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        <Statistic title="Measured (approved MB)" value={formatINR(totals.measured)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        <Statistic title="Cost" value={formatINR(totals.cost)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        <Statistic title="Margin" value={formatINR(totals.margin)} styles={{ content: { fontSize: tk.type.subhead.fontSize, color: totals.margin < 0 ? tk.color.tone.danger.fg : tk.color.tone.success.fg } }} />
        <Statistic title="Billed (RA bills)" value={formatINR(totals.billed)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        <Statistic title="Cash in" value={formatINR(totals.cashIn)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        <Statistic title="Cash out" value={formatINR(totals.cashOut)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
          <CostLegend />
        </div>
      </CardToolbar>
      <LocalDataTable<CostRow> list="cost-overview" columns={columns} rows={rows} loading={isLoading || isFetching} failed={!!error} emptyText="No project has cost in this period" />
      <Typography.Paragraph type="secondary" style={{ fontSize: tk.type.caption.fontSize, padding: `${tk.space[2]} ${tk.space[4]} 0` }}>
        {periodLabel(period)}. Cost is approved site expenses, material issued at the item master rate, approved machinery logs at the hire rate, attendance at the
        trade&apos;s daily rate and the work value of approved subcontractor bills (their gangs and the material they were charged for are not counted
        again). Work done is approved progress at BOQ rates. Billed is the work done on approved RA bills dated in the period; money in is what
        clients paid into the bank in it and cash out what was paid to vendors and subcontractors.
      </Typography.Paragraph>
      <LabourRatesModal open={ratesOpen} onClose={() => setRatesOpen(false)} />
    </>
  );
}

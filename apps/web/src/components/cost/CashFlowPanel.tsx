'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, Segmented, Select, Statistic, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { CashFlowGranularity, CashFlowPeriodDto } from '@erp/shared';
import { DEFAULT_CLIENT_PAYMENT_DAYS } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useCashFlow, useProjects } from '@/lib/queries';
import { formatINR, toNumber, formatMonth, formatDayMonth } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { themeColor, themeFontSize } from '@/lib/theme';

const RED = themeColor('colorErrorText');
const GREEN = themeColor('colorSuccessText');
const money = (v: string) => <span className="mono" translate="no">{formatINR(v)}</span>;
const signed = (v: string) => (
  <span className="mono" translate="no" style={{ color: toNumber(v) < 0 ? RED : undefined }}>
    {formatINR(v)}
  </span>
);

const periodLabel = (p: CashFlowPeriodDto, g: CashFlowGranularity) =>
  g === 'MONTH' ? formatMonth(p.start) : `${formatDayMonth(p.start)} to ${formatDayMonth(p.end)}`;

/** Money expected in and out by month or week, for one project or every project the user can see. */
export function CashFlowPanel({ projectId: fixedProject }: { projectId?: string }) {
  const [granularity, setGranularity] = useState<CashFlowGranularity>('MONTH');
  const [projectFilter, setProjectFilter] = useProjectScope();
  const projectId = fixedProject ?? projectFilter;
  const { data: projects } = useProjects();
  const { data, isLoading, isFetching, error, refetch } = useCashFlow({ projectId, granularity });
  const periods = data?.periods ?? [];
  const scale = Math.max(1, ...periods.map((p) => Math.max(toNumber(p.inTotal), toNumber(p.outTotal))));
  const sum = (k: keyof CashFlowPeriodDto) => periods.reduce((s, p) => s + toNumber(p[k]), 0);
  const overdue = data && (toNumber(data.overdueIn) > 0 || toNumber(data.overdueOut) > 0);

  const columns: TableProps<CashFlowPeriodDto>['columns'] = [
    {
      title: granularity === 'MONTH' ? 'Month' : 'Week',
      key: 'period',
      width: 150,
      fixed: 'left',
      render: (_, p, i) => (
        <div>
          {periodLabel(p, granularity)}
          {i === 0 && overdue ? (
            <div>
              <Tag color="orange" style={{ marginTop: 2 }}>
                includes overdue
              </Tag>
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Client bills', dataIndex: 'clientBills', width: 130, align: 'right', render: money },
    { title: 'Retention release', dataIndex: 'retentionRelease', width: 130, align: 'right', render: money },
    { title: 'Work still to bill', dataIndex: 'futureBilling', width: 140, align: 'right', render: money },
    { title: 'Money in', dataIndex: 'inTotal', width: 140, align: 'right', render: (v) => <strong className="mono" translate="no">{formatINR(v)}</strong> },
    { title: 'Vendor bills', dataIndex: 'vendorBills', width: 130, align: 'right', render: money },
    { title: 'Cost still to spend', dataIndex: 'remainingBudget', width: 140, align: 'right', render: money },
    { title: 'Money out', dataIndex: 'outTotal', width: 140, align: 'right', render: (v) => <strong className="mono" translate="no">{formatINR(v)}</strong> },
    { title: 'Net', dataIndex: 'net', width: 130, align: 'right', render: signed },
    { title: 'Cumulative', dataIndex: 'cumulative', width: 140, align: 'right', render: signed },
    {
      title: '',
      key: 'bars',
      width: 160,
      render: (_, p) => (
        <div style={{ display: 'grid', gap: 3 }} aria-hidden>
          <div style={{ height: 7, width: `${(toNumber(p.inTotal) / scale) * 100}%`, background: GREEN, borderRadius: 2 }} />
          <div style={{ height: 7, width: `${(toNumber(p.outTotal) / scale) * 100}%`, background: RED, borderRadius: 2 }} />
        </div>
      ),
    },
  ];

  return (
    <div className="cash-flow">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Segmented<CashFlowGranularity>
          value={granularity}
          onChange={setGranularity}
          options={[
            { value: 'MONTH', label: 'Next 6 months' },
            { value: 'WEEK', label: 'Next 12 weeks' },
          ]}
        />
        {!fixedProject && (
          <Select
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="All projects"
            value={projectFilter}
            onChange={setProjectFilter}
            style={{ width: 260 }}
            aria-label="Project"
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
          />
        )}
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 12 }}>
            <Statistic title="Money in" value={formatINR(sum('inTotal'))} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
            <Statistic title="Money out" value={formatINR(sum('outTotal'))} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
            <Statistic title="Net over the period" value={formatINR(sum('net'))} styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: sum('net') < 0 ? RED : GREEN } }} />
            {overdue ? (
              <Statistic
                title="Overdue today (in the first row)"
                value={`${formatINR(data.overdueIn)} in · ${formatINR(data.overdueOut)} out`}
                styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }}
              />
            ) : null}
          </div>
          {data.projectsWithoutBudget.length || data.projectsWithoutEndDate.length ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title="Part of the forecast rests on assumptions"
              description={
                <>
                  {data.projectsWithoutBudget.length ? (
                    <div>
                      No budget, so the cost still to spend is left out:{' '}
                      {data.projectsWithoutBudget.map((p, i) => (
                        <React.Fragment key={p.projectId}>
                          {i ? ', ' : ''}
                          <Link href={`/projects/${p.projectId}?tab=budget`}>{p.projectCode}</Link>
                        </React.Fragment>
                      ))}
                      .
                    </div>
                  ) : null}
                  {data.projectsWithoutEndDate.length ? (
                    <div>
                      Past or without a completion date, so the work left is spread over the next three months:{' '}
                      {data.projectsWithoutEndDate.map((p, i) => (
                        <React.Fragment key={p.projectId}>
                          {i ? ', ' : ''}
                          <Link href={`/projects/${p.projectId}?tab=contract`}>{p.projectCode}</Link>
                        </React.Fragment>
                      ))}
                      .
                    </div>
                  ) : null}
                </>
              }
            />
          ) : null}
        </>
      )}
      <Table<CashFlowPeriodDto> rowKey="start" size="small" loading={isLoading || isFetching} columns={columns} dataSource={periods} pagination={false} scroll={{ x: 1530 }} />
      <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8 }}>
        Client bills are approved RA bills not yet paid, expected the client&apos;s payment days after they were sent (set on the Contract tab;{' '}
        {DEFAULT_CLIENT_PAYMENT_DAYS} days when not set). Retention and security deposit come back at the end of the defect liability period. Work still to
        bill is the revised contract value less what has been billed, billed evenly up to the completion date and received after the payment days, with GST
        and less the client&apos;s deductions. Vendor bills are approved vendor and subcontractor bills not yet paid, by due date. Cost still to spend is the
        forecast to complete from each project&apos;s budget, spent evenly up to completion.
      </Typography.Paragraph>
    </div>
  );
}

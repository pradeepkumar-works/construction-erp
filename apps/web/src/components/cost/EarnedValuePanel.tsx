'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Alert, Col, Descriptions, Flex, Row, Segmented, Skeleton, Statistic, Table, Typography } from 'antd';
import type { EarnedValueActivityDto, EarnedValueDto, EarnedValuePointDto, EvBasis } from '@erp/shared';
import { EV_BAC_SOURCE_LABELS, EV_BASIS_LABELS, EV_BASES } from '@erp/shared';
import { useEarnedValue } from '@/lib/queries';
import { formatDate, formatINR, formatPct, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { Section, SectionStack } from '@/components/common/Section';
import { ChartCard } from '@/components/home/ChartCard';
import { monthLabel } from '@/components/home/chartData';
import { themeColor, themeFontSize } from '@/lib/theme';
import { AskButton } from '@/components/ai/AskButton';

const EarnedValueChart = dynamic(() => import('@/components/home/charts').then((m) => m.EarnedValueChart), {
  ssr: false,
  loading: () => <Skeleton.Node active style={{ width: '100%', height: 300 }} />,
});

const RED = themeColor('colorErrorText');
const GREEN = themeColor('colorSuccessText');
const big = (color?: string) => ({ content: { fontSize: themeFontSize('fontSizeXL'), color } });
const small = { fontSize: themeFontSize('fontSizeSM') };
const inr = (v: string | null) => (v === null ? <span className="text-muted">-</span> : <span className="mono" translate="no">{formatINR(v)}</span>);
const signed = (v: string | null) => (v === null ? <span className="text-muted">-</span> : <span className="mono" translate="no" style={{ color: toNumber(v) < 0 ? RED : toNumber(v) > 0 ? GREEN : undefined }}>{formatINR(v)}</span>);
/** An index read in words, with 0.95 to 1.05 counted as on plan. */
const indexColor = (v: number | null) => (v === null ? undefined : v < 0.95 ? RED : v > 1.05 ? GREEN : undefined);

function summaryOf(d: EarnedValueDto): string {
  const now = d.curve.filter((p) => p.ev !== null).at(-1);
  if (!now) return 'Nothing planned or done yet.';
  return `To ${monthLabel(now.month)}: planned ${formatINR(now.pv)}, earned ${formatINR(now.ev)}, spent ${formatINR(now.ac)}.`;
}

function CurveTable({ data }: { data: EarnedValuePointDto[] }) {
  return (
    <Table<EarnedValuePointDto>
      size="small"
      rowKey="month"
      pagination={false}
      scroll={{ x: 520, y: 300 }}
      dataSource={data}
      columns={[
        { title: 'Month', dataIndex: 'month', render: (v: string) => monthLabel(v) },
        { title: 'Planned value', dataIndex: 'pv', align: 'right', render: inr },
        { title: 'Earned value', dataIndex: 'ev', align: 'right', render: inr },
        { title: 'Actual cost', dataIndex: 'ac', align: 'right', render: inr },
      ]}
    />
  );
}

/**
 * Earned value tab of a project (v6 item 115): how far the work is behind or ahead of the baseline and over or under its
 * budget, in money and in time, the forecasts from it, the S-curve of planned value, earned value and actual cost, and
 * the activities furthest behind. Earned from approved progress or, switched, from measured work.
 */
export function EarnedValuePanel({ projectId }: { projectId: string }) {
  const [basis, setBasis] = useState<EvBasis>('PROGRESS');
  const { data, isLoading, error, refetch } = useEarnedValue(projectId, basis);

  return (
    <SectionStack gap={0}>
      <Flex gap={12} wrap align="center" style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={small}>
          Earned from
        </Typography.Text>
        <Segmented<EvBasis> value={basis} onChange={setBasis} options={EV_BASES.map((b) => ({ value: b, label: EV_BASIS_LABELS[b] }))} aria-label="Earned value from" />
      </Flex>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          {data.bacSource === 'BOQ_VALUE' || data.pvSource === 'PLAN' || toNumber(data.unscheduledValue) > 0 ? (
            <Alert
              className="ev-notes"
              type={data.bacSource === 'BOQ_VALUE' ? 'warning' : 'info'}
              showIcon
              style={{ marginBottom: 12 }}
              title={data.bacSource === 'BOQ_VALUE' ? 'No budget is set, so values are at contract rates and the cost index includes the margin' : 'How these figures are made'}
              description={[
                data.bacSource === 'BOQ_VALUE' ? 'Set a budget on the Budget and cash flow tab to measure cost against it.' : null,
                data.pvSource === 'PLAN' ? 'No baseline is frozen, so planned value follows today’s plan and moves with it. Freeze a baseline on the Schedule tab.' : null,
                toNumber(data.unscheduledValue) > 0 ? `${formatINR(data.unscheduledValue)} of the BOQ has no activity with dates and is spread evenly over the project’s dates.` : null,
              ]
                .filter(Boolean)
                .join(' ')}
            />
          ) : null}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="Schedule (SPI)" value={data.spi ?? '-'} precision={data.spi === null ? undefined : 2} styles={big(indexColor(data.spi))} />
              <div className="text-muted" style={small}>
                {data.spi === null ? 'Nothing planned yet' : toNumber(data.sv) < 0 ? `${formatINR(-toNumber(data.sv))} of work behind plan` : `${formatINR(data.sv)} of work ahead of plan`}
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Cost (CPI)" value={data.cpi ?? '-'} precision={data.cpi === null ? undefined : 2} styles={big(indexColor(data.cpi))} />
              <div className="text-muted" style={small}>
                {data.cpi === null ? 'Nothing spent or earned yet' : `₹${data.cpi.toFixed(2)} of work for each ₹1 spent`}
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Forecast finish" value={data.forecastFinish ? formatDate(data.forecastFinish) : '-'} styles={big(data.daysLate !== null && data.daysLate > 0 ? RED : undefined)} />
              <div className="text-muted" style={small}>
                {data.daysLate === null ? `Planned ${formatDate(data.plannedFinish)}` : data.daysLate > 0 ? `${data.daysLate} days after the planned ${formatDate(data.plannedFinish)}` : data.daysLate < 0 ? `${-data.daysLate} days before the planned ${formatDate(data.plannedFinish)}` : 'On the planned day'}
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Estimate at completion" value={data.eac ? formatINR(data.eac) : '-'} styles={big(data.vac && toNumber(data.vac) < 0 ? RED : undefined)} />
              <div className="text-muted" style={small}>
                {data.vac === null ? `Budget ${formatINR(data.bac)}` : toNumber(data.vac) < 0 ? `${formatINR(-toNumber(data.vac))} over the budget of ${formatINR(data.bac)}` : `${formatINR(data.vac)} under the budget of ${formatINR(data.bac)}`}
              </div>
            </Col>
          </Row>
          {(data.spi !== null && data.spi < 0.95) || (data.cpi !== null && data.cpi < 0.95) ? (
            <AskButton size="small" type="link" style={{ paddingInline: 0, alignSelf: 'flex-start' }} label="Explain" aria-label="Explain the earned value" question="Why is this project behind its planned value or over its cost, and which activities are the cause?" />
          ) : null}

          <div style={{ marginTop: 16 }}>
            <ChartCard
              title="Planned value, earned value and actual cost"
              summary={summaryOf(data)}
              chart={<EarnedValueChart data={data.curve} />}
              table={<CurveTable data={data.curve} />}
            />
          </div>

          <Section style={{ marginTop: 16 }} title="To date">
            <Descriptions
              size="small"
              bordered
              column={{ xs: 1, md: 2 }}
              items={[
                { key: 'bac', label: 'Budget at completion', children: <span>{inr(data.bac)}<span className="text-muted" style={{ ...small, display: 'block' }}>{`From ${EV_BAC_SOURCE_LABELS[data.bacSource]}`}</span></span> },
                { key: 'pv', label: 'Planned value', children: <span>{inr(data.pv)}<span className="text-muted" style={{ ...small, display: 'block' }}>{`${formatPct(data.plannedPct)} of the work planned by today`}</span></span> },
                { key: 'ev', label: 'Earned value', children: <span>{inr(data.ev)}<span className="text-muted" style={{ ...small, display: 'block' }}>{`${formatPct(data.earnedPct)} of the BOQ done (${EV_BASIS_LABELS[data.basis].toLowerCase()})`}</span></span> },
                { key: 'ac', label: 'Actual cost', children: inr(data.ac) },
                { key: 'sv', label: 'Schedule variance', children: signed(data.sv) },
                { key: 'cv', label: 'Cost variance', children: signed(data.cv) },
                {
                  key: 'es',
                  label: 'Earned schedule',
                  children: data.earnedOn ? <span>{`The work done was planned by ${formatDate(data.earnedOn)}`}{data.spiT !== null ? <span className="text-muted" style={{ ...small, display: 'block' }}>{`SPI(t) ${data.spiT.toFixed(2)}`}</span> : null}</span> : '-',
                },
                { key: 'eac2', label: 'Estimate if the delay also costs', children: inr(data.eacWithSchedule) },
                { key: 'etc', label: 'Estimate to complete', children: inr(data.etc) },
                { key: 'tcpi', label: 'CPI needed to finish on budget', children: data.tcpi === null ? '-' : <span style={{ color: data.tcpi > 1.1 ? RED : undefined }}>{data.tcpi.toFixed(2)}</span> },
              ]}
            />
          </Section>

          <Section style={{ marginTop: 16 }} title="By activity, furthest behind first">
            <Table<EarnedValueActivityDto>
              className="ev-activities"
              size="small"
              rowKey="id"
              pagination={false}
              scroll={{ x: 640 }}
              dataSource={data.activities}
              locale={{ emptyText: 'No activity is linked to a BOQ item with dates' }}
              columns={[
                { title: 'Activity', dataIndex: 'name', fixed: 'left', width: 200 },
                { title: 'Value', dataIndex: 'value', align: 'right', width: 150, render: inr },
                { title: 'Planned by today', dataIndex: 'plannedPct', align: 'right', width: 130, render: (v: number) => formatPct(v) },
                { title: 'Done', dataIndex: 'earnedPct', align: 'right', width: 90, render: (v: number) => formatPct(v) },
                { title: 'Schedule variance', dataIndex: 'sv', align: 'right', width: 160, render: signed },
              ]}
            />
          </Section>
        </>
      )}
    </SectionStack>
  );
}

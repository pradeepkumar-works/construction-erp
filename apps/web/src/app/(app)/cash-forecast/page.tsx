'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, Collapse, Empty, Flex, Segmented, Skeleton, Statistic, Table, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CASH_FLOW_KIND_LABELS, canSeeCashForecast, type CashFlowItemDto, type CashForecastDto, type CashWeekDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useCashForecast } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ChartCard } from '@/components/home/ChartCard';
import { NoAccess } from '@/components/common/NoAccess';

const CashForecastChart = dynamic(() => import('@/components/home/charts').then((m) => m.CashForecastChart), {
  ssr: false,
  loading: () => <Skeleton.Node active style={{ width: '100%', height: 300 }} />,
});

type Direction = 'ALL' | 'IN' | 'OUT';
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Cash forecast (AI item 122): the bank and cash ledgers today, 13 weeks of money in and out as a low, likely and high
 * balance, why a short week is short, what to chase and what can wait, every receipt and payment with why it is dated
 * when it is, and how far the forecast of four weeks ago was out. Accounts and management (`canSeeCashForecast`).
 */
export default function Page() {
  const { user } = useAuth();
  const allowed = !!user && canSeeCashForecast(user.roleKey);
  const { data, isLoading, error, refetch } = useCashForecast(allowed);

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Cash forecast" />
        <NoAccess title="The cash forecast is for accounts and management" />
      </div>
    );
  if (!user || (isLoading && !data)) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  return <Forecast data={data} />;
}

function Forecast({ data }: { data: CashForecastDto }) {
  const { token } = theme.useToken();
  const [direction, setDirection] = useState<Direction>('ALL');
  const squeezed = data.weeks.filter((w) => w.short || w.atRisk);
  const last = data.weeks[data.weeks.length - 1];
  const lowWeeks = data.weeks.filter((w) => w.atRisk).length;
  const big = { content: { fontSize: token.fontSizeHeading4 } };
  const items = data.items.filter((i) => direction === 'ALL' || i.direction === direction);
  const money = (v: number, dir?: 'IN' | 'OUT') => (
    <span className="mono" translate="no" style={{ color: dir === 'IN' ? token.colorSuccessText : v < 0 ? token.colorErrorText : undefined }}>
      {dir === 'OUT' ? '−' : dir === 'IN' ? '+' : ''}
      {formatINR(v)}
    </span>
  );
  const summary = `Likely ${formatINRCompact(last.closing.likely)} by ${day(last.end)} (low ${formatINRCompact(last.closing.low)}, high ${formatINRCompact(last.closing.high)}); the lowest likely balance is ${formatINRCompact(data.lowest.closing.likely)} in the week of ${day(data.lowest.week)}.`;

  const list = (rows: CashFlowItemDto[], empty: string) =>
    rows.length ? (
      <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
        {rows.map((i) => (
          <li key={i.key} style={{ marginBottom: token.marginXS }}>
            {i.href ? (
              <Link href={i.href} className="text-link" translate="no">
                {i.label}
              </Link>
            ) : (
              <span translate="no">{i.label}</span>
            )}
            , <span translate="no">{formatINR(i.amount)}</span>
            {i.msme ? ' (MSME)' : ''}: {i.why.charAt(0).toLowerCase() + i.why.slice(1)}
          </li>
        ))}
      </ul>
    ) : (
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {empty}
      </Typography.Paragraph>
    );

  return (
    <div className="page-container">
      <PageHeader
        title="Cash forecast"
        subtitle={`Bank and cash for the next 13 weeks from the books and every bill, order, salary and EMI on record, as of ${formatDate(data.asOf)}. Low is clients paying late and bills going out early; high is the reverse.`}
      />

      <Flex wrap gap={token.marginSM} style={{ marginBottom: token.margin }}>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Bank and cash today" value={0} formatter={() => <span translate="no">{formatINRCompact(data.opening.total)}</span>} styles={big} />
          <Typography.Text type="secondary" translate="no">
            Bank {formatINRCompact(data.opening.bank)}, cash {formatINRCompact(data.opening.cash)}
          </Typography.Text>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Lowest likely balance" value={0} formatter={() => <span translate="no">{formatINRCompact(data.lowest.closing.likely)}</span>} styles={{ content: { ...big.content, color: data.lowest.closing.likely < 0 ? token.colorErrorText : undefined } }} />
          <Typography.Text type="secondary">
            Week of {day(data.lowest.week)}; low case <span translate="no">{formatINRCompact(data.lowest.closing.low)}</span>
          </Typography.Text>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="First short week" value={0} formatter={() => (data.firstShort ? day(data.firstShort) : 'None')} styles={{ content: { ...big.content, color: data.weeks.some((w) => w.short) ? token.colorErrorText : undefined } }} />
          <Typography.Text type="secondary">
            {data.weeks.some((w) => w.short) ? 'The likely balance goes below zero' : lowWeeks ? `Short only in the low case, ${lowWeeks === 1 ? '1 week' : `${lowWeeks} weeks`}` : 'Above zero in every case for 13 weeks'}
          </Typography.Text>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic
            title="Forecast four weeks ago"
            value={0}
            formatter={() => (data.error ? <span translate="no">{`${formatINRCompact(Math.abs(data.error.error))} ${data.error.error >= 0 ? 'more' : 'less'}`}</span> : 'Not yet')}
            styles={big}
          />
          <Typography.Text type="secondary">
            {data.error ? (
              <>
                Made {day(data.error.madeOn)} for {day(data.error.weekEnd)}: <span translate="no">{formatINRCompact(data.error.forecast.likely)}</span>, the books had <span translate="no">{formatINRCompact(data.error.actual)}</span>
                {data.error.withinRange ? ', inside its range' : ', outside its range'}
              </>
            ) : (
              'Each week’s forecast is kept and checked against the books four weeks on'
            )}
          </Typography.Text>
        </Card>
      </Flex>

      <div style={{ marginBottom: token.margin }}>
        <ChartCard title="Balance at each week’s end" summary={summary} chart={<CashForecastChart weeks={data.weeks} />} table={<WeeksTable weeks={data.weeks} />} />
      </div>

      {squeezed.length ? (
        <Card size="small" title="Why it runs short" style={{ marginBottom: token.margin }}>
          <Flex vertical gap={token.marginSM}>
            {squeezed.map((w) => (
              <div key={w.start} data-week={w.start}>
                <Typography.Text strong>
                  Week of {day(w.start)}:{' '}
                  {w.short ? (
                    <span translate="no">{formatINRCompact(-w.closing.likely)} short</span>
                  ) : (
                    <>
                      short in the low case by <span translate="no">{formatINRCompact(-w.closing.low)}</span>
                    </>
                  )}
                </Typography.Text>
                <ul style={{ margin: `${token.marginXXS}px 0 0`, paddingInlineStart: token.paddingLG }}>
                  {w.reasons.map((r, i) => (
                    <li key={i} translate="no">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Flex>
        </Card>
      ) : null}

      <Flex wrap gap={token.marginSM} style={{ marginBottom: token.margin }}>
        <Card size="small" title="Chase" style={{ flex: '1 1 320px' }}>
          {list(data.chase, data.firstShort || squeezed.length ? 'No client bill falls after the short week.' : 'No client bill is past its usual days.')}
        </Card>
        <Card size="small" title="Can wait" style={{ flex: '1 1 320px' }}>
          {list(data.hold, squeezed.length ? 'Nothing due before the short week can wait: what is left is MSME bills, salaries, EMIs and dues.' : 'No week runs short, so nothing needs to wait.')}
        </Card>
      </Flex>

      <Card
        size="small"
        title="Every receipt and payment"
        extra={
          <Segmented<Direction>
            size="small"
            aria-label="Show"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'ALL', label: `All (${data.items.length})` },
              { value: 'IN', label: 'Money in' },
              { value: 'OUT', label: 'Money out' },
            ]}
          />
        }
        style={{ marginBottom: token.margin }}
      >
        {items.length ? (
          <Table<CashFlowItemDto>
            size="small"
            rowKey="key"
            dataSource={items}
            pagination={items.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
            scroll={{ x: 860 }}
            columns={[
              {
                title: 'Likely',
                key: 'likely',
                width: 120,
                render: (_, i) => (
                  <>
                    {day(i.likely)}
                    {i.early !== i.likely || i.late !== i.likely ? (
                      <div className="text-muted" style={{ fontSize: token.fontSizeSM }}>
                        {day(i.early)} to {day(i.late)}
                      </div>
                    ) : null}
                  </>
                ),
              },
              {
                title: 'What',
                key: 'label',
                render: (_, i) => (
                  <>
                    {i.href ? (
                      <Link href={i.href} translate="no">
                        {i.label}
                      </Link>
                    ) : (
                      <span translate="no">{i.label}</span>
                    )}
                    <div>
                      <AppTag>{CASH_FLOW_KIND_LABELS[i.kind]}</AppTag>
                      {i.msme ? <AppTag tone="pending">MSME</AppTag> : null}
                      {i.overdue ? <AppTag tone="danger">Overdue</AppTag> : null}
                      {i.uncertain ? <AppTag>Not in the low case</AppTag> : null}
                    </div>
                  </>
                ),
              },
              { title: 'Amount', key: 'amount', width: 140, align: 'right', render: (_, i) => money(i.amount, i.direction) },
              { title: 'Why this date', key: 'why', render: (_, i) => <Typography.Text type="secondary">{i.why}</Typography.Text> },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing expected in the 13 weeks." />
        )}
      </Card>

      <Collapse
        size="small"
        items={[
          {
            key: 'how',
            label: 'How the forecast is worked out',
            children: (
              <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
                {data.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ),
          },
        ]}
      />
    </div>
  );
}

function WeeksTable({ weeks }: { weeks: CashWeekDto[] }) {
  const { token } = theme.useToken();
  const amount = (v: number) => (
    <span className="mono" translate="no" style={{ color: v < 0 ? token.colorErrorText : undefined }}>
      {formatINRCompact(v)}
    </span>
  );
  return (
    <Table<CashWeekDto>
      size="small"
      rowKey="start"
      pagination={false}
      dataSource={weeks}
      scroll={{ x: 640, y: 280 }}
      columns={[
        { title: 'Week of', dataIndex: 'start', width: 90, render: (v: string) => day(v) },
        { title: 'In', key: 'in', align: 'right', render: (_, w) => amount(w.in.likely) },
        { title: 'Out', key: 'out', align: 'right', render: (_, w) => amount(w.out.likely) },
        { title: 'Balance', key: 'likely', align: 'right', render: (_, w) => amount(w.closing.likely) },
        { title: 'Low', key: 'low', align: 'right', render: (_, w) => amount(w.closing.low) },
        { title: 'High', key: 'high', align: 'right', render: (_, w) => amount(w.closing.high) },
      ]}
    />
  );
}

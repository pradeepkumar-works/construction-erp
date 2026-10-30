'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, Col, Result, Row, Skeleton, Typography, theme } from 'antd';
import { SUBMISSION_TYPE_LABELS, canSeeManagement, type PortfolioDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useManagementPortfolio } from '@/lib/queries';
import { formatDate, formatINRCompact, formatPct, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { LinkButton } from '@/components/common/LinkButton';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ResultMark } from '@/components/common/ResultMark';
import { AppTag } from '@/components/common/AppTag';
import { FileExcelOutlined } from '@/components/common/icons';
import { ChartCard } from '@/components/home/ChartCard';
import { FigureStrip, type StripFigure } from '@/components/management/FigureStrip';
import { MoneyPipeline } from '@/components/management/MoneyPipeline';
import { AttentionList } from '@/components/management/AttentionList';
import { ProjectsHealthTable } from '@/components/management/ProjectsHealthTable';
import { TrendTable, trendSummary } from '@/components/management/TrendTable';
import { ReportsList } from '@/components/management/ReportsList';
import { VerticalsTable } from '@/components/management/VerticalsTable';
import { useVerticalScope } from '@/lib/project-scope';

const TrendChart = dynamic(() => import('@/components/management/TrendChart').then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton.Node active style={{ width: '100%', height: 280 }} />,
});

const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * The management dashboard (ARCHITECTURE "Management dashboard and reports"): every contract project the reader sees, with
 * its progress against plan, its money from contract to paid, cost against budget, what clients owe, approvals waiting and
 * what needs action, and the reports for print and Excel. For those who see project cost (`canSeeManagement`).
 */
export default function Page() {
  const { user } = useAuth();
  const allowed = !!user && canSeeManagement(user.roleKey);
  // The header's vertical (item 167) narrows the portfolio.
  const [vertical] = useVerticalScope();
  const { data, isLoading, error, refetch } = useManagementPortfolio(allowed, vertical);

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Management dashboard" />
        <Result
          icon={<ResultMark kind="no-access" />}
          title="The management dashboard is for management, accounts and project managers"
          subTitle="Your role does not see project cost. Choose a page from the menu."
        />
      </div>
    );
  if (!user || (isLoading && !data)) return <PageSkeleton shape="home" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  return <Dashboard data={data} />;
}

function Dashboard({ data }: { data: PortfolioDto }) {
  const { token } = theme.useToken();
  const t = data.totals;
  const margin = toNumber(t.margin);
  const acts = data.attention.filter((a) => a.level === 'act').length;
  const figures: StripFigure[] = [
    {
      key: 'contract',
      label: 'Contract value',
      value: formatINRCompact(t.contractValue),
      note: `${t.active} active of ${t.projects} projects`,
    },
    {
      key: 'order',
      label: 'Order book',
      value: formatINRCompact(t.orderBook),
      note: 'Contract still to bill',
    },
    {
      key: 'unbilled',
      label: 'Done, not billed',
      value: formatINRCompact(t.unbilled),
      note: 'Bill it to get paid',
      tone: toNumber(t.unbilled) > 0 && data.attention.some((a) => a.key === 'billing') ? 'danger' : undefined,
    },
    {
      key: 'owe',
      label: 'Clients owe',
      value: formatINRCompact(t.outstanding),
      note: toNumber(t.over90) > 0 ? `${formatINRCompact(t.over90)} over 90 days` : 'Nothing over 90 days',
      tone: toNumber(t.over90) > 0 ? 'danger' : undefined,
    },
    {
      key: 'margin',
      label: 'Margin to date',
      value: formatINRCompact(t.margin),
      note: t.marginPct === null ? 'Nothing done yet' : `${formatPct(t.marginPct)} of work done`,
      tone: margin < 0 ? 'danger' : undefined,
    },
    ...(data.cash
      ? [
          {
            key: 'cash',
            label: 'Bank and cash',
            value: formatINRCompact(data.cash.today),
            note: data.cash.firstShort ? `Short in the week of ${day(data.cash.firstShort)}` : `Lowest ${formatINRCompact(data.cash.lowest)} in 13 weeks`,
            tone: data.cash.firstShort ? ('danger' as const) : undefined,
          },
        ]
      : []),
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Management dashboard"
        subtitle={`Every contract project${data.vertical && data.verticals[0] ? ` in ${data.verticals[0].name}` : ''} as of ${formatDate(data.asOf)}: progress against plan, money from work done to paid, cost, approvals and what needs action.`}
        extra={
          <LinkButton href="/management/reports/mis" icon={<FileExcelOutlined />}>
            Monthly MIS
          </LinkButton>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: token.margin }}>
        <FigureStrip label="Portfolio figures" figures={figures} />

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={14}>
            <Card size="small" title="From contract to cash" style={{ height: '100%' }}>
              <MoneyPipeline money={t} />
            </Card>
          </Col>
          <Col xs={24} xl={10}>
            <Card
              size="small"
              title="Needs action"
              extra={acts ? <AppTag tone="danger">{acts === 1 ? '1 to act on' : `${acts} to act on`}</AppTag> : null}
              style={{ height: '100%' }}
            >
              <AttentionList items={data.attention} />
            </Card>
          </Col>
        </Row>

        {data.verticals.length > 1 && (
          <Card size="small" title="By vertical" styles={{ body: { padding: 0 } }}>
            <VerticalsTable verticals={data.verticals} />
          </Card>
        )}

        <Card size="small" title="Projects" styles={{ body: { padding: 0 } }}>
          <ProjectsHealthTable projects={data.projects} />
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
            <ChartCard
              title="Billed, received and cost by month"
              summary={trendSummary(data.months)}
              chart={<TrendChart months={data.months} />}
              table={<TrendTable months={data.months} />}
            />
          </Col>
          <Col xs={24} xl={8}>
            <Card
              size="small"
              title="Approvals waiting"
              extra={
                <Link href="/approvals" className="text-link">
                  Open approvals
                </Link>
              }
              style={{ height: '100%' }}
            >
              <ApprovalAgeing data={data} />
            </Card>
          </Col>
        </Row>

        <Card size="small" title="Reports">
          <ReportsList />
        </Card>
      </div>
    </div>
  );
}

function ApprovalAgeing({ data }: { data: PortfolioDto }) {
  const { token } = theme.useToken();
  const a = data.approvals;
  const buckets = ['0 to 2 days', '3 to 7 days', '8 to 15 days', 'Over 15 days'];
  const max = Math.max(1, ...a.buckets);
  const line = `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`;
  if (!a.waiting)
    return (
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Nothing is waiting for a decision.
      </Typography.Paragraph>
    );
  return (
    <>
      <p style={{ margin: `0 0 ${token.marginSM}px` }}>
        <span
          className="mono"
          style={{
            fontSize: token.fontSizeHeading3,
            fontWeight: 700,
            marginInlineEnd: token.marginXS,
          }}
        >
          {a.waiting}
        </span>
        <span style={{ color: token.colorTextSecondary }}>
          {a.waiting === 1 ? 'entry' : 'entries'} waiting
          {a.oldestDays !== null ? `, the oldest ${a.oldestDays === 1 ? '1 day' : `${a.oldestDays} days`}` : ''}
        </span>
      </p>
      <dl style={{ margin: `0 0 ${token.marginSM}px` }}>
        {a.buckets.map((n, i) => (
          <div
            key={buckets[i]}
            style={{
              display: 'grid',
              gridTemplateColumns: '96px minmax(0, 1fr) 32px',
              alignItems: 'center',
              gap: token.marginSM,
              minHeight: 24,
            }}
          >
            <dt
              style={{
                color: token.colorTextSecondary,
                fontSize: token.fontSizeSM,
              }}
            >
              {buckets[i]}
            </dt>
            <dd
              aria-hidden
              style={{
                margin: 0,
                height: 8,
                borderRadius: 4,
                background: token.colorFillSecondary,
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${(n / max) * 100}%`,
                  minWidth: n ? 4 : 0,
                  borderRadius: 4,
                  background: i >= 2 ? token.colorError : token.colorPrimary,
                }}
              />
            </dd>
            <dd className="mono" style={{ margin: 0, textAlign: 'right' }}>
              {n}
            </dd>
          </div>
        ))}
      </dl>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {a.byType.slice(0, 6).map((b) => (
          <li
            key={b.type}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: token.marginSM,
              padding: `${token.paddingXXS}px 0`,
              borderBlockStart: line,
            }}
          >
            <span>{SUBMISSION_TYPE_LABELS[b.type]}</span>
            <span className="mono" style={{ color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
              {b.count}
              {b.oldestDays ? `, oldest ${b.oldestDays === 1 ? '1 day' : `${b.oldestDays} days`}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

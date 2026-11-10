'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, Col, Row, Skeleton, Typography } from 'antd';
import { tk } from '@/ds';
import { SUBMISSION_TYPE_LABELS, canSeeManagement, figure, unbilledAttention, type FigureInput, type PortfolioDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useManagementPortfolio } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { LinkButton } from '@/components/common/LinkButton';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { AppTag } from '@/components/common/AppTag';
import { FileExcelOutlined } from '@/components/common/icons';
import { ChartCard } from '@/components/home/ChartCard';
import { Figures } from '@/components/figures';
import { MoneyPipeline } from '@/components/management/MoneyPipeline';
import { AttentionList } from '@/components/management/AttentionList';
import { ProjectsHealthTable } from '@/components/management/ProjectsHealthTable';
import { TrendTable, trendSummary } from '@/components/management/TrendTable';
import { ReportsList } from '@/components/management/ReportsList';
import { VerticalsTable } from '@/components/management/VerticalsTable';
import { NoAccess } from '@/components/common/NoAccess';
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
  // The header's vertical narrows the portfolio.
  const [vertical] = useVerticalScope();
  const { data, isLoading, error, refetch } = useManagementPortfolio(allowed, vertical);

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Management dashboard" />
        <NoAccess title="The management dashboard is for management, accounts and project managers" />
      </div>
    );
  if (!user || (isLoading && !data)) return <PageSkeleton shape="home" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  return <Dashboard data={data} />;
}

function Dashboard({ data }: { data: PortfolioDto }) {
  const t = data.totals;
  const acts = data.attention.filter((a) => a.level === 'act').length;
  const billing = unbilledAttention(data.attention);
  const cash = data.cash;
  const figures: FigureInput[] = [
    figure('contractValue', t.contractValue, { count: t.projects }),
    figure('orderBook', t.orderBook, { versus: { of: figure('contractValue', t.contractValue) } }),
    figure('workNotBilled', t.unbilled, billing && { attention: billing }),
    figure('clientsOwe', t.outstanding, { versus: { part: figure('clientsOweOver90', t.over90) } }),
    figure('marginToDate', t.margin, {
      versus: { of: figure('workDone', t.workDone) },
      caveat: t.openingMissing ? `${t.openingMissing === 1 ? '1 project has' : `${t.openingMissing} projects have`} no opening cost, so it reads high` : undefined,
    }),
    cash &&
      (cash.firstShort
        ? figure('bankAndCash', cash.today, { attention: { level: 'act', because: `Short in the week of ${day(cash.firstShort)}` } })
        : figure('bankAndCash', cash.today, { versus: { part: figure('cashLowest', cash.lowest) } })),
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Management dashboard"
        help={`Every contract project${data.vertical && data.verticals[0] ? ` in ${data.verticals[0].name}` : ''} as of ${formatDate(data.asOf)}: progress against plan, money from work done to paid, cost, approvals and what needs action.`}
        extra={
          <LinkButton href="/management/reports/mis" icon={<FileExcelOutlined />}>
            Monthly MIS
          </LinkButton>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: tk.space[4] }}>
        <Figures label="Portfolio figures" figures={figures} />

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
              extra={acts ? <AppTag meaning="failed">{acts === 1 ? '1 to act on' : `${acts} to act on`}</AppTag> : null}
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
  const a = data.approvals;
  const buckets = ['0 to 2 days', '3 to 7 days', '8 to 15 days', 'Over 15 days'];
  const max = Math.max(1, ...a.buckets);
  const line = tk.line('hairline');
  if (!a.waiting)
    return (
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Nothing is waiting for a decision.
      </Typography.Paragraph>
    );
  return (
    <>
      <p style={{ margin: `0 0 ${tk.space[3]}` }}>
        <span
          className="mono"
          style={{
            fontSize: tk.type.subhead.fontSize,
            fontWeight: tk.type.title.fontWeight,
            marginInlineEnd: tk.space[2],
          }}
        >
          {a.waiting}
        </span>
        <span style={{ color: tk.color.text.muted }}>
          {a.waiting === 1 ? 'entry' : 'entries'} waiting
          {a.oldestDays !== null ? `, the oldest ${a.oldestDays === 1 ? '1 day' : `${a.oldestDays} days`}` : ''}
        </span>
      </p>
      <dl style={{ margin: `0 0 ${tk.space[3]}` }}>
        {a.buckets.map((n, i) => (
          <div
            key={buckets[i]}
            style={{
              display: 'grid',
              gridTemplateColumns: '96px minmax(0, 1fr) 32px',
              alignItems: 'center',
              gap: tk.space[3],
              minHeight: 24,
            }}
          >
            <dt
              style={{
                color: tk.color.text.muted,
                fontSize: tk.type.caption.fontSize,
              }}
            >
              {buckets[i]}
            </dt>
            <dd
              aria-hidden
              style={{
                margin: 0,
                height: 8,
                borderRadius: tk.radius.sm,
                background: tk.color.tone.neutral.bg,
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${(n / max) * 100}%`,
                  minWidth: n ? 4 : 0,
                  borderRadius: tk.radius.sm,
                  background: i >= 2 ? tk.color.tone.danger.solid : tk.color.accent.solid,
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
              gap: tk.space[3],
              padding: `${tk.space[1]} 0`,
              borderBlockStart: line,
            }}
          >
            <span>{SUBMISSION_TYPE_LABELS[b.type]}</span>
            <span className="mono" style={{ color: tk.color.text.muted, whiteSpace: 'nowrap' }}>
              {b.count}
              {b.oldestDays ? `, oldest ${b.oldestDays === 1 ? '1 day' : `${b.oldestDays} days`}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

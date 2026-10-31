'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Col, Result, Row, Skeleton, Table, Typography, theme } from 'antd';
import {
  HEALTH_LABELS,
  PORTFOLIO_SCHEDULE_LABELS,
  SUBMISSION_TYPE_LABELS,
  canSeeManagement,
  submissionHref,
  type PortfolioProjectDetailDto,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useManagementProject } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact, formatPct, toNumber, NO_VALUE } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { LinkButton } from '@/components/common/LinkButton';
import { AppTabs } from '@/components/common/AppTabs';
import { AppTag } from '@/components/common/AppTag';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ResultMark } from '@/components/common/ResultMark';
import { ChartCard } from '@/components/home/ChartCard';
import { FigureStrip, type StripFigure } from '@/components/management/FigureStrip';
import { BudgetTrack, MoneyPipeline, ScheduleBullet } from '@/components/management/MoneyPipeline';
import { AttentionList } from '@/components/management/AttentionList';
import { HEALTH_TONES } from '@/components/management/report-format';
import { TrendTable, trendSummary } from '@/components/management/TrendTable';

const TrendChart = dynamic(() => import('@/components/management/TrendChart').then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton.Node active style={{ width: '100%', height: 280 }} />,
});

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * One project from the management dashboard: why it is where it is, its schedule against plan, its money from contract to
 * paid, cost by head against budget, the months, and what is open (client bills, approvals, risks and orders).
 */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const allowed = !!user && canSeeManagement(user.roleKey);
  const { data, isLoading, error, refetch } = useManagementProject(allowed ? id : undefined);

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Project on the dashboard" crumbs={[{ title: 'Management dashboard', href: '/management' }]} />
        <Result icon={<ResultMark kind="no-access" />} title="The management dashboard is for management, accounts and project managers" />
      </div>
    );
  if (!user || (isLoading && !data)) return <PageSkeleton shape="record" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  return <Detail data={data} />;
}

function Detail({ data }: { data: PortfolioProjectDetailDto }) {
  const { token } = theme.useToken();
  const p = data.project;
  const m = p.money;
  const s = p.schedule;
  const figures: StripFigure[] = [
    {
      key: 'contract',
      label: 'Contract value',
      value: m.contractValue === null ? NO_VALUE : formatINRCompact(m.contractValue),
      note: p.clientName ?? undefined,
    },
    {
      key: 'done',
      label: 'Done',
      value: formatPct(s.done),
      note: s.planned !== null ? `${formatPct(s.planned)} planned by today` : PORTFOLIO_SCHEDULE_LABELS[s.state],
    },
    {
      key: 'unbilled',
      label: 'Work done, not billed',
      value: formatINRCompact(m.unbilled),
      note:
        m.unbilledDays !== null
          ? `${days(m.unbilledDays)} since ${m.billedUpTo ? `the bill up to ${formatDate(m.billedUpTo)}` : 'the start'}`
          : 'Everything done is billed',
      tone: p.reasons.some((r) => r.key === 'billing' && r.level === 'act') ? 'danger' : undefined,
    },
    {
      key: 'owe',
      label: 'Client owes',
      value: formatINRCompact(m.outstanding),
      note: toNumber(m.over90) > 0 ? `${formatINRCompact(m.over90)} over 90 days` : `Retention ${formatINRCompact(m.retentionHeld)}`,
      tone: toNumber(m.over90) > 0 ? 'danger' : undefined,
    },
    {
      key: 'cost',
      label: 'Cost to date',
      value: formatINRCompact(m.cost),
      note: m.budget !== null ? `Budget ${formatINRCompact(m.budget)}` : 'No budget set',
    },
    {
      key: 'margin',
      label: 'Margin to date',
      value: formatPct(m.marginPct),
      note: m.forecastMargin !== null ? `${formatINRCompact(m.forecastMargin)} forecast at completion` : `${formatINRCompact(m.margin)} on work done`,
      tone: m.marginPct !== null && m.marginPct < 0 ? 'danger' : undefined,
    },
  ];
  const facts: [string, React.ReactNode][] = [
    ['Schedule', PORTFOLIO_SCHEDULE_LABELS[s.state]],
    ['Time gone', s.elapsed === null ? NO_VALUE : formatPct(s.elapsed)],
    ['Completion date', s.completionDate ? formatDate(s.completionDate) : NO_VALUE],
    ['Plan finishes', s.plannedFinish ? formatDate(s.plannedFinish) : NO_VALUE],
    ['Late activities', String(s.lateActivities)],
    ['Days late', s.daysLate === null ? 'None' : days(s.daysLate)],
  ];

  return (
    <div className="page-container">
      <PageHeader
        title={p.name}
        docTitle={`${p.code} · Management dashboard`}
        crumbs={[{ title: 'Management dashboard', href: '/management' }, { title: p.code }]}
        subtitle={
          <>
            <AppTag tone={HEALTH_TONES[p.health]} style={{ marginInlineEnd: token.marginXS }}>
              {HEALTH_LABELS[p.health]}
            </AppTag>
            <span translate="no">{p.code}</span>
            {p.projectManagerName ? (
              <>
                , project manager <span translate="no">{p.projectManagerName}</span>
              </>
            ) : null}
            , as of {formatDate(data.asOf)}
          </>
        }
        extra={
          <>
            <LinkButton href={`/management/reports/profit-loss?projectId=${p.projectId}`}>Profit and loss</LinkButton>
            <LinkButton href={`/projects/${p.projectId}`} type="primary">
              Open project
            </LinkButton>
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: token.margin }}>
        <FigureStrip label={`${p.code} figures`} figures={figures} />

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={14}>
            <Card size="small" title="From contract to cash" style={{ height: '100%' }}>
              <MoneyPipeline money={m} />
            </Card>
          </Col>
          <Col xs={24} xl={10}>
            <Card size="small" title="Needs action" style={{ height: '100%' }}>
              <AttentionList
                items={p.reasons
                  .map((r) => ({
                    projectId: p.projectId,
                    projectCode: p.code,
                    projectName: p.name,
                    level: r.level,
                    key: r.key,
                    text: r.text,
                  }))
                  .sort((a, b) => (a.level === b.level ? 0 : a.level === 'act' ? -1 : 1))}
                empty="On course: nothing on this project needs action."
                oneProject
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={10}>
            <Card size="small" title="Schedule" style={{ height: '100%' }}>
              <ScheduleBullet
                done={s.done}
                planned={s.planned}
                label={`${formatPct(s.done)} done${s.planned !== null ? `, ${formatPct(s.planned)} planned by today` : ''}`}
              />
              <Typography.Paragraph
                type="secondary"
                style={{
                  fontSize: token.fontSizeSM,
                  margin: `${token.marginXXS}px 0 ${token.marginSM}px`,
                }}
              >
                The bar is the work done; the upright line is where the plan says it should be by today.
              </Typography.Paragraph>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: `${token.marginXS}px ${token.margin}px`,
                  margin: 0,
                }}
              >
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <dt
                      style={{
                        color: token.colorTextSecondary,
                        fontSize: token.fontSizeSM,
                      }}
                    >
                      {k}
                    </dt>
                    <dd style={{ margin: 0 }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </Col>
          <Col xs={24} xl={14}>
            <Card size="small" title="Cost by head against budget" style={{ height: '100%' }}>
              <CostHeads data={data} />
            </Card>
          </Col>
        </Row>

        <ChartCard
          title="Billed, received and cost by month"
          summary={trendSummary(data.months)}
          chart={<TrendChart months={data.months} />}
          table={<TrendTable months={data.months} workDone />}
        />

        <Card size="small" styles={{ body: { paddingTop: 0 } }}>
          <OpenItems data={data} />
        </Card>
      </div>
    </div>
  );
}

function CostHeads({ data }: { data: PortfolioProjectDetailDto }) {
  const { token } = theme.useToken();
  const anyBudget = data.heads.some((h) => h.budget !== null);
  const scale = Math.max(
    1,
    ...data.heads.flatMap((h) => [toNumber(h.actual), h.budget === null ? 0 : toNumber(h.budget), h.forecast === null ? 0 : toNumber(h.forecast)]),
  );
  return (
    <>
      <Table
        size="small"
        rowKey="head"
        pagination={false}
        dataSource={data.heads}
        scroll={{ x: 520 }}
        columns={[
          { key: 'label', title: 'Head', dataIndex: 'label' },
          {
            key: 'track',
            title: 'Against budget',
            width: '34%',
            render: (_, h) => {
              const actual = toNumber(h.actual);
              const budget = h.budget === null ? null : toNumber(h.budget);
              const over = budget !== null && actual > budget;
              return (
                <BudgetTrack
                  scale={scale}
                  actual={actual}
                  budget={budget}
                  forecast={h.forecast === null ? null : toNumber(h.forecast)}
                  label={`${h.label}: ${formatINRCompact(actual)} spent${budget !== null ? ` of ${formatINRCompact(budget)}${over ? ', over budget' : ''}` : ''}`}
                />
              );
            },
          },
          {
            key: 'actual',
            title: 'Spent',
            align: 'right',
            className: 'mono',
            render: (_, h) => <span translate="no">{formatINRCompact(h.actual)}</span>,
          },
          {
            key: 'budget',
            title: 'Budget',
            align: 'right',
            className: 'mono',
            render: (_, h) => <span translate="no">{h.budget === null ? NO_VALUE : formatINRCompact(h.budget)}</span>,
          },
          {
            key: 'forecast',
            title: 'Forecast',
            align: 'right',
            className: 'mono',
            render: (_, h) => {
              const over = h.forecast !== null && h.budget !== null && toNumber(h.forecast) > toNumber(h.budget);
              return (
                <span translate="no" style={{ color: over ? token.colorErrorText : undefined }}>
                  {h.forecast === null ? NO_VALUE : formatINRCompact(h.forecast)}
                </span>
              );
            },
          },
        ]}
      />
      <Typography.Paragraph
        type="secondary"
        style={{
          fontSize: token.fontSizeSM,
          margin: `${token.marginXS}px 0 0`,
        }}
      >
        {anyBudget
          ? 'The grey track is the budget, the blue bar what is spent and red what is spent past it; the upright line is the forecast at completion.'
          : 'This project has no cost budget yet, so the bars only compare the heads. Set one on the project’s Budget and cash flow tab.'}
      </Typography.Paragraph>
    </>
  );
}

function OpenItems({ data }: { data: PortfolioProjectDetailDto }) {
  const money = (v: string) => <span translate="no">{formatINR(v)}</span>;
  const pid = data.project.projectId;
  return (
    <AppTabs
      defaultActiveKey={
        [
          ['bills', data.openBills],
          ['waiting', data.waiting],
          ['risks', data.risks],
          ['orders', data.orders],
        ].find(([, l]) => (l as unknown[]).length)?.[0] as string | undefined
      }
      items={[
        {
          key: 'bills',
          label: 'Client bills open',
          count: data.openBills.length,
          countLabel: 'open',
          children: (
            <Table
              size="small"
              rowKey="billId"
              pagination={false}
              dataSource={data.openBills}
              scroll={{ x: 640 }}
              locale={{ emptyText: 'No client bill is waiting for payment.' }}
              columns={[
                {
                  key: 'label',
                  title: 'Bill',
                  render: (_, b) => (
                    <Link href={`/bills/${b.billId}`} translate="no">
                      {b.label}
                    </Link>
                  ),
                },
                {
                  key: 'stage',
                  title: 'Stage',
                  dataIndex: 'stage',
                  render: (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' '),
                },
                {
                  key: 'sent',
                  title: 'Sent',
                  dataIndex: 'sentDate',
                  render: (v: string) => formatDate(v),
                },
                {
                  key: 'days',
                  title: 'Days',
                  align: 'right',
                  className: 'mono',
                  dataIndex: 'daysOutstanding',
                },
                {
                  key: 'owe',
                  title: 'Outstanding',
                  align: 'right',
                  className: 'mono',
                  render: (_, b) => money(b.outstanding),
                },
              ]}
            />
          ),
        },
        {
          key: 'waiting',
          label: 'Waiting for approval',
          count: data.waiting.length,
          countLabel: 'waiting',
          attention: data.waiting.some((w) => w.days > 7),
          children: (
            <Table
              size="small"
              rowKey={(w) => `${w.type}-${w.id}`}
              pagination={data.waiting.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
              dataSource={data.waiting}
              scroll={{ x: 720 }}
              locale={{ emptyText: 'Nothing is waiting for a decision.' }}
              columns={[
                {
                  key: 'title',
                  title: 'Entry',
                  render: (_, w) => <Link href={submissionHref(w.type, w.id)}>{w.title}</Link>,
                },
                {
                  key: 'type',
                  title: 'Type',
                  render: (_, w) => SUBMISSION_TYPE_LABELS[w.type],
                },
                {
                  key: 'by',
                  title: 'Sent by',
                  render: (_, w) => <span translate="no">{w.submittedByName}</span>,
                },
                {
                  key: 'days',
                  title: 'Waiting',
                  align: 'right',
                  className: 'mono',
                  render: (_, w) => days(w.days),
                },
                {
                  key: 'amount',
                  title: 'Amount',
                  align: 'right',
                  className: 'mono',
                  render: (_, w) => (w.amount === null ? NO_VALUE : money(w.amount)),
                },
              ]}
            />
          ),
        },
        {
          key: 'risks',
          label: 'Delays and risks',
          count: data.risks.length,
          countLabel: 'open',
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data.risks}
              scroll={{ x: 640 }}
              locale={{ emptyText: 'No delay or risk is open.' }}
              columns={[
                {
                  key: 'title',
                  title: 'Risk or delay',
                  render: (_, r) => <Link href={`/projects/${pid}?tab=risks`}>{`${r.riskNo} · ${r.title}`}</Link>,
                },
                {
                  key: 'kind',
                  title: 'Kind',
                  render: (_, r) => r.kind.charAt(0) + r.kind.slice(1).toLowerCase(),
                },
                {
                  key: 'score',
                  title: 'Score',
                  align: 'right',
                  className: 'mono',
                  dataIndex: 'score',
                },
                {
                  key: 'lost',
                  title: 'Days lost',
                  align: 'right',
                  className: 'mono',
                  render: (_, r) => (r.daysLost === null ? NO_VALUE : r.daysLost),
                },
                {
                  key: 'due',
                  title: 'Due',
                  render: (_, r) => (r.dueDate ? formatDate(r.dueDate) : NO_VALUE),
                },
              ]}
            />
          ),
        },
        {
          key: 'orders',
          label: 'Orders open',
          count: data.orders.length,
          countLabel: 'open',
          children: (
            <Table
              size="small"
              rowKey={(o) => `${o.kind}-${o.id}`}
              pagination={data.orders.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
              dataSource={data.orders}
              scroll={{ x: 720 }}
              locale={{ emptyText: 'No purchase or work order is open.' }}
              columns={[
                {
                  key: 'number',
                  title: 'Order',
                  render: (_, o) => (
                    <Link href={o.kind === 'PO' ? `/purchase-orders/${o.id}` : `/work-orders/${o.id}`} translate="no">
                      {o.number}
                    </Link>
                  ),
                },
                {
                  key: 'vendor',
                  title: 'Vendor',
                  render: (_, o) => <span translate="no">{o.vendorName}</span>,
                },
                {
                  key: 'date',
                  title: 'Date',
                  render: (_, o) => formatDate(o.date),
                },
                {
                  key: 'value',
                  title: 'Value',
                  align: 'right',
                  className: 'mono',
                  render: (_, o) => money(o.value),
                },
                {
                  key: 'billed',
                  title: 'Billed',
                  align: 'right',
                  className: 'mono',
                  render: (_, o) => money(o.billed),
                },
                {
                  key: 'open',
                  title: 'Still open',
                  align: 'right',
                  className: 'mono',
                  render: (_, o) => money(o.open),
                },
              ]}
            />
          ),
        },
      ]}
    />
  );
}

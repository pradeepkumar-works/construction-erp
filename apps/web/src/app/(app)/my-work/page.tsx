'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, Col, Empty, Flex, Grid, Progress, Row, Skeleton, Statistic, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import {
  AlertOutlined,
  AimOutlined,
  AuditOutlined,
  CreditCardOutlined,
  FileTextOutlined,
  FundProjectionScreenOutlined,
  ProjectOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
  WalletOutlined,
  BankOutlined,
} from '@/components/common/icons';
import type { CompanyDashboard, HomeTrendsDto, ProjectSummary } from '@erp/shared';
import { PROJECT_TYPE_LABELS, isCompanyWide } from '@erp/shared';
import { useCompanyDashboard, useHomeTrends, useMyWork } from '@/lib/queries';
import { formatINR, formatINRCompact, formatDate, formatMonthName, formatPct, progressStatus, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { GettingStartedCard, useGettingStarted } from '@/components/dashboard/GettingStartedCard';
import { themeColor, themeFontSize } from '@/lib/theme';
import { MyWorkPanel } from '@/components/home/MyWorkPanel';
import { MorningBriefCard } from '@/components/home/MorningBriefCard';
import { KpiTile, kpiColumns, trendOf } from '@/components/home/KpiTile';
import { homeLayout, type ChartKey, type KpiKey } from '@/components/home/layout';
import { CashFlowTable, ChartCard, CostByHeadTable, SCurveTable } from '@/components/home/ChartCard';
import { allZero, cashFlowSummary, costByHeadSummary, sCurveSummary } from '@/components/home/chartData';

const chartLoading = () => <Skeleton.Node active style={{ width: '100%', height: 280 }} />;
const SCurveChart = dynamic(() => import('@/components/home/charts').then((m) => m.SCurveChart), { ssr: false, loading: chartLoading });
const CashFlowChart = dynamic(() => import('@/components/home/charts').then((m) => m.CashFlowChart), { ssr: false, loading: chartLoading });
const CostByHeadChart = dynamic(() => import('@/components/home/charts').then((m) => m.CostByHeadChart), { ssr: false, loading: chartLoading });

export default function MyWorkPage() {
  const { user } = useAuth();
  const { data, isPending, error, refetch } = useCompanyDashboard();
  const companyWide = !!user && isCompanyWide(user.roleKey);

  const columns: TableProps<ProjectSummary>['columns'] = [
    {
      title: 'Project',
      dataIndex: 'name',
      key: 'name',
      width: 320,
      render: (_, p) => (
        <div>
          <Link href={`/projects/${p.id}`} className="link-strong">
            {p.name}
          </Link>
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {p.code} {p.location ? `· ${p.location}` : ''}
          </div>
        </div>
      ),
    },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 150, render: (t, p) => <ProjectTypeTag type={t} name={p.typeName} /> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (s) => <ProjectStatusTag status={s} /> },
    { title: 'Project manager', dataIndex: 'projectManagerName', key: 'pm', width: 150, render: (v) => v ?? <span className="text-muted">Unassigned</span> },
    {
      title: 'Contract value',
      dataIndex: 'contractValue',
      key: 'cv',
      width: 150,
      align: 'right',
      className: 'mono',
      render: (v) => (v ? formatINR(v) : '-'),
    },
    {
      title: 'Physical progress',
      dataIndex: 'physicalProgressPct',
      key: 'progress',
      width: 170,
      render: (v: number) => <Progress percent={v} size="small" status={progressStatus(v)} format={() => formatPct(v)} aria-label={`${formatPct(v)} done`} />,
    },
    // No pending-approvals column: that count is My work's and the sidebar's (UX item 85).
    { title: 'End date', dataIndex: 'endDate', key: 'end', width: 110, render: (v) => formatDate(v) },
  ];

  const layout = homeLayout(user?.roleKey ?? 'SITE_ENGINEER');
  const myWork = useMyWork();
  const trends = useHomeTrends();
  const t = trends.data;
  const gettingStarted = useGettingStarted();
  // The page draws once everything above the charts is known (item 83): the setup checklist, My work, the KPI tiles (some
  // need the trends) and the chart row. Drawing each as it arrived pushed what was already on screen down (CLS 0.22).
  // The four requests go out together, so this waits for the slowest, not their sum; a failed one does not hold it up.
  const ready = !isPending && !myWork.isPending && !trends.isPending && gettingStarted.settled;
  const screens = Grid.useBreakpoint();
  // Kpi has no hooks, so it is called as a function: the row needs to know how many tiles the role can see.
  const tiles = data ? layout.kpis.map((k) => [k, Kpi({ k, data, trends: t })] as const).filter(([, node]) => node) : [];
  const perRow = kpiColumns(tiles.length, screens);

  return (
    <div className="page-container">
      <PageHeader
        title="My work"
        subtitle={
          companyWide
            ? 'Company-wide overview of projects, site progress and approvals'
            : `Site progress and approvals on your ${data ? `${data.totalProjects} ` : ''}project${data?.totalProjects === 1 ? '' : 's'}`
        }
      />
      {!ready && !error && <PageSkeleton shape="home" header={false} />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {ready && <GettingStartedCard state={gettingStarted} />}
      {ready && <MorningBriefCard />}
      {ready && <MyWorkPanel data={myWork.data} loading={false} order={layout.myWork} />}
      {ready && data && (
        <>
          <Row gutter={[16, 16]}>
            {tiles.map(([k, node]) => (
              <Col key={k} flex={`0 0 ${100 / perRow}%`}>
                {node}
              </Col>
            ))}
          </Row>

          {t && (
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              {layout.charts.map((c) => (
                <HomeChart key={c} c={c} trends={t} />
              ))}
            </Row>
          )}

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24}>
              <Card size="small" title="Projects by type" styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}>
                {data.projectsByType.length === 0 ? (
                  <Typography.Text type="secondary">No projects yet</Typography.Text>
                ) : (
                  <Row gutter={[24, 8]}>
                    {data.projectsByType.map((pt) => (
                      <Col key={pt.type} xs={24} sm={12} lg={8}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span>{PROJECT_TYPE_LABELS[pt.type] ?? pt.type}</span>
                          <AppTag style={{ margin: 0 }}>
                            {pt.count} project{pt.count === 1 ? '' : 's'}
                          </AppTag>
                        </div>
                        <Progress percent={data.totalProjects ? (pt.count / data.totalProjects) * 100 : 0} size="small" showInfo={false} strokeColor={BRAND.colors.primary} aria-label={`${PROJECT_TYPE_LABELS[pt.type] ?? pt.type}: ${formatPct(data.totalProjects ? (pt.count / data.totalProjects) * 100 : 0)} of projects`} />
                      </Col>
                    ))}
                  </Row>
                )}
              </Card>
            </Col>
            <Col xs={24}>
              <Card title="Projects" size="small" extra={<Link href="/projects">View all</Link>}>
                <Table<ProjectSummary>
                  rowKey="id"
                  columns={columns}
                  dataSource={data.projects}
                  pagination={false}
                  size="middle"
                  scroll={{ x: 1050 }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

const small = { fontSize: themeFontSize('fontSizeSM') } as const;
// A month with nothing yet, said in words: the size of body text, not of a figure.
const words = { fontSize: themeFontSize('fontSizeLG'), fontWeight: 'normal', color: themeColor('colorTextSecondary') } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A tile for this month's figure of a series (work done, billed, cost, received): the figure with its trend, or, while
 * the month has nothing yet, that said in words with no trend (UX item 85), so a new month is not a red "100% down".
 */
function MonthTile({ href, icon, title, series, months, upIsGood = true, none, children }: { href: string; icon: React.ReactNode; title: string; series: string[]; months: string[]; upIsGood?: boolean; none: string; children?: React.ReactNode }) {
  const now = toNumber(series[series.length - 1]);
  const before = toNumber(series[series.length - 2]);
  if (now === 0) {
    return (
      <KpiTile href={href} icon={icon}>
        <Statistic title={title} value={none} valueRender={() => <span style={words}>{none}</span>} />
        {before > 0 && (
          <Typography.Text type="secondary" style={small}>
            {formatINRCompact(before)} in {formatMonthName(months[months.length - 2])}
          </Typography.Text>
        )}
      </KpiTile>
    );
  }
  return (
    <KpiTile href={href} icon={icon} trend={trendOf(series, months, upIsGood)}>
      <Statistic title={title} value={formatINRCompact(now)} />
      {children}
    </KpiTile>
  );
}

/** One tile of the role's KPI row; nothing when the role cannot see its figure. */
function Kpi({ k, data, trends }: { k: KpiKey; data: CompanyDashboard; trends: HomeTrendsDto | undefined }) {
  const months = trends?.months ?? [];
  const thisMonth = formatMonthName(months[months.length - 1] ?? dayjsMonth());
  const last = (xs?: string[]) => toNumber(xs?.[xs.length - 1]);
  switch (k) {
    case 'contract': {
      // Billed against the contract (UX item 85): the figure against its plan, not the contract value alone.
      const fp = data.financialProgress;
      return fp && toNumber(fp.contractValue) > 0 ? (
        <KpiTile href="/bills" icon={<FundProjectionScreenOutlined />}>
          <Statistic title="Billed to date" value={formatINRCompact(fp.billed)} />
          <Typography.Text type="secondary" style={small}>
            of {formatINRCompact(fp.contractValue)} contract{fp.pct != null ? `, ${formatPct(fp.pct)}` : ''}
          </Typography.Text>
        </KpiTile>
      ) : (
        <KpiTile icon={<FundProjectionScreenOutlined />}>
          <Statistic title="Total contract value" value={formatINRCompact(data.totalContractValue)} />
          <Typography.Text type="secondary" style={small}>
            {formatINR(data.totalContractValue)}
          </Typography.Text>
        </KpiTile>
      );
    }
    case 'projects':
      return (
        <KpiTile href="/projects" icon={<ProjectOutlined />}>
          <Statistic title="Active projects" value={data.activeProjects} suffix={<span className="text-muted" style={{ fontSize: themeFontSize('fontSize') }}>/ {data.totalProjects}</span>} />
        </KpiTile>
      );
    case 'progress': {
      // Progress against plan from the S-curve: the latest month with approved work, done against planned by then.
      const now = trends ? [...trends.sCurve].reverse().find((p) => p.actual !== null) : undefined;
      if (!now || now.actual === null) return null;
      // Ten points or more behind is the exception worth colour; less is "on track" within the plan's own accuracy.
      const behind = now.planned - now.actual >= 10;
      return (
        <KpiTile href="/progress" icon={<AimOutlined />}>
          <Statistic title="Progress against plan" value={`${formatPct(now.actual)} done`} />
          <Typography.Text type={behind ? 'danger' : 'secondary'} style={small}>
            {formatPct(now.planned)} planned by now{behind ? ', behind plan' : ''}
          </Typography.Text>
        </KpiTile>
      );
    }
    case 'workDone':
      return trends ? (
        <MonthTile href="/progress" icon={<RiseOutlined />} title={`Work done in ${thisMonth}`} series={trends.workDone} months={months} none={`No work approved in ${thisMonth} yet`} />
      ) : null;
    case 'billed':
      return trends?.billed ? (
        <MonthTile href="/bills" icon={<AuditOutlined />} title={`Billed in ${thisMonth}`} series={trends.billed} months={months} none={`No bills raised in ${thisMonth} yet`} />
      ) : null;
    case 'cost':
      return trends?.cost ? (
        <MonthTile href="/cost" icon={<ShoppingCartOutlined />} title={`Cost in ${thisMonth}`} series={trends.cost} months={months} upIsGood={false} none={`No cost booked in ${thisMonth} yet`}>
          {last(trends.workDone) > 0 && (
            <Typography.Text type="secondary" style={{ ...small, display: 'block' }}>
              {formatPct((last(trends.cost) / last(trends.workDone)) * 100)} of the work done in {thisMonth}
            </Typography.Text>
          )}
        </MonthTile>
      ) : null;
    case 'cashIn':
      return trends?.cashIn ? (
        <MonthTile href="/receivables" icon={<BankOutlined />} title={`Received in ${thisMonth}`} series={trends.cashIn} months={months} none={`No receipts in ${thisMonth} yet`} />
      ) : null;
    case 'receivables':
      return data.receivables ? (
        <KpiTile href="/receivables" icon={<WalletOutlined />}>
          <Statistic
            title="Receivables"
            value={formatINRCompact(data.receivables.outstanding)}
            styles={{ content: { color: toNumber(data.receivables.over90) > 0 ? themeColor('colorErrorText') : undefined } }}
          />
          <Typography.Text type="secondary" style={small}>
            {plural(data.receivables.openBills, 'open bill')}
            {toNumber(data.receivables.over90) > 0 ? ` · ${formatINRCompact(data.receivables.over90)} over 90 days` : ''}
          </Typography.Text>
        </KpiTile>
      ) : null;
    case 'payables':
      return data.payables ? (
        <KpiTile href="/payables" icon={<CreditCardOutlined />}>
          <Statistic
            title="Vendor payable"
            value={formatINRCompact(data.payables.outstanding)}
            styles={{ content: { color: toNumber(data.payables.overdue) > 0 ? themeColor('colorErrorText') : undefined } }}
          />
          <Typography.Text type="secondary" style={small}>
            {plural(data.payables.openBills, 'open bill')}
            {toNumber(data.payables.overdue) > 0 ? ` · ${formatINRCompact(data.payables.overdue)} overdue` : ''}
          </Typography.Text>
        </KpiTile>
      ) : null;
    case 'delayed':
      return (
        <KpiTile icon={<AlertOutlined />}>
          <Statistic title="Delayed activities" value={data.delayedActivities} styles={{ content: { color: data.delayedActivities > 0 ? themeColor('colorErrorText') : undefined } }} />
          {data.dueActivities != null && (
            <Typography.Text type="secondary" style={small}>
              {data.dueActivities ? `of ${plural(data.dueActivities, 'activity', 'activities')} due to finish by today` : 'None was due to finish yet'}
            </Typography.Text>
          )}
        </KpiTile>
      );
    case 'dprsToday':
      return (
        <KpiTile href="/dpr" icon={<FileTextOutlined />}>
          <Statistic title="DPRs today" value={data.dprsToday} />
          <Typography.Text type="secondary" style={small}>
            of {plural(data.activeProjects, 'active project')}
            {trends ? `; ${trends.dprs[trends.dprs.length - 1]} approved in ${thisMonth}` : ''}
          </Typography.Text>
        </KpiTile>
      );
  }
}

/** This month as YYYY-MM, for a tile drawn before the trends arrive. */
const dayjsMonth = () => new Date().toISOString().slice(0, 7);

/** One chart card of the role's layout; nothing when the role cannot see its data or there is none. */
function HomeChart({ c, trends }: { c: ChartKey; trends: HomeTrendsDto }) {
  // On a phone the card's note would squeeze its title, so it is left out there.
  const wide = Grid.useBreakpoint().sm !== false;
  const note = (text: string) => (wide ? <Typography.Text type="secondary" style={small}>{text}</Typography.Text> : undefined);
  // A chart with nothing in it says so, and what will appear there (UX item 85), instead of drawing zeros.
  const empty = (title: string, extra: string, description: string) => (
    <Col xs={24} xl={12}>
      <Card size="small" title={title} extra={note(extra)} style={{ height: '100%' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<>Nothing to chart yet. {description}</>} />
      </Card>
    </Col>
  );
  switch (c) {
    case 'sCurve':
      if (!trends.sCurve.length) return empty('Planned against actual progress', 'Value of work, cumulative', 'Planned and actual progress appear here once activities have dates and BOQ items.');
      return (
        <Col xs={24} xl={12}>
          <ChartCard
            title="Planned against actual progress"
            note={note('Value of work, cumulative')}
            summary={sCurveSummary(trends.sCurve)}
            chart={<SCurveChart data={trends.sCurve} />}
            table={<SCurveTable data={trends.sCurve} />}
          />
        </Col>
      );
    case 'cashFlow':
      if (!trends.cashIn && !trends.cashOut) return null;
      if (allZero(trends.cashIn, trends.cashOut)) return empty('Cash in and out', 'Last six months', 'Receipts from clients and payments to vendors appear here month by month.');
      return (
        <Col xs={24} xl={12}>
          <ChartCard
            title="Cash in and out"
            note={note('Last six months')}
            summary={cashFlowSummary(trends)}
            chart={<CashFlowChart months={trends.months} cashIn={trends.cashIn} cashOut={trends.cashOut} />}
            table={<CashFlowTable months={trends.months} cashIn={trends.cashIn} cashOut={trends.cashOut} />}
          />
        </Col>
      );
    case 'costByHead':
      if (!trends.costByHead) return null;
      if (!(toNumber(trends.costByHead.total) > 0)) return empty('Cost by head', 'Last six months', 'Cost booked by head appears here: material, labour, machinery, subcontract and site expenses.');
      return (
        <Col xs={24} xl={12}>
          <ChartCard
            title="Cost by head"
            note={note('Last six months')}
            summary={costByHeadSummary(trends.costByHead)}
            chart={<CostByHeadChart heads={trends.costByHead} />}
            table={<CostByHeadTable heads={trends.costByHead} />}
          />
        </Col>
      );
    case 'billingVsContract':
      if (!trends.billingVsContract) return null;
      if (trends.billingVsContract.length && trends.billingVsContract.every((b) => toNumber(b.billed) === 0))
        return empty('Billed against contract', 'Approved RA bills to date', "Each project's approved RA bills appear here against its contract value.");
      return (
        <Col xs={24} xl={12}>
          <Card size="small" title="Billed against contract" extra={note('Approved RA bills to date')} style={{ height: '100%' }}>
            {trends.billingVsContract.length ? (
              <Flex vertical gap={12} style={{ paddingTop: 8 }}>
                {trends.billingVsContract.map((b) => {
                  const pct = toNumber(b.contractValue) > 0 ? (toNumber(b.billed) / toNumber(b.contractValue)) * 100 : 0;
                  return (
                    <div key={b.projectId}>
                      <Flex justify="space-between" gap={8}>
                        <Link href={`/projects/${b.projectId}?tab=bills`} className="text-link" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.projectName}
                        </Link>
                        <Typography.Text type="secondary" className="mono" style={{ ...small, whiteSpace: 'nowrap' }}>
                          {formatINRCompact(b.billed)} of {formatINRCompact(b.contractValue)}
                        </Typography.Text>
                      </Flex>
                      <Progress percent={pct} size="small" format={() => formatPct(pct)} aria-label={`${b.projectName}: ${formatPct(pct)} billed`} />
                    </div>
                  );
                })}
              </Flex>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No contract values yet" />
            )}
          </Card>
        </Col>
      );
  }
}

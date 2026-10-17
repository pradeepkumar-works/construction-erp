'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Badge, Card, Col, Empty, Flex, Grid, Progress, Row, Skeleton, Statistic, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import {
  AlertOutlined,
  AuditOutlined,
  CheckSquareOutlined,
  CreditCardOutlined,
  FileTextOutlined,
  FundProjectionScreenOutlined,
  PieChartOutlined,
  ProjectOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
  WalletOutlined,
  BankOutlined,
} from '@ant-design/icons';
import type { CompanyDashboard, HomeTrendsDto, ProjectSummary } from '@erp/shared';
import { PROJECT_TYPE_LABELS, isCompanyWide, mayApprove } from '@erp/shared';
import { useCompanyDashboard, useHomeTrends, useMyWork } from '@/lib/queries';
import { formatINR, formatINRCompact, formatDate, progressStatus, toNumber } from '@/lib/format';
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
import { cashFlowSummary, costByHeadSummary, sCurveSummary } from '@/components/home/chartData';

const chartLoading = () => <Skeleton.Node active style={{ width: '100%', height: 280 }} />;
const SCurveChart = dynamic(() => import('@/components/home/charts').then((m) => m.SCurveChart), { ssr: false, loading: chartLoading });
const CashFlowChart = dynamic(() => import('@/components/home/charts').then((m) => m.CashFlowChart), { ssr: false, loading: chartLoading });
const CostByHeadChart = dynamic(() => import('@/components/home/charts').then((m) => m.CostByHeadChart), { ssr: false, loading: chartLoading });

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isPending, error, refetch } = useCompanyDashboard();
  const companyWide = !!user && isCompanyWide(user.roleKey);
  const approver = !!user && mayApprove(user);

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
    { title: 'Type', dataIndex: 'type', key: 'type', width: 150, render: (t) => <ProjectTypeTag type={t} /> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (s) => <ProjectStatusTag status={s} /> },
    { title: 'Project Manager', dataIndex: 'projectManagerName', key: 'pm', width: 150, render: (v) => v ?? <span className="text-muted">Unassigned</span> },
    {
      title: 'Contract Value',
      dataIndex: 'contractValue',
      key: 'cv',
      width: 150,
      align: 'right',
      className: 'mono',
      render: (v) => (v ? formatINR(v) : '-'),
    },
    {
      title: 'Physical Progress',
      dataIndex: 'physicalProgressPct',
      key: 'progress',
      width: 170,
      render: (v: number) => <Progress percent={Math.round(v * 10) / 10} size="small" status={progressStatus(v)} aria-label={`${Math.round(v * 10) / 10}% done`} />,
    },
    { title: 'End Date', dataIndex: 'endDate', key: 'end', width: 110, render: (v) => formatDate(v) },
    {
      title: 'Pending',
      dataIndex: 'pendingApprovals',
      key: 'pending',
      width: 80,
      align: 'center',
      fixed: 'right',
      render: (v: number) => (v > 0 ? <Badge count={v} color={BRAND.colors.pending} /> : <span className="text-muted">0</span>),
    },
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
  const tiles = data ? layout.kpis.map((k) => [k, Kpi({ k, data, trends: t, approver })] as const).filter(([, node]) => node) : [];
  const perRow = kpiColumns(tiles.length, screens);

  return (
    <div className="page-container">
      <PageHeader
        title={`Welcome, ${user?.fullName.split(' ')[0] ?? ''}`}
        docTitle="Home"
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
              <Card size="small" title="Projects by Type" styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}>
                {data.projectsByType.length === 0 ? (
                  <Typography.Text type="secondary">No projects yet</Typography.Text>
                ) : (
                  <Row gutter={[24, 8]}>
                    {data.projectsByType.map((pt) => (
                      <Col key={pt.type} xs={24} sm={12} lg={8}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span>{PROJECT_TYPE_LABELS[pt.type] ?? pt.type}</span>
                          <Tag style={{ margin: 0 }}>
                            {pt.count} project{pt.count === 1 ? '' : 's'}
                          </Tag>
                        </div>
                        <Progress percent={data.totalProjects ? Math.round((pt.count / data.totalProjects) * 100) : 0} size="small" showInfo={false} strokeColor={BRAND.colors.primary} aria-label={`${PROJECT_TYPE_LABELS[pt.type] ?? pt.type}: ${data.totalProjects ? Math.round((pt.count / data.totalProjects) * 100) : 0}% of projects`} />
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
                  scroll={{ x: 1130 }}
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

/** One tile of the role's KPI row; nothing when the role cannot see its figure. */
function Kpi({ k, data, trends, approver }: { k: KpiKey; data: CompanyDashboard; trends: HomeTrendsDto | undefined; approver: boolean }) {
  const months = trends?.months ?? [];
  const thisMonth = shortMonth(months[months.length - 1] ?? new Date().toISOString().slice(0, 7));
  const last = (xs?: string[]) => xs?.[xs.length - 1] ?? '0';
  switch (k) {
    case 'contract':
      return (
        <KpiTile icon={<FundProjectionScreenOutlined />}>
          <Statistic title="Total contract value" value={formatINRCompact(data.totalContractValue)} />
          <Typography.Text type="secondary" style={small}>
            {data.financialProgress?.pct != null ? `${data.financialProgress.pct}% billed to date` : formatINR(data.totalContractValue)}
          </Typography.Text>
        </KpiTile>
      );
    case 'projects':
      return (
        <KpiTile href="/projects" icon={<ProjectOutlined />}>
          <Statistic title="Active projects" value={data.activeProjects} suffix={<span className="text-muted" style={{ fontSize: themeFontSize('fontSize') }}>/ {data.totalProjects}</span>} />
        </KpiTile>
      );
    case 'workDone':
      return trends ? (
        <KpiTile href="/progress" icon={<RiseOutlined />} trend={trendOf(trends.workDone, months)}>
          <Statistic title={`Work done in ${thisMonth}`} value={formatINRCompact(last(trends.workDone))} />
        </KpiTile>
      ) : null;
    case 'billed':
      return trends?.billed ? (
        <KpiTile href="/bills" icon={<AuditOutlined />} trend={trendOf(trends.billed, months)}>
          <Statistic title={`Billed in ${thisMonth}`} value={formatINRCompact(last(trends.billed))} />
        </KpiTile>
      ) : null;
    case 'cost':
      return trends?.cost ? (
        <KpiTile href="/cost" icon={<ShoppingCartOutlined />} trend={trendOf(trends.cost, months, false)}>
          <Statistic title={`Cost in ${thisMonth}`} value={formatINRCompact(last(trends.cost))} />
        </KpiTile>
      ) : null;
    case 'cashIn':
      return trends?.cashIn ? (
        <KpiTile href="/receivables" icon={<BankOutlined />} trend={trendOf(trends.cashIn, months)}>
          <Statistic title={`Received in ${thisMonth}`} value={formatINRCompact(last(trends.cashIn))} />
        </KpiTile>
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
            {data.receivables.openBills} open bill{data.receivables.openBills === 1 ? '' : 's'}
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
            {data.payables.openBills} open bill{data.payables.openBills === 1 ? '' : 's'}
            {toNumber(data.payables.overdue) > 0 ? ` · ${formatINRCompact(data.payables.overdue)} overdue` : ''}
          </Typography.Text>
        </KpiTile>
      ) : null;
    case 'pending':
      return approver ? (
        <KpiTile href="/approvals" icon={<CheckSquareOutlined />}>
          <Statistic title="Pending approvals" value={data.pendingApprovals} />
        </KpiTile>
      ) : null;
    case 'delayed':
      return (
        <KpiTile icon={<AlertOutlined />}>
          <Statistic title="Delayed activities" value={data.delayedActivities} styles={{ content: { color: data.delayedActivities > 0 ? themeColor('colorErrorText') : undefined } }} />
        </KpiTile>
      );
    case 'dprsToday':
      return (
        <KpiTile href="/dpr" icon={<FileTextOutlined />} trend={trends ? { ...trendOf(trends.dprs, months), deltaPct: null } : undefined}>
          <Statistic title="DPRs today" value={data.dprsToday} />
          {trends && (
            <Typography.Text type="secondary" style={small}>
              {trends.dprs[trends.dprs.length - 1]} approved in {thisMonth}
            </Typography.Text>
          )}
        </KpiTile>
      );
  }
}

/** One chart card of the role's layout; nothing when the role cannot see its data or there is none. */
function HomeChart({ c, trends }: { c: ChartKey; trends: HomeTrendsDto }) {
  // On a phone the card's note would squeeze its title, so it is left out there.
  const wide = Grid.useBreakpoint().sm !== false;
  const note = (text: string) => (wide ? <Typography.Text type="secondary" style={small}>{text}</Typography.Text> : undefined);
  const empty = (title: string, extra: string, description: string) => (
    <Col xs={24} xl={12}>
      <Card size="small" title={title} extra={note(extra)} style={{ height: '100%' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
      </Card>
    </Col>
  );
  switch (c) {
    case 'sCurve':
      if (!trends.sCurve.length) return empty('Planned against actual progress', 'Value of work, cumulative', 'Plan activities with dates and BOQ items to see the curve');
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
      if (!(toNumber(trends.costByHead.total) > 0)) return empty('Cost by head', 'Last six months', 'No cost booked in the last six months');
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
      return (
        <Col xs={24} xl={12}>
          <Card size="small" title="Billed against contract" extra={note('Approved RA bills to date')} style={{ height: '100%' }}>
            {trends.billingVsContract.length ? (
              <Flex vertical gap={12} style={{ paddingTop: 8 }}>
                {trends.billingVsContract.map((b) => {
                  const pct = toNumber(b.contractValue) > 0 ? Math.round((toNumber(b.billed) / toNumber(b.contractValue)) * 1000) / 10 : 0;
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
                      <Progress percent={pct} size="small" aria-label={`${b.projectName}: ${pct}% billed`} />
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

/** "2026-10" → "Oct" */
function shortMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
}

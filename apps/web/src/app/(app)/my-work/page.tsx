'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, Col, Empty, Flex, Grid, Progress, Row, Skeleton, Typography } from 'antd';
import type { CompanyDashboard, HomeTrendsDto } from '@erp/shared';
import { figure, isCompanyWide, type FigureInput } from '@erp/shared';
import { useCompanyDashboard, useHomeTrends, useMyWork } from '@/lib/queries';
import { formatINRCompact, formatPct, toNumber, todayDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { Figures } from '@/components/figures';
import { useAuth } from '@/lib/auth';
import { GettingStartedCard, useGettingStarted } from '@/components/dashboard/GettingStartedCard';
import { themeFontSize } from '@/lib/theme';
import { MyWorkPanel } from '@/components/home/MyWorkPanel';
import { MorningBriefCard } from '@/components/home/MorningBriefCard';
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

  const layout = homeLayout(user?.roleKey ?? 'SITE_ENGINEER');
  const myWork = useMyWork();
  const trends = useHomeTrends();
  const t = trends.data;
  const gettingStarted = useGettingStarted();
  // The page draws once everything above the charts is known: the setup checklist, My work, the figures (some
  // need the trends) and the chart row. Drawing each as it arrived pushed what was already on screen down (CLS 0.22).
  // The four requests go out together, so this waits for the slowest, not their sum; a failed one does not hold it up.
  const ready = !isPending && !myWork.isPending && !trends.isPending && gettingStarted.settled;
  const figures = data ? layout.kpis.map((k) => kpiFigure(k, data, t)) : [];

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
          <Figures label="Key figures" figures={figures} />

          {t && (
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              {layout.charts.map((c) => (
                <HomeChart key={c} c={c} trends={t} />
              ))}
            </Row>
          )}
        </>
      )}
    </div>
  );
}

const small = { fontSize: themeFontSize('fontSizeSM') } as const;

/** A role's figure for one of its layout's keys; nothing when the role cannot see it or it has no data yet. */
function kpiFigure(k: KpiKey, data: CompanyDashboard, trends: HomeTrendsDto | undefined): FigureInput {
  const months = trends?.months ?? [];
  const when = { month: months[months.length - 1] ?? thisMonth() };
  const flow = (series: string[]) => ({ when, versus: { trend: series, months } });
  const last = (series: string[]) => series[series.length - 1] ?? 0;
  switch (k) {
    case 'contract': {
      // Billed against the contract: the figure against its whole, not the contract value alone.
      const fp = data.financialProgress;
      return fp && toNumber(fp.contractValue) > 0 ? figure('billed', fp.billed, { when: 'toDate', versus: { of: figure('contractValue', fp.contractValue) } }) : figure('contractValue', data.totalContractValue);
    }
    case 'projects':
      return figure('activeProjects', data.activeProjects, { versus: { of: figure('projects', data.totalProjects) } });
    case 'progress': {
      // Progress against plan from the S-curve: the latest month with approved work, done against planned by then.
      const now = trends ? [...trends.sCurve].reverse().find((p) => p.actual !== null) : undefined;
      return now && now.actual !== null && figure('physicalProgress', now.actual, { versus: { plan: now.planned } });
    }
    case 'workDone':
      return trends && figure('workDone', last(trends.workDone), flow(trends.workDone));
    case 'billed':
      return trends?.billed && figure('billed', last(trends.billed), flow(trends.billed));
    case 'cost':
      return trends?.cost && figure('cost', last(trends.cost), flow(trends.cost));
    case 'cashIn':
      return trends?.cashIn && figure('moneyReceived', last(trends.cashIn), flow(trends.cashIn));
    case 'receivables':
      return data.receivables && figure('clientsOwe', data.receivables.outstanding, { count: data.receivables.openBills, versus: { part: figure('clientsOweOver90', data.receivables.over90) } });
    case 'payables':
      return data.payables && figure('weOwe', data.payables.outstanding, { count: data.payables.openBills, versus: { part: figure('weOweOverdue', data.payables.overdue) } });
    case 'delayed':
      return figure('delayedActivities', data.delayedActivities, data.dueActivities == null ? undefined : { versus: { of: figure('activitiesDue', data.dueActivities) } });
    case 'dprsToday':
      return figure('dailyReports', data.dprsToday, { when: 'today', versus: { of: figure('activeProjects', data.activeProjects) } });
  }
}

/** This month as YYYY-MM, for a figure drawn before the trends arrive. */
const thisMonth = () => todayDate().slice(0, 7);

/** One chart card of the role's layout; nothing when the role cannot see its data or there is none. */
function HomeChart({ c, trends }: { c: ChartKey; trends: HomeTrendsDto }) {
  // On a phone the card's note would squeeze its title, so it is left out there.
  const wide = Grid.useBreakpoint().sm !== false;
  const note = (text: string) => (wide ? <Typography.Text type="secondary" style={small}>{text}</Typography.Text> : undefined);
  // A chart with nothing in it says so, and what will appear there, instead of drawing zeros.
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

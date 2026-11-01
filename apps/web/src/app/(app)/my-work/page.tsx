'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, Col, Empty, Flex, Grid, Progress, Row, Skeleton, Typography } from 'antd';
import type { CompanyDashboard, HomeTrendsDto } from '@erp/shared';
import { isCompanyWide } from '@erp/shared';
import { useCompanyDashboard, useHomeTrends, useMyWork } from '@/lib/queries';
import { formatINR, formatINRCompact, formatMonthName, formatPct, toNumber, plural } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FigureStrip, type StripFigure } from '@/components/common/FigureStrip';
import { useAuth } from '@/lib/auth';
import { GettingStartedCard, useGettingStarted } from '@/components/dashboard/GettingStartedCard';
import { themeFontSize } from '@/lib/theme';
import { MyWorkPanel } from '@/components/home/MyWorkPanel';
import { MorningBriefCard } from '@/components/home/MorningBriefCard';
import { isBadTrend, trendNote, trendOf } from '@/components/home/trend';
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
  const figures = data ? layout.kpis.map((k) => kpiFigure(k, data, t)).filter((f): f is StripFigure => !!f) : [];

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
          <FigureStrip label="Key figures" figures={figures} />

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

function monthFigure(key: KpiKey, href: string, label: string, series: string[], months: string[], upIsGood = true, extra?: string): StripFigure {
  const now = toNumber(series[series.length - 1]);
  const before = toNumber(series[series.length - 2]);
  if (now === 0) return { key, href, label, value: 'None yet', note: before > 0 ? `${formatINRCompact(before)} in ${formatMonthName(months[months.length - 2])}` : undefined };
  const trend = trendOf(series, months, upIsGood);
  const note = [trendNote(trend), extra].filter(Boolean).join('; ');
  return { key, href, label, value: formatINRCompact(now), note: note || undefined, noteTone: isBadTrend(trend) ? 'danger' : undefined };
}

function kpiFigure(k: KpiKey, data: CompanyDashboard, trends: HomeTrendsDto | undefined): StripFigure | null {
  const months = trends?.months ?? [];
  const thisMonth = formatMonthName(months[months.length - 1] ?? dayjsMonth());
  const last = (xs?: string[]) => toNumber(xs?.[xs.length - 1]);
  switch (k) {
    case 'contract': {
      // Billed against the contract: the figure against its plan, not the contract value alone.
      const fp = data.financialProgress;
      return fp && toNumber(fp.contractValue) > 0
        ? { key: k, href: '/bills', label: 'Billed to date', value: formatINRCompact(fp.billed), note: `of ${formatINRCompact(fp.contractValue)} contract${fp.pct != null ? `, ${formatPct(fp.pct)}` : ''}` }
        : { key: k, label: 'Total contract value', value: formatINRCompact(data.totalContractValue), note: formatINR(data.totalContractValue) };
    }
    case 'projects':
      return { key: k, href: '/projects', label: 'Active projects', value: data.activeProjects, note: `of ${plural(data.totalProjects, 'project')}` };
    case 'progress': {
      // Progress against plan from the S-curve: the latest month with approved work, done against planned by then.
      const now = trends ? [...trends.sCurve].reverse().find((p) => p.actual !== null) : undefined;
      if (!now || now.actual === null) return null;
      // Ten points or more behind is the exception worth colour; less is "on track" within the plan's own accuracy.
      const behind = now.planned - now.actual >= 10;
      return { key: k, href: '/progress', label: 'Progress against plan', value: `${formatPct(now.actual)} done`, note: `${formatPct(now.planned)} planned by now${behind ? ', behind plan' : ''}`, noteTone: behind ? 'danger' : undefined };
    }
    case 'workDone':
      return trends ? monthFigure(k, '/progress', `Work done in ${thisMonth}`, trends.workDone, months) : null;
    case 'billed':
      return trends?.billed ? monthFigure(k, '/bills', `Billed in ${thisMonth}`, trends.billed, months) : null;
    case 'cost':
      return trends?.cost
        ? monthFigure(k, '/cost', `Cost in ${thisMonth}`, trends.cost, months, false, last(trends.workDone) > 0 ? `${formatPct((last(trends.cost) / last(trends.workDone)) * 100)} of the work done` : undefined)
        : null;
    case 'cashIn':
      return trends?.cashIn ? monthFigure(k, '/receivables', `Received in ${thisMonth}`, trends.cashIn, months) : null;
    case 'receivables':
      return data.receivables
        ? {
            key: k,
            href: '/receivables',
            label: 'Receivables',
            value: formatINRCompact(data.receivables.outstanding),
            tone: toNumber(data.receivables.over90) > 0 ? 'danger' : undefined,
            note: `${plural(data.receivables.openBills, 'open bill')}${toNumber(data.receivables.over90) > 0 ? ` · ${formatINRCompact(data.receivables.over90)} over 90 days` : ''}`,
          }
        : null;
    case 'payables':
      return data.payables
        ? {
            key: k,
            href: '/payables',
            label: 'Vendor payable',
            value: formatINRCompact(data.payables.outstanding),
            tone: toNumber(data.payables.overdue) > 0 ? 'danger' : undefined,
            note: `${plural(data.payables.openBills, 'open bill')}${toNumber(data.payables.overdue) > 0 ? ` · ${formatINRCompact(data.payables.overdue)} overdue` : ''}`,
          }
        : null;
    case 'delayed':
      return {
        key: k,
        label: 'Delayed activities',
        value: data.delayedActivities,
        tone: data.delayedActivities > 0 ? 'danger' : undefined,
        note: data.dueActivities == null ? undefined : data.dueActivities ? `of ${plural(data.dueActivities, 'activity', 'activities')} due to finish by today` : 'None was due to finish yet',
      };
    case 'dprsToday':
      return { key: k, href: '/dpr', label: 'DPRs today', value: data.dprsToday, note: `of ${plural(data.activeProjects, 'active project')}${trends ? `; ${trends.dprs[trends.dprs.length - 1]} approved in ${thisMonth}` : ''}` };
  }
}

/** This month as YYYY-MM, for a figure drawn before the trends arrive. */
const dayjsMonth = () => new Date().toISOString().slice(0, 7);

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

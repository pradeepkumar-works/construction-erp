'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Col, Progress, Row, Statistic, Table, Tag, Typography, Badge } from 'antd';
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
  ShoppingCartOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ProjectSummary } from '@erp/shared';
import { PROJECT_TYPE_LABELS, isCompanyWide, mayApprove } from '@erp/shared';
import { useCompanyDashboard } from '@/lib/queries';
import { formatINR, formatINRCompact, formatDate, progressStatus, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { Loading, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { GettingStartedCard } from '@/components/dashboard/GettingStartedCard';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useCompanyDashboard();
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
          <div className="text-muted" style={{ fontSize: 12 }}>
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
      render: (v: number) => <Progress percent={Math.round(v * 10) / 10} size="small" status={progressStatus(v)} />,
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

  return (
    <div className="page-container">
      <PageHeader
        title={`Welcome, ${user?.fullName.split(' ')[0] ?? ''}`}
        subtitle={
          companyWide
            ? 'Company-wide overview of projects, site progress and approvals'
            : `Site progress and approvals on your ${data ? `${data.totalProjects} ` : ''}project${data?.totalProjects === 1 ? '' : 's'}`
        }
      />
      <GettingStartedCard />
      {isLoading && <Loading />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Row gutter={[16, 16]}>
            <KpiTile>
              <Statistic title="Active Projects" value={data.activeProjects} suffix={<span className="text-muted" style={{ fontSize: 14 }}>/ {data.totalProjects}</span>} prefix={<ProjectOutlined />} />
            </KpiTile>
            <KpiTile>
              <Statistic title="Total Contract Value" value={formatINRCompact(data.totalContractValue)} prefix={<FundProjectionScreenOutlined />} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatINR(data.totalContractValue)}
              </Typography.Text>
            </KpiTile>
            {approver && (
              <KpiTile href="/approvals">
                <Statistic title="Pending Approvals" value={data.pendingApprovals} prefix={<CheckSquareOutlined />} styles={{ content: { color: data.pendingApprovals > 0 ? BRAND.colors.pending : undefined } }} />
              </KpiTile>
            )}
            <KpiTile>
              <Statistic title="Delayed Activities" value={data.delayedActivities} prefix={<AlertOutlined />} styles={{ content: { color: data.delayedActivities > 0 ? '#cf1322' : undefined } }} />
            </KpiTile>
            <KpiTile href="/dpr">
              <Statistic title="DPRs Today" value={data.dprsToday} prefix={<FileTextOutlined />} />
            </KpiTile>
          </Row>

          {(data.receivables || data.payables || data.monthCost || data.monthBilling || data.financialProgress) && (
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              {data.receivables && (
                <KpiTile href="/receivables">
                  <Statistic
                    title="Receivables"
                    value={formatINRCompact(data.receivables.outstanding)}
                    prefix={<WalletOutlined />}
                    styles={{ content: { color: toNumber(data.receivables.over90) > 0 ? '#cf1322' : undefined } }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {data.receivables.openBills} open bill{data.receivables.openBills === 1 ? '' : 's'}
                    {toNumber(data.receivables.over90) > 0 ? ` · ${formatINRCompact(data.receivables.over90)} over 90 days` : ''}
                  </Typography.Text>
                </KpiTile>
              )}
              {data.payables && (
                <KpiTile href="/payables">
                  <Statistic
                    title="Vendor Payable"
                    value={formatINRCompact(data.payables.outstanding)}
                    prefix={<CreditCardOutlined />}
                    styles={{ content: { color: toNumber(data.payables.overdue) > 0 ? '#cf1322' : undefined } }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {data.payables.openBills} open bill{data.payables.openBills === 1 ? '' : 's'}
                    {toNumber(data.payables.overdue) > 0 ? ` · ${formatINRCompact(data.payables.overdue)} overdue` : ''}
                  </Typography.Text>
                </KpiTile>
              )}
              {data.monthCost && (
                <KpiTile href="/cost">
                  <Statistic title={`Expense in ${monthName(data.monthCost.month)}`} value={formatINRCompact(data.monthCost.total)} prefix={<ShoppingCartOutlined />} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    incl. {formatINRCompact(data.monthCost.expenses)} site expenses
                  </Typography.Text>
                </KpiTile>
              )}
              {data.monthBilling && (
                <KpiTile href="/bills">
                  <Statistic title={`Billed in ${monthName(data.monthBilling.month)}`} value={formatINRCompact(data.monthBilling.gross)} prefix={<AuditOutlined />} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {data.monthBilling.bills} RA bill{data.monthBilling.bills === 1 ? '' : 's'}, before GST
                  </Typography.Text>
                </KpiTile>
              )}
              {data.financialProgress && (
                <KpiTile>
                  <Statistic
                    title="Financial Progress"
                    value={data.financialProgress.pct ?? '-'}
                    suffix={data.financialProgress.pct === null ? undefined : '%'}
                    prefix={<PieChartOutlined />}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {formatINRCompact(data.financialProgress.billed)} billed of {formatINRCompact(data.financialProgress.contractValue)}
                  </Typography.Text>
                </KpiTile>
              )}
            </Row>
          )}

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24}>
              <Card size="small" title="Projects by Type" styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}>
                {data.projectsByType.length === 0 ? (
                  <Typography.Text type="secondary">No projects yet</Typography.Text>
                ) : (
                  <Row gutter={[24, 8]}>
                    {data.projectsByType.map((t) => (
                      <Col key={t.type} xs={24} sm={12} lg={8}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span>{PROJECT_TYPE_LABELS[t.type] ?? t.type}</span>
                          <Tag style={{ margin: 0 }}>
                            {t.count} project{t.count === 1 ? '' : 's'}
                          </Tag>
                        </div>
                        <Progress percent={data.totalProjects ? Math.round((t.count / data.totalProjects) * 100) : 0} size="small" showInfo={false} strokeColor={BRAND.colors.primary} />
                      </Col>
                    ))}
                  </Row>
                )}
              </Card>
            </Col>
            <Col xs={24}>
              <Card title="Projects" size="small" className="table-card" extra={<Link href="/projects">View all</Link>}>
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

/** "2026-10" → "Oct 2026" */
function monthName(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** One KPI card; every card in the row stretches to the tallest so the row reads as one band. */
function KpiTile({ href, children }: { href?: string; children: React.ReactNode }) {
  const card = (
    <Card className="kpi-card" hoverable={!!href} style={{ height: '100%' }}>
      {children}
    </Card>
  );
  return (
    <Col flex="1 1 160px">
      {href ? (
        <Link href={href} style={{ display: 'block', height: '100%' }}>
          {card}
        </Link>
      ) : (
        card
      )}
    </Col>
  );
}

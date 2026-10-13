'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Col, Progress, Row, Statistic, Table, Tag, Typography, Badge } from 'antd';
import type { TableProps } from 'antd';
import {
  AlertOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  FundProjectionScreenOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import type { ProjectSummary } from '@erp/shared';
import { PROJECT_TYPE_LABELS } from '@erp/shared';
import { useCompanyDashboard } from '@/lib/queries';
import { formatINR, formatINRCompact, formatDate, progressStatus } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { Loading, QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { useAuth } from '@/lib/auth';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useCompanyDashboard();

  const columns: TableProps<ProjectSummary>['columns'] = [
    {
      title: 'Project',
      dataIndex: 'name',
      key: 'name',
      width: 320,
      render: (_, p) => (
        <div>
          <Link href={`/projects/${p.id}`} style={{ color: '#1659a8', fontWeight: 600 }}>
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
      render: (v: number) => (v > 0 ? <Badge count={v} color="gold" /> : <span className="text-muted">0</span>),
    },
  ];

  return (
    <div className="page-container">
      <PageHeader title={`Welcome, ${user?.fullName.split(' ')[0] ?? ''}`} subtitle="Company-wide overview of projects, site progress and approvals" />
      {isLoading && <Loading />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={8} xl={4}>
              <Card className="kpi-card">
                <Statistic title="Active Projects" value={data.activeProjects} suffix={<span className="text-muted" style={{ fontSize: 14 }}>/ {data.totalProjects}</span>} prefix={<ProjectOutlined />} />
              </Card>
            </Col>
            <Col xs={12} md={8} xl={5}>
              <Card className="kpi-card">
                <Statistic title="Total Contract Value" value={formatINRCompact(data.totalContractValue)} prefix={<FundProjectionScreenOutlined />} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatINR(data.totalContractValue)}
                </Typography.Text>
              </Card>
            </Col>
            <Col xs={12} md={8} xl={5}>
              <Link href="/approvals">
                <Card className="kpi-card" hoverable>
                  <Statistic title="Pending Approvals" value={data.pendingApprovals} prefix={<CheckSquareOutlined />} styles={{ content: { color: data.pendingApprovals > 0 ? '#d48806' : undefined } }} />
                </Card>
              </Link>
            </Col>
            <Col xs={12} md={8} xl={5}>
              <Card className="kpi-card">
                <Statistic title="Delayed Activities" value={data.delayedActivities} prefix={<AlertOutlined />} styles={{ content: { color: data.delayedActivities > 0 ? '#cf1322' : undefined } }} />
              </Card>
            </Col>
            <Col xs={12} md={8} xl={5}>
              <Link href="/dpr">
                <Card className="kpi-card" hoverable>
                  <Statistic title="DPRs Today" value={data.dprsToday} prefix={<FileTextOutlined />} />
                </Card>
              </Link>
            </Col>
          </Row>

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
                        <Progress percent={data.totalProjects ? Math.round((t.count / data.totalProjects) * 100) : 0} size="small" showInfo={false} strokeColor="#1659a8" />
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

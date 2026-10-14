'use client';

import React from 'react';
import { Card, Col, Descriptions, Progress, Row, Statistic, Table, Typography } from 'antd';
import type { ProjectDetail } from '@erp/shared';
import { useProjectDashboard } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact, formatQty, toNumber } from '@/lib/format';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { QueryError } from '@/components/common/QueryState';
import { MembersCard } from './MembersCard';
import { BRAND } from '@/lib/brand';

export function ProjectOverview({ project }: { project: ProjectDetail }) {
  const { data: dash, isLoading, error, refetch } = useProjectDashboard(project.id);
  const boqTotal = toNumber(dash?.boqTotalAmount);
  const boqExec = toNumber(dash?.boqExecutedAmount);
  const finPct = boqTotal > 0 ? Math.round((boqExec / boqTotal) * 1000) / 10 : 0;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={16}>
        {error && <QueryError error={error} onRetry={() => refetch()} />}
        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}>
            <Card size="small" loading={isLoading}>
              <Statistic title="Physical progress" value={dash?.physicalProgressPct ?? project.physicalProgressPct} suffix="%" precision={1} />
              <Progress percent={dash?.physicalProgressPct ?? project.physicalProgressPct} size="small" showInfo={false} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" loading={isLoading}>
              <Statistic title="Financial progress" value={finPct} suffix="%" precision={1} />
              <Progress percent={finPct} size="small" showInfo={false} strokeColor={BRAND.colors.accentDeep} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" loading={isLoading}>
              <Statistic title="Executed value" value={formatINRCompact(dash?.boqExecutedAmount)} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                of {formatINRCompact(dash?.boqTotalAmount)} BOQ
              </Typography.Text>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" loading={isLoading}>
              <Statistic title="Activities" value={dash?.activitiesCompleted ?? 0} suffix={`/ ${dash?.activitiesTotal ?? 0} done`} />
              <Typography.Text type={dash?.activitiesDelayed ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                {dash?.activitiesDelayed ?? 0} delayed
              </Typography.Text>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" loading={isLoading}>
              <Statistic title="Pending approvals" value={dash?.pendingApprovals ?? project.pendingApprovals} styles={{ content: { color: (dash?.pendingApprovals ?? 0) > 0 ? BRAND.colors.pending : undefined } }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" loading={isLoading}>
              <Statistic title="Open material requests" value={dash?.openMaterialRequests ?? 0} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" loading={isLoading}>
              <Statistic title="Last DPR" value={dash?.lastDprDate ? formatDate(dash.lastDprDate) : 'None'} styles={{ content: { fontSize: 18 } }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="Contract value" value={formatINRCompact(project.contractValue)} styles={{ content: { fontSize: 18 } }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {project.contractValue ? formatINR(project.contractValue) : '-'}
              </Typography.Text>
            </Card>
          </Col>
        </Row>

        <Card size="small" title="Planned vs executed by activity" style={{ marginTop: 16 }} loading={isLoading}>
          <Table
            size="small"
            rowKey="activityId"
            pagination={false}
            dataSource={dash?.progressByActivity ?? []}
            locale={{ emptyText: 'No activities defined yet' }}
            columns={[
              { title: 'Activity', dataIndex: 'name' },
              { title: 'Planned', dataIndex: 'plannedQty', width: 110, align: 'right', className: 'mono', render: (v) => formatQty(v) },
              { title: 'Executed', dataIndex: 'executedQty', width: 110, align: 'right', className: 'mono', render: (v) => formatQty(v) },
              { title: 'Progress', dataIndex: 'progressPct', width: 260, render: (v: number) => <Progress percent={Math.round(v * 10) / 10} size="small" status={v >= 100 ? 'success' : 'active'} /> },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Card size="small" title="Project details" style={{ marginBottom: 16 }}>
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'code', label: 'Code', children: project.code },
              { key: 'type', label: 'Type', children: <ProjectTypeTag type={project.type} /> },
              { key: 'status', label: 'Status', children: <ProjectStatusTag status={project.status} /> },
              { key: 'client', label: 'Client', children: project.clientName ?? '-' },
              { key: 'consultant', label: 'Consultant', children: project.consultantName ?? '-' },
              { key: 'wo', label: 'Work order', children: project.workOrderNo ?? '-' },
              { key: 'location', label: 'Location', children: project.location ?? '-' },
              { key: 'start', label: 'Start', children: formatDate(project.startDate) },
              { key: 'end', label: 'End', children: formatDate(project.endDate) },
              { key: 'pm', label: 'Project manager', children: project.projectManagerName ?? '-' },
              ...(project.description ? [{ key: 'desc', label: 'Description', children: project.description }] : []),
            ]}
          />
        </Card>
        <MembersCard project={project} />
      </Col>
    </Row>
  );
}

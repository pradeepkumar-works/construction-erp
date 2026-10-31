'use client';

import React from 'react';
import Link from 'next/link';
import { useProjectScope } from '@/lib/project-scope';
import dayjs from 'dayjs';
import { Col, Descriptions, Flex, Progress, Row, Statistic, Table, Typography, theme } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@/components/common/icons';
import type { ProjectDashboard, ProjectDetail } from '@erp/shared';
import { canViewCost } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProjectCost, useProjectDashboard } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact, formatPct, formatQty, toNumber } from '@/lib/format';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { QueryError } from '@/components/common/QueryState';
import { FigureBlock, Section } from '@/components/common/Section';
import { MembersCard } from './MembersCard';
import { ProjectSetup } from './ProjectSetup';
import { scheduleStatus, type ScheduleStatus } from './ProjectHealth';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "8 months left", "12 days left", "ended 3 days ago" */
function timeLeft(end: string | null): string | null {
  if (!end) return null;
  const days = dayjs(end).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (days < 0) return `ended ${plural(-days, 'day')} ago`;
  if (days === 0) return 'ends today';
  if (days > 60) return `${plural(Math.round(days / 30.4), 'month')} left`;
  return `${plural(days, 'day')} left`;
}

/** The overview's first line, in words: on track or behind, and why. */
function headline(project: ProjectDetail, s: ScheduleStatus): string {
  if (project.status === 'COMPLETED' || project.status === 'CLOSED') return 'Completed';
  if (project.status === 'ON_HOLD') return 'On hold';
  if (s.state === 'OVERRUN') return 'Past its completion date';
  if (s.state === 'FINISH_LATE') return `Plan ends ${plural(s.finishLateDays!, 'day')} after the completion date`;
  if (s.behind) return 'Behind plan';
  if (s.state === 'NO_PLAN') return 'No dated plan yet';
  if (s.late > 0) return `On track overall, ${plural(s.late, 'activity', 'activities')} late`;
  return 'On track';
}

function StatusLead({ project, dash }: { project: ProjectDetail; dash: ProjectDashboard }) {
  const { token } = theme.useToken();
  const s = scheduleStatus(project, dash);
  const against = s.planned !== null ? `${formatPct(s.planned)} planned by today` : s.elapsed !== null ? `${formatPct(s.elapsed)} of the time gone` : null;
  const left = timeLeft(project.endDate);
  const facts = [
    `${formatPct(s.done)} done${against ? `, ${against}` : ''}.`,
    dash.activitiesTotal ? `${s.late} of ${plural(dash.activitiesTotal, 'activity', 'activities')} past their finish.` : null,
    s.completionDate ? `Completion ${formatDate(s.completionDate)}${s.completionDate === project.endDate && left ? `, ${left}` : ''}.` : null,
    s.plannedFinish && s.finishLateDays !== null ? `The plan ends ${formatDate(s.plannedFinish)}.` : null,
    s.state === 'NO_PLAN' ? 'Give the activities dates, or import the schedule, on the Schedule tab.' : null,
  ].filter(Boolean);
  // Colour marks the exception only: behind is in the error text shade; on track stays neutral.
  const bad = s.behind;
  return (
    <div style={{ marginBottom: token.marginSM }} data-testid="project-status">
      <Flex align="center" gap={token.marginXS}>
        {bad ? <ExclamationCircleOutlined aria-hidden style={{ color: token.colorErrorText }} /> : <CheckCircleOutlined aria-hidden style={{ color: token.colorTextSecondary }} />}
        <Typography.Text strong style={{ fontSize: token.fontSizeLG, color: bad ? token.colorErrorText : undefined }}>
          {headline(project, s)}
        </Typography.Text>
      </Flex>
      <Typography.Text type="secondary" style={{ display: 'block' }}>
        {facts.join(' ')}
      </Typography.Text>
    </div>
  );
}

/** "today", "yesterday", "5 days ago" */
const ago = (date: string) => {
  const days = dayjs().startOf('day').diff(dayjs(date).startOf('day'), 'day');
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/**
 * The project's Overview tab: where it stands in words first, then the few figures that matter, each against
 * its plan (done against planned, work against the BOQ, billed against the contract, cost against the work), then
 * progress by activity, details and team.
 */
export function ProjectOverview({ project }: { project: ProjectDetail }) {
  const { token } = theme.useToken();
  const [, setScope] = useProjectScope();
  const { user } = useAuth();
  const seesCost = !!user && canViewCost(user.roleKey);
  const { data: dash, isLoading, error, refetch } = useProjectDashboard(project.id);
  // The same request as the header's health chips, so it costs nothing more here.
  const { data: cost, isLoading: costLoading } = useProjectCost(seesCost ? project.id : undefined, {});
  const boqTotal = toNumber(dash?.boqTotalAmount);
  const boqExec = toNumber(dash?.boqExecutedAmount);
  const contract = toNumber(project.revisedContractValue ?? project.contractValue);
  const small = { fontSize: token.fontSizeSM } as const;
  const done = dash?.physicalProgressPct ?? project.physicalProgressPct;
  const planned = dash?.plannedProgressPct ?? null;
  const behind = !!dash && scheduleStatus(project, dash).behind;
  const costPct = cost?.costPct ?? null;

  return (
    <Row gutter={[token.margin, token.margin]} style={{ padding: `0 ${token.paddingSM}px ${token.paddingSM}px` }}>
      <Col xs={24} xl={16}>
        {error && <QueryError error={error} onRetry={() => refetch()} />}
        <ProjectSetup project={project} />
        {dash && <StatusLead project={project} dash={dash} />}
        <Row gutter={[token.marginSM, token.marginSM]}>
          <Col xs={12} md={8}>
            <FigureBlock loading={isLoading}>
              <Statistic title="Progress" value={`${formatPct(done)} done`} />
              <Progress percent={done} size="small" showInfo={false} aria-label={`Physical progress ${formatPct(done)}`} />
              <Typography.Text type={behind ? 'danger' : 'secondary'} style={small}>
                {planned !== null ? `${formatPct(planned)} planned by today` : 'No planned dates to compare with'}
              </Typography.Text>
            </FigureBlock>
          </Col>
          <Col xs={12} md={8}>
            <FigureBlock loading={isLoading}>
              <Statistic title="Work done" value={formatINRCompact(boqExec)} />
              <Typography.Text type="secondary" style={small}>
                {boqTotal > 0 ? `of ${formatINRCompact(boqTotal)} BOQ, ${formatPct((boqExec / boqTotal) * 100)}` : 'No BOQ yet'}
              </Typography.Text>
            </FigureBlock>
          </Col>
          <Col xs={12} md={8}>
            {seesCost && contract > 0 ? (
              <FigureBlock loading={costLoading}>
                <Statistic title="Billed" value={formatINRCompact(cost?.billedValue)} />
                <Typography.Text type="secondary" style={small}>
                  of {formatINRCompact(contract)} contract, {formatPct((toNumber(cost?.billedValue) / contract) * 100)}
                </Typography.Text>
              </FigureBlock>
            ) : (
              <FigureBlock>
                <Statistic title="Contract value" value={formatINRCompact(project.revisedContractValue ?? project.contractValue)} />
                <Typography.Text type="secondary" style={small}>
                  {contract > 0 ? formatINR(project.revisedContractValue ?? project.contractValue) : 'Not set'}
                </Typography.Text>
              </FigureBlock>
            )}
          </Col>
          {seesCost && (
            <Col xs={12} md={8}>
              <FigureBlock loading={costLoading}>
                <Statistic title="Cost to date" value={formatINRCompact(cost?.cost.total)} />
                <Typography.Text type={costPct !== null && costPct > 100 ? 'danger' : 'secondary'} style={small}>
                  {costPct !== null ? `${formatPct(costPct)} of the work done` : 'No work done to compare with'}
                </Typography.Text>
              </FigureBlock>
            </Col>
          )}
          <Col xs={12} md={8}>
            <FigureBlock loading={isLoading}>
              <Statistic title="Activities" value={dash?.activitiesCompleted ?? 0} suffix={`/ ${dash?.activitiesTotal ?? 0} done`} />
              <Typography.Text type={dash?.activitiesDelayed ? 'danger' : 'secondary'} style={small}>
                {dash?.activitiesDelayed ? `${dash.activitiesDelayed} late` : 'None late'}
              </Typography.Text>
            </FigureBlock>
          </Col>
          <Col xs={12} md={8}>
            <FigureBlock loading={isLoading}>
              <Statistic title="Last DPR" value={dash?.lastDprDate ? formatDate(dash.lastDprDate) : 'None yet'} styles={{ content: { fontSize: token.fontSizeXL } }} />
              {dash?.lastDprDate && (
                <Typography.Text type="secondary" style={small}>
                  {ago(dash.lastDprDate)}
                </Typography.Text>
              )}
            </FigureBlock>
          </Col>
        </Row>
        {dash && (dash.pendingApprovals > 0 || dash.openMaterialRequests > 0) && (
          <p style={{ ...small, color: token.colorTextSecondary, marginTop: token.marginSM, marginBottom: 0 }}>
            Waiting on this project:{' '}
            {[
              dash.pendingApprovals > 0 ? (
                <Link key="a" href="/approvals" className="text-link" onClick={() => setScope(project.id)}>
                  {plural(dash.pendingApprovals, 'entry', 'entries')} for approval
                </Link>
              ) : null,
              dash.openMaterialRequests > 0 ? (
                <Link key="m" href={`/projects/${project.id}?tab=material`} className="text-link">
                  {plural(dash.openMaterialRequests, 'indent')} open
                </Link>
              ) : null,
            ]
              .filter(Boolean)
              .flatMap((node, i) => (i ? [' · ', node] : [node]))}
          </p>
        )}

        <Section title="Planned and done by activity" style={{ marginTop: token.margin }} loading={isLoading}>
          <Table
            size="small"
            rowKey="activityId"
            pagination={false}
            dataSource={dash?.progressByActivity ?? []}
            locale={{ emptyText: 'No activities defined yet' }}
            columns={[
              { title: 'Activity', dataIndex: 'name' },
              { title: 'Planned', dataIndex: 'plannedQty', width: 110, align: 'right', className: 'mono', render: (v) => formatQty(v) },
              { title: 'Done', dataIndex: 'executedQty', width: 110, align: 'right', className: 'mono', render: (v) => formatQty(v) },
              {
                title: 'Progress',
                dataIndex: 'progressPct',
                width: 260,
                render: (v: number) => <Progress percent={v} size="small" status={v >= 100 ? 'success' : 'active'} format={() => formatPct(v)} aria-label={`${formatPct(v)} done`} />,
              },
            ]}
          />
        </Section>
      </Col>
      <Col xs={24} xl={8}>
        <Section title="Project details" style={{ marginBottom: token.margin }}>
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'code', label: 'Code', children: project.code },
              { key: 'type', label: 'Type', children: <ProjectTypeTag type={project.type} name={project.typeName} /> },
              { key: 'status', label: 'Status', children: <ProjectStatusTag status={project.status} /> },
              { key: 'client', label: 'Client', children: project.clientName ?? '-' },
              { key: 'consultant', label: 'Consultant', children: project.consultantName ?? '-' },
              { key: 'wo', label: 'Work order', children: project.workOrderNo ?? '-' },
              { key: 'location', label: 'Location', children: project.location ?? '-' },
              ...(project.siteAddress ? [{ key: 'siteAddress', label: 'Delivery address', children: project.siteAddress }] : []),
              { key: 'start', label: 'Start date', children: formatDate(project.startDate) },
              { key: 'end', label: 'Completion date', children: formatDate(project.endDate) },
              { key: 'pm', label: 'Project manager', children: project.projectManagerName ?? '-' },
              ...(project.description ? [{ key: 'desc', label: 'Description', children: project.description }] : []),
            ]}
          />
        </Section>
        <MembersCard project={project} />
      </Col>
    </Row>
  );
}

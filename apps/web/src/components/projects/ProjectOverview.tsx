'use client';

import React from 'react';
import Link from 'next/link';
import { useProjectScope } from '@/lib/project-scope';
import dayjs from 'dayjs';
import { Col, Descriptions, Flex, Progress, Row, Table } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@/components/common/icons';
import type { BillCheckDto, BoqContractGap, DataProblemDto, FigureId, FigureInput, ProjectDashboard, ProjectDetail } from '@erp/shared';
import { canViewCost, completionBasis, completionWords, figure } from '@erp/shared';
import { tk } from '@/ds';
import { useAuth } from '@/lib/auth';
import { useProjectCost, useProjectDashboard, useProjectSetup } from '@/lib/queries';
import { formatDate, formatINRCompact, formatPct, formatQty, toNumber, plural } from '@/lib/format';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { CustomFieldsSection } from '@/components/custom-fields/CustomFieldsSection';
import { Figures } from '@/components/figures';
import { CheckRows } from '@/components/checks/ChecksSection';
import { MembersCard } from './MembersCard';
import { ProjectSetup } from './ProjectSetup';
import { projectHeadline, scheduleStatus, useProjectHealth, type HealthSignal } from './ProjectHealth';

/** "8 months left", "12 days left", "ended 3 days ago" */
function timeLeft(end: string | null): string | null {
  if (!end) return null;
  const days = dayjs(end).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (days < 0) return `ended ${plural(-days, 'day')} ago`;
  if (days === 0) return 'ends today';
  if (days > 60) return `${plural(Math.round(days / 30.4), 'month')} left`;
  return `${plural(days, 'day')} left`;
}

/** "today", "yesterday", "5 days ago" */
const ago = (date: string) => {
  const days = dayjs().startOf('day').diff(dayjs(date).startOf('day'), 'day');
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/** The completion date a project is held to, with its basis; the Schedule tab says it the same way. */
const completionOf = (project: ProjectDetail, dash: ProjectDashboard | undefined) => completionBasis(project.endDate, dash?.extensionDays ?? 0);

const LEAD_INK: Record<HealthSignal['level'], string> = {
  error: tk.color.tone.danger.fg,
  warning: tk.color.tone.pending.fg,
  success: tk.color.text.strong,
  default: tk.color.text.strong,
};

/** The overview's first line, from the same signals as the header's chips, then the dates it rests on. */
function StatusLead({ project, dash, signals }: { project: ProjectDetail; dash: ProjectDashboard; signals: HealthSignal[] }) {
  const s = scheduleStatus(project, dash);
  const head = projectHeadline(project.status, signals);
  const completion = completionOf(project, dash);
  const when = completionWords(completion, formatDate);
  const left = timeLeft(completion.date);
  const facts = [
    when ? `Completion date ${when}${left ? `, ${left}` : ''}.` : null,
    s.plannedFinish && s.finishLateDays !== null ? `The plan ends ${formatDate(s.plannedFinish)}.` : null,
    s.state === 'NO_PLAN' ? 'Give the activities dates, or import the schedule, on the Schedule tab.' : null,
    dash.lastDprDate ? `Last daily report ${ago(dash.lastDprDate)}.` : 'No daily report yet.',
  ].filter(Boolean);
  // Colour marks the exception only: red for what is late, amber for what to watch; on track stays in ink.
  const ink = LEAD_INK[head.level];
  return (
    <div style={{ marginBottom: tk.space[3] }} data-testid="project-status">
      <Flex align="center" gap={tk.space[2]}>
        {head.level === 'success' ? <CheckCircleOutlined aria-hidden style={{ color: tk.color.text.muted }} /> : <ExclamationCircleOutlined aria-hidden style={{ color: head.level === 'default' ? tk.color.text.muted : ink }} />}
        <span style={{ ...tk.type.lead, fontWeight: tk.type.strong.fontWeight, color: ink }}>{head.text}</span>
      </Flex>
      <p style={{ ...tk.type.body, color: tk.color.text.muted, margin: 0 }}>{facts.join(' ')}</p>
    </div>
  );
}

/** What a data problem means for the figures, in the few words a figure carries under it. */
function caveatOf(p: DataProblemDto, gap: BoqContractGap | null): string {
  switch (p.key) {
    case 'boqOffContract':
      return gap ? `BOQ ${Math.abs(gap.gapPct)}% ${gap.gapPct < 0 ? 'below' : 'above'} the contract value` : 'BOQ off the contract value';
    case 'boqItemsWithoutActivity':
      return `${plural(p.count ?? 0, 'BOQ item')} with no activity, not counted`;
    case 'activitiesUndated':
      return `${plural(p.count ?? 0, 'activity', 'activities')} with no dates left out of the plan`;
    case 'openingMissing':
      return 'No opening cost: leaves out what was spent before Nirmaan';
  }
}

/** A data problem as a record's check: what is wrong, what it does to the figures, and where to put it right. */
function checkOf(p: DataProblemDto, gap: BoqContractGap | null, projectId: string): BillCheckDto {
  const href = `/projects/${projectId}?tab=${p.tab}`;
  const base = { key: p.key, ok: false, accepted: null };
  switch (p.key) {
    case 'boqOffContract':
      return {
        ...base,
        title: gap
          ? `The BOQ adds up to ${formatINRCompact(gap.boqTotal)}, ${Math.abs(gap.gapPct)}% ${gap.gapPct < 0 ? 'below' : 'above'} the ${formatINRCompact(gap.contractValue)} contract value`
          : 'The BOQ does not add up to the contract value',
        detail: 'Work done is counted at BOQ rates, so work done, billed and cost against it are off until the two agree.',
        links: [{ label: 'Open the BOQ', href }],
      };
    case 'boqItemsWithoutActivity':
      return {
        ...base,
        title: `${plural(p.count ?? 0, 'BOQ item has', 'BOQ items have')} no activity`,
        detail: 'Work on them is never recorded, so progress and work done read low.',
        links: [{ label: 'Link them on Activities', href }],
      };
    case 'activitiesUndated':
      return {
        ...base,
        title: `${plural(p.count ?? 0, 'activity has', 'activities have')} no planned start or finish`,
        detail: 'What is planned by today leaves them out, so progress against the plan is off.',
        links: [{ label: 'Give them dates on the Schedule tab', href }],
      };
    case 'openingMissing':
      return {
        ...base,
        title: 'The project ran before it came on Nirmaan and has no opening cost',
        detail: 'Cost counts only what was recorded since, so cost reads low and margin high until the cost run up before is recorded.',
        links: [{ label: 'Record it on the Budget tab', href }],
      };
  }
}

/**
 * The project's Overview tab: where it stands in words first, then the few figures that matter, each against what it
 * should be (done against planned, work against the BOQ, billed and cost against the work), then what is wrong with the
 * records behind them, which stands until it is fixed, then progress by activity, details and team.
 */
export function ProjectOverview({ project }: { project: ProjectDetail }) {
  const [, setScope] = useProjectScope();
  const { user } = useAuth();
  const seesCost = !!user && canViewCost(user.roleKey);
  const signals = useProjectHealth(project);
  const { data: dash, isLoading, error, refetch } = useProjectDashboard(project.id);
  // The same requests as the header's health chips and the BOQ tab, so they cost nothing more here.
  const { data: cost, isLoading: costLoading } = useProjectCost(seesCost ? project.id : undefined, {});
  const { data: setup } = useProjectSetup(project.id);
  const problems = setup?.problems ?? [];
  const gap = setup?.boqGap ?? null;
  const caveat = (id: FigureId) => {
    const words = problems.filter((p) => p.affects.includes(id)).map((p) => caveatOf(p, gap));
    return words.length ? words.join('; ') : undefined;
  };
  const verdict = (key: HealthSignal['key']) => {
    const level = signals.find((s) => s.key === key)?.level;
    return level === 'error' ? ('act' as const) : level === 'warning' ? ('watch' as const) : undefined;
  };

  const figures = ((): FigureInput[] | undefined => {
    if (!dash || (seesCost && costLoading)) return undefined;
    const done = dash.physicalProgressPct;
    const planned = dash.plannedProgressPct ?? null;
    const boqTotal = toNumber(dash.boqTotalAmount);
    const executed = toNumber(cost?.executedValue);
    const contract = toNumber(project.revisedContractValue ?? project.contractValue);
    return [
      planned !== null ? figure('physicalProgress', done, { versus: { plan: planned }, caveat: caveat('physicalProgress') }) : figure('physicalProgress', done, { caveat: caveat('physicalProgress') }),
      boqTotal > 0
        ? figure('workDone', dash.boqExecutedAmount, { when: 'toDate', versus: { of: figure('boqValue', boqTotal) }, caveat: caveat('workDone') })
        : figure('workDone', { none: 'No BOQ yet' }, { when: 'toDate' }),
      cost
        ? executed > 0
          ? figure('billed', cost.billedValue, { when: 'toDate', versus: { of: figure('workDone', executed) }, attention: verdict('billing'), caveat: caveat('billed') })
          : figure('billed', cost.billedValue, { when: 'toDate' })
        : figure('contractValue', contract > 0 ? contract : { none: 'Not set yet' }),
      cost &&
        (executed > 0
          ? figure('cost', cost.cost.total, { when: 'toDate', versus: { of: figure('workDone', executed) }, attention: verdict('cost'), caveat: caveat('cost') })
          : figure('cost', cost.cost.total, { when: 'toDate', caveat: caveat('cost') })),
      dash.activitiesTotal > 0 && figure('delayedActivities', dash.activitiesDelayed, { versus: { of: dash.activitiesTotal } }),
    ];
  })();

  return (
    <Row gutter={[16, 16]} style={{ padding: `0 ${tk.space[3]} ${tk.space[3]}` }}>
      <Col xs={24} xl={16}>
        {error && <QueryError error={error} onRetry={() => refetch()} />}
        {dash && <StatusLead project={project} dash={dash} signals={signals} />}
        {!error && <Figures bare label="Project figures" figures={figures} scope={{ projectId: project.id }} />}
        {problems.length > 0 && (
          <Section title="Checks" style={{ marginTop: tk.space[4] }}>
            <div data-testid="project-checks">
              <CheckRows checks={problems.map((p) => checkOf(p, gap, project.id))} />
            </div>
          </Section>
        )}
        <ProjectSetup project={project} />
        {dash && (dash.pendingApprovals > 0 || dash.openMaterialRequests > 0) && (
          <p style={{ ...tk.type.caption, color: tk.color.text.muted, marginTop: tk.space[3], marginBottom: 0 }}>
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

        <Section title="Planned and done by activity" style={{ marginTop: tk.space[4] }} loading={isLoading}>
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
        <Section title="Project details" style={{ marginBottom: tk.space[4] }}>
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
              { key: 'end', label: 'Completion date', children: completionWords(completionOf(project, dash), formatDate) ?? formatDate(project.endDate) },
              { key: 'pm', label: 'Project manager', children: project.projectManagerName ?? '-' },
              ...(project.description ? [{ key: 'desc', label: 'Description', children: project.description }] : []),
            ]}
          />
        </Section>
        <CustomFieldsSection entity="PROJECT" values={project.customValues} oneColumn style={{ marginBottom: tk.space[4] }} />
        <MembersCard project={project} />
      </Col>
    </Row>
  );
}

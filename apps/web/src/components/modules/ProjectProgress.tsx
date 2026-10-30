'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Flex, Grid, Row, Segmented, Table, Typography, theme } from 'antd';
import type { TableColumnsType } from 'antd';
import { PROJECT_STATUS_LABELS, canSeeNav, navNode, progressNotes, type ModuleProgressDto, type ProjectProgressDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useModuleHome } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { BRAND } from '@/lib/brand';
import { useAppearance } from '@/lib/appearance';
import { formatDate, formatINRCompact, formatPct, toNumber } from '@/lib/format';
import { ProjectStatusTag } from '@/components/common/StatusTag';
import { QueryError } from '@/components/common/QueryState';
import { kpiColumns } from '@/components/home/KpiTile';
import { ModuleFigure } from './ModuleFigure';

type View = 'chart' | 'table';
/** Rows shown before Show all */
const FIRST = 12;

function useProgressColors() {
  const { dark } = useAppearance();
  const c = BRAND.colors;
  return dark ? { physical: c.progressPhysicalNight, financial: c.progressFinancialNight } : { physical: c.progressPhysical, financial: c.progressFinancial };
}

/** One percentage against 100 (a meter): the track is the whole job, the bar what is done; the tick, where the plan stands today. */
function Meter({ pct, color, planned }: { pct: number; color: string; planned?: number | null }) {
  const { token } = theme.useToken();
  const d = Math.max(0, Math.min(100, pct));
  const p = planned === null || planned === undefined ? null : Math.max(0, Math.min(100, planned));
  return (
    <span aria-hidden style={{ position: 'relative', display: 'block', height: 14, minWidth: 64 }}>
      <span style={{ position: 'absolute', insetInline: 0, top: 3, height: 8, borderRadius: 4, background: token.colorFillSecondary }} />
      <span style={{ position: 'absolute', insetInlineStart: 0, top: 3, height: 8, width: `${d}%`, minWidth: d > 0 ? 4 : 0, borderRadius: 4, background: color }} />
      {p !== null && <span style={{ position: 'absolute', top: 0, height: 14, width: 2, insetInlineStart: `calc(${p}% - 1px)`, background: token.colorText, borderRadius: 1 }} />}
    </span>
  );
}

/** A meter with its name on the left and its figure on the right, in text colours (the bar carries the colour). */
function MeterLine({ label, pct, color, planned }: { label: string; pct: number | null; color: string; planned?: number | null }) {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '68px minmax(0, 1fr) 44px', alignItems: 'center', gap: token.marginXS }}>
      <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{label}</span>
      {pct === null ? (
        <span style={{ fontSize: token.fontSizeSM, color: token.colorTextTertiary }}>No contract value</span>
      ) : (
        <Meter pct={pct} color={color} planned={planned} />
      )}
      <span className="mono" translate="no" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pct === null ? '' : formatPct(pct)}
      </span>
    </div>
  );
}

/** What the two bars stand for, said once above them. */
function Legend({ seesFinancial }: { seesFinancial: boolean }) {
  const { token } = theme.useToken();
  const colors = useProgressColors();
  const swatch = (color: string) => <span aria-hidden style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 4, background: color, marginInlineEnd: token.marginXXS }} />;
  const item: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', fontSize: token.fontSizeSM, color: token.colorTextSecondary };
  return (
    <Flex wrap gap={`${token.marginXXS}px ${token.marginMD}px`} style={{ marginBottom: token.marginSM }}>
      <span style={item}>{swatch(colors.physical)}Physical: work done, by value</span>
      <span style={item}>
        <span aria-hidden style={{ display: 'inline-block', width: 2, height: 12, borderRadius: 1, background: token.colorText, marginInlineEnd: token.marginXXS }} />
        Planned by today
      </span>
      {seesFinancial && <span style={item}>{swatch(colors.financial)}Financial: approved RA bills against contract</span>}
    </Flex>
  );
}

/** One project: its name, its two bars and what they say together. The whole row opens the project. */
function ProjectRow({ p, seesFinancial }: { p: ProjectProgressDto; seesFinancial: boolean }) {
  const { token } = theme.useToken();
  const colors = useProgressColors();
  const notes = progressNotes(p);
  return (
    <li style={{ borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` }}>
      <Link href={`/projects/${p.projectId}`} style={{ display: 'block', minHeight: 44, padding: `${token.paddingSM}px 0`, color: 'inherit' }}>
        <Flex align="center" justify="space-between" gap={token.marginXS} style={{ marginBottom: token.marginXS }}>
          <Typography.Text ellipsis style={{ minWidth: 0 }}>
            <span className="mono" translate="no" style={{ color: token.colorLink }}>
              {p.code}
            </span>{' '}
            <span translate="no">{p.name}</span>
          </Typography.Text>
          {p.status !== 'ACTIVE' && <ProjectStatusTag status={p.status} />}
        </Flex>
        <Flex vertical gap={token.marginXXS}>
          <MeterLine label="Physical" pct={p.physicalPct} planned={p.plannedPct} color={colors.physical} />
          {seesFinancial && <MeterLine label="Financial" pct={p.financialPct} color={colors.financial} />}
        </Flex>
        <div style={{ fontSize: token.fontSizeSM, marginTop: token.marginXXS, color: token.colorTextSecondary }}>
          {p.plannedPct === null ? 'No dated activities to plan against' : <>Planned by today <span translate="no">{formatPct(p.plannedPct)}</span></>}
          {notes.map((n) => (
            <span key={n.key} style={{ color: token.colorWarningText }}>
              {' · '}
              {n.text}
            </span>
          ))}
        </div>
      </Link>
    </li>
  );
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
/** Earlier dates first, projects without one last. */
const byDate = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b));
/** Days the schedule's planned finish runs past the revised completion date; 0 when it does not. */
const planLate = (p: ProjectProgressDto) =>
  p.planFinish && p.revisedEndDate && !p.completedOn ? Math.max(0, Math.round((Date.parse(p.planFinish) - Date.parse(p.revisedEndDate)) / 86_400_000)) : 0;

/**
 * The same figures as a table, to sort and read exactly, with each project's contract dates: start, completion, the
 * extensions of time granted in the delay register, the revised completion, the schedule's planned finish and the time left.
 */
function ProgressTable({ data }: { data: ModuleProgressDto }) {
  const { token } = theme.useToken();
  const router = useRouter();
  // The project stays in view while the dates scroll by, where there is room for it to
  const wide = Grid.useBreakpoint().md;
  const num = (a: number | null, b: number | null) => (a ?? -1) - (b ?? -1);
  const pct = (v: number | null) => (
    <span className="mono" translate="no">
      {formatPct(v)}
    </span>
  );
  const date = (v: string | null) => (
    <span translate="no" style={{ whiteSpace: 'nowrap' }}>
      {v ? formatDate(v) : '–'}
    </span>
  );
  const money = (v: string | null) => (
    <span className="mono" translate="no" style={{ whiteSpace: 'nowrap' }}>
      {v === null ? '–' : formatINRCompact(v)}
    </span>
  );
  const sub = (children: React.ReactNode, color: string = token.colorTextSecondary) => (
    <div style={{ fontSize: token.fontSizeSM, color, whiteSpace: 'nowrap' }}>{children}</div>
  );
  const columns: TableColumnsType<ProjectProgressDto> = [
    {
      key: 'project',
      title: 'Project',
      fixed: wide ? 'left' : undefined,
      width: 200,
      sorter: (a, b) => a.code.localeCompare(b.code),
      render: (_, p) => (
        <div style={{ minWidth: 0 }}>
          <Link href={`/projects/${p.projectId}`} className="mono" translate="no" onClick={(e) => e.stopPropagation()}>
            {p.code}
          </Link>
          <Typography.Text type="secondary" ellipsis={{ tooltip: p.name }} translate="no" style={{ display: 'block', maxWidth: 180, fontSize: token.fontSizeSM }}>
            {p.name}
          </Typography.Text>
        </div>
      ),
    },
    { key: 'status', title: 'Status', width: 96, render: (_, p) => PROJECT_STATUS_LABELS[p.status] },
    {
      key: 'progress',
      title: 'Progress',
      children: [
        { key: 'physical', title: 'Physical', align: 'right', width: 96, sorter: (a, b) => a.physicalPct - b.physicalPct, render: (_, p) => pct(p.physicalPct) },
        { key: 'planned', title: 'Planned by today', align: 'right', width: 124, sorter: (a, b) => num(a.plannedPct, b.plannedPct), render: (_, p) => pct(p.plannedPct) },
        ...(data.seesFinancial
          ? ([{ key: 'financial', title: 'Financial', align: 'right', width: 100, sorter: (a, b) => num(a.financialPct, b.financialPct), render: (_, p) => pct(p.financialPct) }] satisfies TableColumnsType<ProjectProgressDto>)
          : []),
        { key: 'timeUsed', title: 'Time used', align: 'right', width: 100, sorter: (a, b) => num(a.timeUsedPct, b.timeUsedPct), render: (_, p) => pct(p.timeUsedPct) },
      ],
    },
    {
      key: 'dates',
      title: 'Contract dates',
      children: [
        { key: 'start', title: 'Start', width: 120, sorter: (a, b) => byDate(a.startDate, b.startDate), render: (_, p) => date(p.startDate) },
        { key: 'end', title: 'Completion', width: 128, sorter: (a, b) => byDate(a.endDate, b.endDate), render: (_, p) => date(p.endDate) },
        {
          key: 'eot',
          title: 'EOT',
          align: 'right',
          width: 132,
          sorter: (a, b) => a.eotDays - b.eotDays,
          render: (_, p) => (
            <>
              <span className="mono" translate="no" style={{ whiteSpace: 'nowrap' }}>
                {p.eotCount ? days(p.eotDays) : '–'}
              </span>
              {p.eotCount > 1 && sub(`${p.eotCount} extensions`)}
              {p.eotPending > 0 && sub(`${p.eotPending} ${p.eotPending === 1 ? 'claim' : 'claims'} pending`)}
            </>
          ),
        },
        {
          key: 'revisedEnd',
          title: 'Revised completion',
          width: 150,
          sorter: (a, b) => byDate(a.revisedEndDate, b.revisedEndDate),
          render: (_, p) => date(p.revisedEndDate),
        },
        {
          key: 'planFinish',
          title: 'Plan ends',
          width: 140,
          sorter: (a, b) => byDate(a.planFinish, b.planFinish),
          render: (_, p) => {
            const late = planLate(p);
            return (
              <>
                {date(p.planFinish)}
                {late > 0 && sub(`${days(late)} after completion`, token.colorWarningText)}
              </>
            );
          },
        },
        {
          key: 'timeLeft',
          title: 'Time left',
          align: 'right',
          width: 116,
          sorter: (a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity),
          render: (_, p) =>
            p.completedOn ? (
              <>
                Handed over
                {sub(<span translate="no">{formatDate(p.completedOn)}</span>)}
              </>
            ) : p.daysLeft === null ? (
              '–'
            ) : p.daysLeft < 0 ? (
              <span style={{ color: token.colorErrorText, whiteSpace: 'nowrap' }}>
                <span translate="no">{days(-p.daysLeft)}</span> over
              </span>
            ) : (
              <span translate="no" style={{ whiteSpace: 'nowrap' }}>
                {days(p.daysLeft)}
              </span>
            ),
        },
      ],
    },
    ...(data.seesFinancial
      ? ([
          {
            key: 'value',
            title: 'Value',
            children: [
              { key: 'billed', title: 'Billed', align: 'right', width: 104, sorter: (a, b) => toNumber(a.billed) - toNumber(b.billed), render: (_, p) => money(p.billed) },
              { key: 'contract', title: 'Contract', align: 'right', width: 108, sorter: (a, b) => toNumber(a.contractValue) - toNumber(b.contractValue), render: (_, p) => money(p.contractValue) },
            ],
          },
        ] satisfies TableColumnsType<ProjectProgressDto>)
      : []),
  ];
  return (
    <Table<ProjectProgressDto>
      size="small"
      bordered
      rowKey="projectId"
      dataSource={data.projects}
      columns={columns}
      pagination={false}
      scroll={{ x: data.seesFinancial ? 1714 : 1402 }}
      rowClassName={() => 'row-click'}
      onRow={(p) => ({ onClick: () => router.push(`/projects/${p.projectId}`) })}
    />
  );
}

/**
 * Progress by project on the Projects screen (`project-progress.ts`): each contract project's physical progress against
 * the plan and, for those who see bills, its financial progress, on one 0–100 scale so the projects compare at a glance,
 * with Chart / Table to read the same figures as a table.
 */
export function ProjectProgress({ data }: { data: ModuleProgressDto }) {
  const { token } = theme.useToken();
  const [view, setView] = useState<View>('chart');
  const [all, setAll] = useState(false);
  if (!data.projects.length) return null;
  const shown = all ? data.projects : data.projects.slice(0, FIRST);
  return (
    <Card
      size="small"
      title="Progress by project"
      extra={
        <Segmented<View>
          size="small"
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
          aria-label="Show progress by project as"
        />
      }
    >
      {view === 'table' ? (
        <ProgressTable data={data} />
      ) : (
        <>
          <Legend seesFinancial={data.seesFinancial} />
          <ul aria-label="Projects" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', columnGap: token.marginXL }}>
            {shown.map((p) => (
              <ProjectRow key={p.projectId} p={p} seesFinancial={data.seesFinancial} />
            ))}
          </ul>
          {data.projects.length > FIRST && (
            <Button type="link" onClick={() => setAll(!all)} style={{ paddingInline: 0, marginTop: token.marginXS }}>
              {all ? 'Show fewer' : `Show all ${data.projects.length} projects`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * The same figures and progress on a department's screen (Menu and names) that holds the projects, such as Project
 * management: read from the Projects module's figures, for the header's project or every project the caller sees.
 */
export function ProjectProgressPanel() {
  const { user } = useAuth();
  const [projectId] = useProjectScope();
  const projects = navNode('projects');
  const allowed = !!user && !!projects && canSeeNav(user, projects);
  const { data, error, refetch } = useModuleHome('projects', projectId, allowed);
  const screens = Grid.useBreakpoint();
  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data?.progress?.projects.length) return null;
  const perRow = kpiColumns(data.figures.length, screens);
  return (
    <Flex vertical gap={16}>
      <section aria-label="Project figures">
        <Row gutter={[16, 16]}>
          {data.figures.map((f) => (
            <Col key={f.key} flex={`0 0 ${100 / perRow}%`}>
              <ModuleFigure f={f} />
            </Col>
          ))}
        </Row>
      </section>
      <ProjectProgress data={data.progress} />
    </Flex>
  );
}
